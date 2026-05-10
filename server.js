import "dotenv/config";

import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

import { DeepgramTranscriber } from "./transcribers/deepgram.js";
import { OfflineTranscriber } from "./transcribers/offline-nemotron.js";
import { ModelManager } from "./models/manager.js";
import { SessionsStore } from "./sessions/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const MODEL_DIR = process.env.MODEL_DIR || path.join(__dirname, ".models");
const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, ".sessions");

const modelManager = new ModelManager({ rootDir: MODEL_DIR });
const sessionsStore = new SessionsStore({ rootDir: SESSIONS_DIR });

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", async (_req, res) => {
  const offlineStatus = await modelManager.status();
  res.json({
    ok: true,
    deepgramConfigured: Boolean(DEEPGRAM_API_KEY),
    offlineModelReady: offlineStatus.ready,
    offlineModelDir: offlineStatus.modelDir
  });
});

app.get("/api/model/status", async (_req, res) => {
  const status = await modelManager.status();
  res.json(status);
});

app.get("/api/modes", (_req, res) => {
  res.json({
    online: { available: Boolean(DEEPGRAM_API_KEY), provider: "deepgram" },
    offline: { available: true, provider: "nemotron-streaming-0.6b-int8" }
  });
});

app.get("/api/sessions", async (req, res) => {
  try {
    const summaries = await sessionsStore.list({ q: req.query.q });
    res.json({ sessions: summaries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  try {
    const session = await sessionsStore.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const session = await sessionsStore.create(req.body || {});
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/sessions/:id", async (req, res) => {
  try {
    const session = await sessionsStore.update(req.params.id, req.body || {});
    res.json(session);
  } catch (error) {
    if (error.code === "NOT_FOUND") {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/sessions/:id", async (req, res) => {
  try {
    await sessionsStore.delete(req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function makeEmitter(clientWs) {
  return (payload) => sendJson(clientWs, payload);
}

wss.on("connection", (clientWs) => {
  let transcriber = null;
  let downloadCancelled = false;

  function destroyTranscriber() {
    if (!transcriber) {
      return;
    }
    try {
      transcriber.cleanup?.();
    } catch {}
    transcriber = null;
  }

  async function handleStart(payload) {
    const mode = payload.mode === "offline" ? "offline" : "online";
    destroyTranscriber();

    const emit = makeEmitter(clientWs);

    if (mode === "offline") {
      const status = await modelManager.status();
      if (!status.ready) {
        sendJson(clientWs, {
          type: "error",
          message: "Offline model is not ready. Download it before starting captions."
        });
        sendJson(clientWs, { type: "closed", reason: "Model missing." });
        return;
      }
      transcriber = new OfflineTranscriber({ modelManager, emit });
      await transcriber.start();
      return;
    }

    const apiKey = (payload.apiKey && String(payload.apiKey).trim()) || DEEPGRAM_API_KEY;
    if (!apiKey) {
      sendJson(clientWs, {
        type: "error",
        message: "No Deepgram API key. Add one in Settings or set DEEPGRAM_API_KEY."
      });
      sendJson(clientWs, { type: "closed", reason: "Deepgram key missing." });
      return;
    }

    transcriber = new DeepgramTranscriber({ apiKey, emit });
    transcriber.start(payload.config || {});
  }

  async function handleModelStatus() {
    const status = await modelManager.status();
    sendJson(clientWs, { type: "model_status", payload: status });
  }

  async function handleModelDownload() {
    if (modelManager.activeDownload) {
      sendJson(clientWs, {
        type: "error",
        message: "A model download is already running."
      });
      return;
    }

    downloadCancelled = false;

    try {
      await modelManager.download({
        onProgress: (progress) => {
          sendJson(clientWs, { type: "model_download_progress", payload: progress });
        }
      });

      if (downloadCancelled) {
        sendJson(clientWs, { type: "model_download_cancelled" });
        return;
      }

      const status = await modelManager.status();
      sendJson(clientWs, { type: "model_download_complete", payload: status });
    } catch (error) {
      sendJson(clientWs, {
        type: "model_download_error",
        message: error.message || "Model download failed."
      });
    }
  }

  function handleModelCancelDownload() {
    downloadCancelled = true;
    modelManager.cancelDownload();
  }

  clientWs.on("message", (message, isBinary) => {
    if (isBinary) {
      transcriber?.sendAudio?.(message);
      return;
    }

    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      sendJson(clientWs, { type: "error", message: "Invalid client message." });
      return;
    }

    switch (payload.type) {
      case "start":
        handleStart(payload).catch((error) => {
          sendJson(clientWs, { type: "error", message: error.message });
        });
        return;
      case "stop":
        if (transcriber) {
          transcriber.stop();
        } else {
          sendJson(clientWs, { type: "stopped" });
        }
        return;
      case "model_status":
        handleModelStatus().catch((error) => {
          sendJson(clientWs, { type: "error", message: error.message });
        });
        return;
      case "model_download":
        handleModelDownload();
        return;
      case "model_cancel_download":
        handleModelCancelDownload();
        return;
      default:
        sendJson(clientWs, {
          type: "error",
          message: `Unknown message type: ${payload.type}`
        });
    }
  });

  clientWs.on("close", () => {
    destroyTranscriber();
  });

  clientWs.on("error", () => {
    destroyTranscriber();
  });
});

function startServer(port = DEFAULT_PORT, attempt = 0) {
  server.listen(port, HOST, () => {
    const address = server.address();
    const selectedPort = typeof address === "object" && address ? address.port : port;
    console.log(`Tacet captions app running on http://${HOST}:${selectedPort}`);
    console.log(`Offline model dir: ${MODEL_DIR}`);
  });

  server.once("error", (error) => {
    if ((error.code === "EADDRINUSE" || error.code === "EPERM") && attempt < 10) {
      startServer(port + 1, attempt + 1);
      return;
    }

    throw error;
  });
}

startServer();

import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, session, shell } from "electron";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withSherpaEnv } from "../scripts/native-env.js";

const require = createRequire(import.meta.url);
const { initMain: initLoopbackAudio } = require("electron-audio-loopback");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.cjs");
const logoPath = path.join(projectRoot, "public", "assets", "tacet-logo.png");

initLoopbackAudio();
app.setName("Tacet");

let serverProcess = null;
let mainWindow = null;
let appUrl = null;

function getNodeRuntime() {
  return process.env.npm_node_execpath || process.env.NODE || "node";
}

function parseServerUrl(output) {
  const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
  return match?.[0] || null;
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const modelDir = path.join(app.getPath("userData"), "models");
    const sessionsDir = path.join(app.getPath("userData"), "sessions");
    const baseEnv = {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: process.env.PORT || "0",
      MODEL_DIR: modelDir,
      SESSIONS_DIR: sessionsDir
    };

    serverProcess = spawn(getNodeRuntime(), ["server.js"], {
      cwd: projectRoot,
      env: withSherpaEnv(baseEnv, projectRoot),
      stdio: ["ignore", "pipe", "pipe"]
    });

    const startupTimer = setTimeout(() => {
      reject(new Error("The local transcription server did not start in time."));
    }, 8000);

    serverProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      console.log(text.trimEnd());
      const detectedUrl = parseServerUrl(text);

      if (detectedUrl) {
        clearTimeout(startupTimer);
        appUrl = detectedUrl;
        resolve(detectedUrl);
      }
    });

    serverProcess.stderr.on("data", (chunk) => {
      console.error(chunk.toString().trimEnd());
    });

    serverProcess.on("error", (error) => {
      clearTimeout(startupTimer);
      reject(error);
    });

    serverProcess.on("exit", (code) => {
      if (code && !appUrl) {
        clearTimeout(startupTimer);
        reject(new Error(`The local transcription server exited with code ${code}.`));
      }
    });
  });
}

async function createMainWindow(url) {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = new Set([
      "media",
      "display-capture",
      "clipboard-read",
      "clipboard-sanitized-write"
    ]);
    callback(allowedPermissions.has(permission));
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "Tacet",
    icon: logoPath,
    backgroundColor: "#080b10",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    shell.openExternal(nextUrl);
    return { action: "deny" };
  });

  await mainWindow.loadURL(url);
}

ipcMain.handle("desktop-capture:get-sources", async () => {
  return desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: {
      width: 320,
      height: 180
    },
    fetchWindowIcons: true
  });
});

function stopLocalServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  serverProcess.kill();
  serverProcess = null;
}

app.whenReady().then(async () => {
  try {
    app.dock?.setIcon(logoPath);
    const url = await startLocalServer();
    await createMainWindow(url);
  } catch (error) {
    dialog.showErrorBox("Unable to start app", error.message);
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length || !appUrl) {
    return;
  }

  await createMainWindow(appUrl);
});

app.on("window-all-closed", () => {
  stopLocalServer();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopLocalServer();
});

import { WebSocket } from "ws";

const KEEPALIVE_INTERVAL_MS = 8000;
const FINALIZE_DRAIN_MS = 450;

function buildDeepgramUrl(config = {}) {
  const params = new URLSearchParams({
    model: config.model || "nova-3",
    language: config.language || "en-US",
    encoding: "linear16",
    sample_rate: String(config.sampleRate || 16000),
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    endpointing: String(config.endpointing ?? 700),
    utterance_end_ms: String(config.utteranceEndMs ?? 1000),
    vad_events: "true"
  });

  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export class DeepgramTranscriber {
  constructor({ apiKey, emit }) {
    if (!apiKey) {
      throw new Error("Missing DEEPGRAM_API_KEY on the server.");
    }
    this.apiKey = apiKey;
    this.emit = emit;
    this.dgWs = null;
    this.keepAliveTimer = null;
    this.finalizeTimer = null;
  }

  start(config = {}) {
    this.cleanup();

    this.dgWs = new WebSocket(buildDeepgramUrl(config), {
      headers: { Authorization: `Token ${this.apiKey}` }
    });

    this.dgWs.on("open", () => {
      this.emit({ type: "ready", mode: "online" });

      this.keepAliveTimer = setInterval(() => {
        if (this.dgWs?.readyState === WebSocket.OPEN) {
          this.dgWs.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, KEEPALIVE_INTERVAL_MS);
    });

    this.dgWs.on("message", (data, isBinary) => {
      if (isBinary) {
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        this.emit({ type: "error", message: "Unable to parse Deepgram response." });
        return;
      }

      this.handleDeepgramMessage(parsed);
    });

    this.dgWs.on("close", (_code, reason) => {
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
      this.emit({ type: "closed", reason: reason?.toString() || "Connection closed." });
    });

    this.dgWs.on("error", (error) => {
      this.emit({ type: "error", message: error.message || "Deepgram WebSocket error." });
    });
  }

  handleDeepgramMessage(payload) {
    if (payload.type === "Results") {
      const transcript = payload.channel?.alternatives?.[0]?.transcript?.trim();
      if (!transcript) {
        return;
      }
      this.emit({
        type: "transcript",
        text: transcript,
        isFinal: Boolean(payload.is_final),
        speechFinal: Boolean(payload.speech_final),
        timestamp: Date.now()
      });
      return;
    }

    if (payload.type === "UtteranceEnd") {
      this.emit({ type: "utterance_end", timestamp: Date.now() });
    }
  }

  sendAudio(buffer) {
    if (this.dgWs?.readyState === WebSocket.OPEN) {
      this.dgWs.send(buffer);
    }
  }

  stop() {
    if (this.dgWs?.readyState === WebSocket.OPEN) {
      this.dgWs.send(JSON.stringify({ type: "Finalize" }));
      this.finalizeTimer = setTimeout(() => {
        this.cleanup();
        this.emit({ type: "stopped" });
      }, FINALIZE_DRAIN_MS);
    } else {
      this.cleanup();
      this.emit({ type: "stopped" });
    }
  }

  cleanup() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.finalizeTimer) {
      clearTimeout(this.finalizeTimer);
      this.finalizeTimer = null;
    }
    if (this.dgWs && this.dgWs.readyState === WebSocket.OPEN) {
      this.dgWs.close();
    }
    this.dgWs = null;
  }
}

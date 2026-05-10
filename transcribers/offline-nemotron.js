import { OFFLINE_MODEL } from "../models/registry.js";

let sherpaModule = null;
let sharedRecognizer = null;
let sharedRecognizerKey = null;

async function loadSherpa() {
  if (sherpaModule) {
    return sherpaModule;
  }
  try {
    sherpaModule = await import("sherpa-onnx-node");
    return sherpaModule;
  } catch (error) {
    throw new Error(
      "sherpa-onnx-node is not installed. Run `npm install sherpa-onnx-node` to enable offline mode."
    );
  }
}

function int16BufferToFloat32(buffer) {
  const view = new Int16Array(
    buffer.buffer,
    buffer.byteOffset,
    Math.floor(buffer.byteLength / 2)
  );
  const out = new Float32Array(view.length);
  for (let i = 0; i < view.length; i += 1) {
    const sample = view[i];
    out[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }
  return out;
}

async function getRecognizer(modelPaths) {
  const key = JSON.stringify(modelPaths);
  if (sharedRecognizer && sharedRecognizerKey === key) {
    return sharedRecognizer;
  }

  const sherpa = await loadSherpa();
  const config = {
    featConfig: {
      sampleRate: OFFLINE_MODEL.sampleRate,
      featureDim: OFFLINE_MODEL.featureDim
    },
    modelConfig: {
      transducer: {
        encoder: modelPaths["encoder.int8.onnx"],
        decoder: modelPaths["decoder.int8.onnx"],
        joiner: modelPaths["joiner.int8.onnx"]
      },
      tokens: modelPaths["tokens.txt"],
      numThreads: 2,
      provider: "cpu",
      debug: 0
    },
    decodingMethod: "greedy_search",
    maxActivePaths: 4,
    enableEndpoint: true,
    rule1MinTrailingSilence: 1.4,
    rule2MinTrailingSilence: 0.8,
    rule3MinUtteranceLength: 20
  };

  if (sharedRecognizer) {
    try {
      sharedRecognizer.free?.();
    } catch {}
  }

  sharedRecognizer = new sherpa.OnlineRecognizer(config);
  sharedRecognizerKey = key;
  return sharedRecognizer;
}

export class OfflineTranscriber {
  constructor({ modelManager, emit }) {
    this.modelManager = modelManager;
    this.emit = emit;
    this.recognizer = null;
    this.stream = null;
    this.lastEmittedText = "";
    this.sampleRate = OFFLINE_MODEL.sampleRate;
  }

  async start() {
    const status = await this.modelManager.status();
    if (!status.ready) {
      this.emit({
        type: "error",
        message: "Offline model not downloaded yet. Download it from the offline panel."
      });
      this.emit({ type: "closed", reason: "Model missing." });
      return;
    }

    try {
      this.recognizer = await getRecognizer(this.modelManager.filePaths());
    } catch (error) {
      this.emit({ type: "error", message: error.message });
      this.emit({ type: "closed", reason: error.message });
      return;
    }

    this.stream = this.recognizer.createStream();
    this.lastEmittedText = "";
    this.emit({ type: "ready", mode: "offline" });
  }

  sendAudio(buffer) {
    if (!this.recognizer || !this.stream) {
      return;
    }

    const samples = int16BufferToFloat32(buffer);
    this.stream.acceptWaveform({ sampleRate: this.sampleRate, samples });

    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
    }

    const text = this.recognizer.getResult(this.stream).text;
    const trimmed = text.trim();

    if (this.recognizer.isEndpoint(this.stream)) {
      if (trimmed) {
        this.emit({
          type: "transcript",
          text: trimmed,
          isFinal: true,
          speechFinal: true,
          timestamp: Date.now()
        });
      }
      this.recognizer.reset(this.stream);
      this.lastEmittedText = "";
      return;
    }

    if (trimmed && trimmed !== this.lastEmittedText) {
      this.lastEmittedText = trimmed;
      this.emit({
        type: "transcript",
        text: trimmed,
        isFinal: false,
        speechFinal: false,
        timestamp: Date.now()
      });
    }
  }

  stop() {
    if (!this.recognizer || !this.stream) {
      this.emit({ type: "stopped" });
      return;
    }

    const tail = new Float32Array(Math.floor(this.sampleRate * 0.4));
    this.stream.acceptWaveform({ sampleRate: this.sampleRate, samples: tail });

    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
    }

    const finalText = this.recognizer.getResult(this.stream).text.trim();
    if (finalText) {
      this.emit({
        type: "transcript",
        text: finalText,
        isFinal: true,
        speechFinal: true,
        timestamp: Date.now()
      });
    }

    this.cleanup();
    this.emit({ type: "stopped" });
  }

  cleanup() {
    if (this.stream) {
      try {
        this.stream.free?.();
      } catch {}
      this.stream = null;
    }
    this.lastEmittedText = "";
  }
}

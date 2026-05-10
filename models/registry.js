const NEMOTRON_STREAMING_06B_INT8 = {
  id: "nemotron-streaming-en-0.6b-int8-2026-01-14",
  label: "Nemotron Speech Streaming 0.6B (int8)",
  baseUrl:
    "https://huggingface.co/csukuangfj/sherpa-onnx-nemotron-speech-streaming-en-0.6b-int8-2026-01-14/resolve/main",
  sampleRate: 16000,
  featureDim: 80,
  files: [
    { name: "encoder.int8.onnx", size: 652_916_830 },
    { name: "decoder.int8.onnx", size: 7_257_753 },
    { name: "joiner.int8.onnx", size: 1_735_862 },
    { name: "tokens.txt", size: 8_952 }
  ]
};

export const OFFLINE_MODEL = NEMOTRON_STREAMING_06B_INT8;

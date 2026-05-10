# Tacet

Realtime captions for any audio on your machine. Mic, system audio, or both — captioned live.

Two engines, one toggle:

- **Online** — Deepgram streaming speech-to-text. Lowest latency, highest accuracy. Needs a free API key.
- **Offline** — NVIDIA Nemotron Speech Streaming 0.6B (int8) running fully on-device via [sherpa-onnx](https://k2-fsa.github.io/sherpa/onnx/). No API key, no network. ~660 MB one-time download.

Built as a local Node + Electron app — your audio and transcripts never leave your machine in Offline mode.

## Features

- Microphone + system-audio capture, mixed locally
- Online (Deepgram) and Offline (Nemotron on-device) engines, switchable from a single UI toggle
- Interim + finalized transcript blocks with copy-per-block
- First-run welcome wizard + interactive button-by-button tour
- Persistent transcript history with full-text search, pin, rename, delete, export (`.txt` + `.json`)
- Read-only viewing mode for past sessions
- Settings UI for the Deepgram API key (no `.env` editing required)
- Resumable model download with progress + cancel

## Setup

```bash
npm install
npm run dev          # web at http://localhost:3000
# or
npm run desktop      # native window via Electron
```

That's it. **First launch shows a welcome wizard** that walks you through:

- What Tacet does and how it works
- The two engines (Online vs Offline) and their tradeoffs
- Pasting your Deepgram API key (with a link to sign up) — saved on this device
- An optional 30-second interactive tour that highlights every button

You can replay the tour from the **help icon** in the header, update the API key from the **gear icon → Settings**, and browse past sessions from the **clock icon → History**.

If you'd rather not enter the key in the UI, you can still set `DEEPGRAM_API_KEY` in a `.env` file. The server uses the UI key first and falls back to the env value.

## Engines

### Online (Deepgram)

- model: `nova-3`
- streaming linear16 PCM at 16 kHz mono
- interim results, smart formatting, punctuation, endpointing
- requires `DEEPGRAM_API_KEY` (entered in Settings or `.env`)

### Offline (Nemotron Speech Streaming 0.6B int8)

- 600M param Cache-Aware FastConformer RNNT, English, streaming
- punctuation + capitalization built-in
- runs locally via [sherpa-onnx-node](https://www.npmjs.com/package/sherpa-onnx-node)
- uses [csukuangfj/sherpa-onnx-nemotron-speech-streaming-en-0.6b-int8-2026-01-14](https://huggingface.co/csukuangfj/sherpa-onnx-nemotron-speech-streaming-en-0.6b-int8-2026-01-14)
- ~660 MB model files downloaded on first use into the OS-managed user data dir (Electron) or `.models/` (dev)
- no API key, no network during transcription

## Using offline mode

1. Open the app.
2. In the left rail under **Engine**, click **Offline**.
3. The Offline panel shows model status. On first run click **Download model** (~660 MB, resumable). Progress is shown live.
4. Once the model is ready, click the play button to start captions.

The model lives in:

- Electron desktop: `<userData>/models/nemotron-streaming-en-0.6b-int8-2026-01-14/`
- Dev (`npm run dev`): `<repo>/.models/nemotron-streaming-en-0.6b-int8-2026-01-14/`

You can override the location with the `MODEL_DIR` env var.

## Transcript history

Every capture session is auto-saved to disk and shows up in the History modal. The header's **clock icon** opens it.

- Sessions are auto-titled from the first finalized block; rename inline with the pencil icon.
- Pin sessions you want to keep at the top with the star icon.
- Search across titles **and** transcript text — matches highlight in-line.
- Each row supports rename, pin/unpin, export (`.txt` + `.json`), and delete.
- Click **Open** to view a past session read-only; **Back to live** returns to capture mode.

Sessions are stored as one JSON file per session, under:

- Electron desktop: `<userData>/sessions/`
- Dev (`npm run dev`): `<repo>/.sessions/`

Override with the `SESSIONS_DIR` env var.

## Native binary path (sherpa-onnx)

`sherpa-onnx-node` ships its native dylib in a sibling package (`sherpa-onnx-darwin-arm64`, `sherpa-onnx-linux-x64`, etc.). The dynamic linker only finds it if the right env var is set:

| Platform     | Env var              |
|--------------|----------------------|
| macOS        | `DYLD_LIBRARY_PATH`  |
| Linux        | `LD_LIBRARY_PATH`    |
| Windows      | `PATH`               |

`npm run dev`, `npm start`, and `npm run desktop` all set this for you via `scripts/native-env.js`. If you launch `node server.js` directly, set it manually:

```bash
# macOS arm64
export DYLD_LIBRARY_PATH=$PWD/node_modules/sherpa-onnx-darwin-arm64:$DYLD_LIBRARY_PATH
node server.js
```

If `sherpa-onnx-node` isn't installed (for example on an unsupported platform), Online mode keeps working and Offline mode reports a clear error.

## Mac system audio caveat

Capturing "system audio" in a browser on macOS is the fragile part.

- `getDisplayMedia()` can return an audio track only when the browser and chosen share source support it.
- Chromium browsers are the best option for this flow.
- Depending on the browser and what you share, you may get tab audio, window audio, or no audio track at all.
- For guaranteed full system-wide audio capture on macOS, use a virtual audio device such as BlackHole or Loopback.

This app detects when no system audio track is provided and shows an error instead of silently failing.

## Architecture

```
public/
  app.js                    main renderer, audio capture, WS client
  audio-worklet.js          PCM capture worklet
  settings.js               localStorage settings
  onboarding.js             welcome wizard + interactive tour
  history.js                sessions API client + history modal
  ui-helpers.js             shared el / openModal / downloadBlob
  index.html, styles.css    UI shell + theme
server.js                   Express + WS dispatcher
transcribers/
  deepgram.js               online engine (proxies Deepgram streaming WS)
  offline-nemotron.js       offline engine (sherpa-onnx-node OnlineRecognizer)
models/
  registry.js               model metadata (URLs, sizes)
  manager.js                first-run download manager (resume, progress)
sessions/
  store.js                  file-based JSON sessions store
electron/
  main.js, preload.cjs      desktop shell
scripts/
  native-env.js             sherpa-onnx native lib path resolver
  run-server.js             dev launcher with native env applied
```

Both transcribers emit a single normalized message shape so the renderer doesn't care which engine produced it:

```js
{ type: "transcript", text, isFinal, speechFinal, timestamp }
```

## Scripts

| Command           | What it does                                                |
|-------------------|-------------------------------------------------------------|
| `npm run dev`     | Launch the web app on localhost with --watch                |
| `npm start`       | Launch the web app once (no watch)                          |
| `npm run desktop` | Launch the Electron desktop shell                           |
| `npm run check`   | `node --check` syntax-check every JS module                 |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Arun Kashyap

## References

- [Deepgram streaming docs](https://developers.deepgram.com/docs/live-streaming-audio)
- [Nemotron Speech Streaming 0.6B (NVIDIA)](https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b)
- [sherpa-onnx-node](https://www.npmjs.com/package/sherpa-onnx-node)
- [On-Device Streaming ASR comparison (arXiv 2604.14493)](https://arxiv.org/abs/2604.14493)

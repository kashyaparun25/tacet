# Changelog

All notable changes to Tacet will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Offline transcription engine** using NVIDIA Nemotron Speech Streaming 0.6B (int8) via `sherpa-onnx-node`. Fully on-device, no API key required. ~660 MB one-time model download.
- **Online/Offline mode toggle** in the left rail with a per-mode availability badge.
- **First-run welcome wizard** (5 steps) explaining engines and walking through the Deepgram API-key entry.
- **Interactive 6-step tour** with spotlight + tooltip overlay, replayable from the help icon.
- **Settings modal** (gear icon) to manage the Deepgram API key, replay the tour, or reset all settings.
- **Persistent transcript history**: every capture session is auto-saved to disk as JSON. History modal supports full-text search, pin, rename, delete, and per-session export (`.txt` + `.json`).
- **Read-only viewing mode** for past sessions with a "Back to live" affordance.
- **Resumable model downloader** with HTTP Range support, progress events, atomic `.part` rename, and cancellation.
- **Normalized transcript wire protocol** — both engines emit the same `{ type, text, isFinal, speechFinal, timestamp }` shape.
- **Native env helper** (`scripts/native-env.js`) so the launcher sets `DYLD_LIBRARY_PATH` / `LD_LIBRARY_PATH` / `PATH` correctly per platform.
- **Electron desktop shell** loads `MODEL_DIR` and `SESSIONS_DIR` from `app.getPath("userData")`.
- LICENSE (MIT), CONTRIBUTING, CHANGELOG, GitHub Actions CI, issue and PR templates.

### Changed

- Server refactored from an inline Deepgram WebSocket relay into a Transcriber-dispatcher pattern (`transcribers/deepgram.js`, `transcribers/offline-nemotron.js`).
- Renderer no longer parses Deepgram-specific message shapes. All rendering pipes through `handleTranscriptMessage`.
- Deepgram API key flow: server prefers the per-session key from the start payload over the `DEEPGRAM_API_KEY` env. The env var remains as a fallback.
- Modal infrastructure (`el`, `openModal`, `trapFocus`, `downloadBlob`) extracted into `public/ui-helpers.js` and shared by onboarding and history.

### Fixed

- `el()` helper now flattens nested children arrays so search-highlight nodes render correctly.
- Global `[hidden] { display: none !important; }` rule so HTML's `hidden` attribute survives explicit `display:` rules on toggleable elements.

## [0.0.1] - earlier

- Initial Deepgram-only web demo with mic + system-audio capture.
- Electron desktop shell scaffolding.

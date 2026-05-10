# Native Desktop Phase Tracker

This project keeps the current browser demo intact while adding a native desktop path in phases.

## Current Architecture

- Web UI: `public/` (Online/Offline mode toggle)
- Dispatcher server: `server.js` (Express + WS)
- Online engine (Deepgram): `transcribers/deepgram.js`
- Offline engine (Nemotron / sherpa-onnx): `transcribers/offline-nemotron.js`
- Model download/manager: `models/manager.js`
- Desktop shell: `electron/main.js`
- Native system audio helpers: not implemented yet

## Phase 0: Stabilize Existing Web Demo

Status: In progress

- [x] Keep the existing local web app runnable with `npm run dev`
- [x] Keep Deepgram API key on the local server side
- [x] Add transcript block copy controls
- [x] Add buffered final transcript handling
- [ ] Re-test microphone capture in a real browser session
- [ ] Re-test browser system audio capture in a real browser session

## Phase 1: Desktop Shell Alongside Web App

Status: In progress

- [x] Add Electron as a desktop app shell
- [x] Add `npm run desktop`
- [x] Launch the existing local server from Electron
- [x] Load the existing UI inside a desktop window
- [x] Smoke launch the Electron command
- [x] Add Electron media permission handling
- [x] Add Electron desktop capture bridge for system audio attempts
- [x] Switch Electron capture to `setDisplayMediaRequestHandler` with loopback audio
- [ ] Verify macOS permissions prompts from Electron
- [ ] Verify Deepgram streaming inside Electron

## Phase 2: Native macOS System Audio

Status: Not started

Goal: remove dependency on browser screen-share audio for macOS.

- [ ] Create a small macOS helper using ScreenCaptureKit
- [ ] Capture system audio as PCM
- [ ] Stream helper PCM into the Electron app
- [ ] Keep microphone and system audio controllable independently
- [ ] Decide whether to mix locally or send separate Deepgram streams

## Phase 3: Native Windows System Audio

Status: Not started

Goal: remove dependency on browser screen-share audio for Windows.

- [ ] Create a Windows helper using WASAPI loopback
- [ ] Capture system audio as PCM
- [ ] Stream helper PCM into the Electron app
- [ ] Keep microphone and system audio controllable independently

## Phase 4: Packaging

Status: Not started

- [ ] Add app icon and metadata
- [ ] Add packaged builds for macOS and Windows
- [ ] Add first-run permission guidance
- [ ] Add signed/notarized macOS build path if distribution requires it

## Phase 5: Offline ASR Engine + Onboarding

Status: In progress

Goal: a single toggle that switches between cloud (Deepgram) and on-device (Nemotron via sherpa-onnx) without changing the UX.

- [x] Define normalized transcript wire protocol shared by both engines
- [x] Refactor `server.js` into a Transcriber dispatcher
- [x] Implement `DeepgramTranscriber` (extracted from prior inline logic)
- [x] Implement `OfflineTranscriber` wrapping sherpa-onnx-node Nemotron streaming
- [x] First-run model download with resume + progress (HTTPS Range)
- [x] Pass model dir from Electron `app.getPath("userData")` via env
- [x] Set platform-specific library env (`DYLD_LIBRARY_PATH` etc.) when spawning the server
- [x] Online/Offline mode toggle in the UI with model status panel
- [x] First-run welcome wizard (5 steps) explaining engines + Deepgram key entry
- [x] Interactive tour overlay highlighting every control
- [x] Settings modal (API key, replay tour, reset) reachable from the header
- [x] Server accepts API key from client start payload, falls back to env
- [x] Server-side sessions store with REST CRUD + full-text search
- [x] Auto-save sessions on each finalized block; finalize on stop
- [x] History modal: pin/unpin, rename, delete, export (.txt + .json), search
- [x] Read-only viewing mode for past sessions with "Back to live"
- [ ] Verify offline engine streaming live in Electron (M-series Mac)
- [ ] Measure offline RTF + memory under typical CPU load
- [ ] Decide whether Parakeet 120M "lite" mode is worth adding

## Immediate Next Build Decision

Verify Phase 5 end-to-end live (capture mic, switch to Offline, download, run captions). Then return to Phase 2 macOS helper scaffolding.

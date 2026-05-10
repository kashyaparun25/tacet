import { loadSettings, saveSettings, markOnboarded, hasOnboarded } from "/settings.js";
import { runWelcomeWizard, runTour, runSettingsModal } from "/onboarding.js";
import {
  sessionsApi,
  runHistoryModal,
  deriveTitleFromBlocks,
  formatSessionExportText
} from "/history.js";

const state = {
  socket: null,
  downloadSocket: null,
  audioContext: null,
  workletNode: null,
  mixBus: null,
  silentGain: null,
  micStream: null,
  systemStream: null,
  systemDisplayStream: null,
  micSource: null,
  systemSource: null,
  micGain: null,
  systemGain: null,
  isStreaming: false,
  sampleRate: 16000,
  finalizedBlocks: [],
  currentUtteranceFinal: "",
  currentInterim: "",
  mode: "online",
  modelStatus: null,
  isDownloading: false,
  currentSessionId: null,
  sessionStartedAt: null,
  saveTimer: null,
  viewingSession: null
};

const ui = {
  connectionStatus: document.querySelector("#connectionStatus"),
  micStatus: document.querySelector("#micStatus"),
  systemStatus: document.querySelector("#systemStatus"),
  blockCount: document.querySelector("#blockCount"),
  transcriptFeed: document.querySelector("#transcriptFeed"),
  interimLine: document.querySelector("#interimLine"),
  hintText: document.querySelector("#hintText"),
  errorText: document.querySelector("#errorText"),
  toastRegion: document.querySelector("#toastRegion"),
  micButton: document.querySelector("#micButton"),
  systemButton: document.querySelector("#systemButton"),
  startButton: document.querySelector("#startButton"),
  stopButton: document.querySelector("#stopButton"),
  clearButton: document.querySelector("#clearButton"),
  copyAllButton: document.querySelector("#copyAllButton"),
  copyLiveButton: document.querySelector("#copyLiveButton"),
  helpButton: document.querySelector("#helpButton"),
  settingsButton: document.querySelector("#settingsButton"),
  historyButton: document.querySelector("#historyButton"),
  backToLiveButton: document.querySelector("#backToLiveButton"),
  conversationKicker: document.querySelector("#conversationKicker"),
  conversationTitle: document.querySelector("#conversationTitle"),
  conversationWave: document.querySelector("#conversationWave"),
  modeOnlineButton: document.querySelector("#modeOnlineButton"),
  modeOfflineButton: document.querySelector("#modeOfflineButton"),
  offlinePanel: document.querySelector("#offlinePanel"),
  offlineStatusLabel: document.querySelector("#offlineStatusLabel"),
  offlineStatusDetail: document.querySelector("#offlineStatusDetail"),
  offlineProgressBar: document.querySelector("#offlineProgressBar"),
  offlineProgressTrack: document.querySelector("#offlineProgressTrack"),
  offlineDownloadButton: document.querySelector("#offlineDownloadButton"),
  offlineCancelButton: document.querySelector("#offlineCancelButton"),
  modeBadge: document.querySelector("#modeBadge")
};

function setError(message = "") {
  if (!message) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.role = "alert";
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "!";

  const text = document.createElement("span");
  text.textContent = message;

  toast.append(icon, text);

  ui.toastRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-exit");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, 5200);
}

function setConnectionStatus(label) {
  ui.connectionStatus.textContent = label;
}

function updateInputStatus() {
  ui.micStatus.textContent =
    state.micStream && state.micGain?.gain.value > 0 ? "On" : state.micStream ? "Muted" : "Off";
  ui.systemStatus.textContent =
    state.systemStream && state.systemGain?.gain.value > 0
      ? "On"
      : state.systemStream
        ? "Muted"
        : "Off";

  ui.micButton.setAttribute(
    "aria-pressed",
    String(Boolean(state.micStream && state.micGain?.gain.value > 0))
  );
  ui.systemButton.setAttribute(
    "aria-pressed",
    String(Boolean(state.systemStream && state.systemGain?.gain.value > 0))
  );
}

function normalizeWords(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function mergeTranscriptParts(base, incoming) {
  const baseWords = normalizeWords(base);
  const incomingWords = normalizeWords(incoming);

  if (!incomingWords.length) {
    return base.trim();
  }

  if (!baseWords.length) {
    return incomingWords.join(" ");
  }

  const maxOverlap = Math.min(baseWords.length, incomingWords.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const baseTail = baseWords.slice(-overlap).join(" ").toLowerCase();
    const incomingHead = incomingWords.slice(0, overlap).join(" ").toLowerCase();

    if (baseTail === incomingHead) {
      return [...baseWords, ...incomingWords.slice(overlap)].join(" ");
    }
  }

  if (incoming.toLowerCase().startsWith(base.toLowerCase())) {
    return incoming.trim();
  }

  if (base.toLowerCase().startsWith(incoming.toLowerCase())) {
    return base.trim();
  }

  return [...baseWords, ...incomingWords].join(" ");
}

function getLiveUtteranceText() {
  return [state.currentUtteranceFinal, state.currentInterim].filter(Boolean).join(" ").trim();
}

function renderLiveUtterance() {
  ui.interimLine.textContent = getLiveUtteranceText() || "Waiting for audio...";
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTranscriptExport() {
  if (state.viewingSession) {
    return formatSessionExportText(state.viewingSession);
  }

  const blocks = state.finalizedBlocks;

  if (!blocks.length) {
    return "";
  }

  const firstBlock = blocks[0];
  const lastBlock = blocks[blocks.length - 1];
  const lines = [
    "Tacet Transcript",
    "================",
    "",
    `Exported: ${formatDateTime(Date.now())}`,
    `Captured: ${formatTimestamp(firstBlock.createdAt)} - ${formatTimestamp(lastBlock.createdAt)}`,
    `Blocks: ${blocks.length}`,
    "",
    "Transcript",
    "----------"
  ];

  blocks.forEach((block, index) => {
    lines.push(
      "",
      `[${String(index + 1).padStart(2, "0")}] ${formatTimestamp(block.createdAt)} / ${block.meta}`,
      block.text
    );
  });

  return lines.join("\n");
}

async function copyText(text, button) {
  if (!text.trim()) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();

    const copied = document.execCommand("copy");
    textArea.remove();

    if (!copied) {
      throw new Error("Clipboard permission was denied. Use Cmd+C after selecting the transcript.");
    }
  }

  if (!button) {
    return;
  }

  const labelNode = button.querySelector(".button-label");
  const previousLabel = labelNode?.textContent;
  button.classList.add("copied");
  if (labelNode) {
    labelNode.textContent = "Copied";
  }

  window.setTimeout(() => {
    button.classList.remove("copied");
    if (labelNode && previousLabel) {
      labelNode.textContent = previousLabel;
    }
  }, 1200);
}

function renderTranscriptFeed() {
  const blocks = state.viewingSession ? state.viewingSession.blocks || [] : state.finalizedBlocks;

  ui.blockCount.textContent = String(blocks.length);
  ui.transcriptFeed.innerHTML = "";

  if (!blocks.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    if (state.viewingSession) {
      emptyState.innerHTML = `
        <strong>This session is empty</strong>
        <span>No transcript blocks were saved.</span>
      `;
    } else {
      emptyState.innerHTML = `
        <strong>No transcript yet</strong>
        <span>Start captions and finalized speech will stack here like a conversation.</span>
      `;
    }
    ui.transcriptFeed.appendChild(emptyState);
    return;
  }

  blocks.forEach((block, index) => {
    const item = document.createElement("article");
    item.className = "transcript-item";

    const header = document.createElement("div");
    header.className = "transcript-item-header";

    const meta = document.createElement("p");
    meta.className = "transcript-meta";
    meta.textContent = `${formatTimestamp(block.createdAt)} / ${block.meta}`;

    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.type = "button";
    copyButton.setAttribute("aria-label", `Copy transcript block ${index + 1}`);
    copyButton.title = "Copy block";
    copyButton.innerHTML = `
      <span class="button-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path
            d="M9 9h10v12H9zM5 3h10v3H8v9H5z"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
        </svg>
      </span>
    `;
    copyButton.addEventListener("click", async () => {
      try {
        await copyText(block.text, copyButton);
      } catch (error) {
        setError(error.message);
      }
    });

    header.append(meta, copyButton);

    const body = document.createElement("div");
    body.className = "transcript-text";
    body.textContent = block.text;

    item.append(header, body);
    ui.transcriptFeed.appendChild(item);
  });

  ui.transcriptFeed.scrollTop = ui.transcriptFeed.scrollHeight;
}

function pushFinalizedBlock(text, meta) {
  const cleaned = text.trim();
  if (!cleaned) {
    return;
  }

  state.finalizedBlocks.push({
    text: cleaned,
    meta,
    createdAt: Date.now()
  });
  renderTranscriptFeed();
  scheduleSessionSave();
}

function scheduleSessionSave() {
  if (state.viewingSession) return;
  if (!state.finalizedBlocks.length) return;

  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    persistCurrentSession().catch((error) => console.warn("Session save failed:", error));
  }, 250);
}

async function persistCurrentSession({ finalize = false } = {}) {
  if (!state.finalizedBlocks.length) return;

  const startedAt = state.sessionStartedAt || Date.now();
  const now = Date.now();
  const durationSeconds = Math.max(0, Math.round((now - startedAt) / 1000));

  const payload = {
    mode: state.mode,
    blocks: state.finalizedBlocks.map((block) => ({
      text: block.text,
      meta: block.meta || "",
      createdAt: block.createdAt
    })),
    startedAt,
    durationSeconds
  };

  if (finalize) {
    payload.endedAt = now;
  }

  if (!state.currentSessionId) {
    payload.title = deriveTitleFromBlocks(state.finalizedBlocks);
    const created = await sessionsApi.create(payload);
    state.currentSessionId = created.id;
    return created;
  }

  return sessionsApi.update(state.currentSessionId, payload);
}

async function finalizeCurrentSession() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (state.viewingSession) return;
  try {
    await persistCurrentSession({ finalize: true });
  } catch (error) {
    console.warn("Session finalize failed:", error);
  }
}

function flushCurrentUtterance(meta = "Committed utterance") {
  const finalText = state.currentUtteranceFinal.trim() || state.currentInterim.trim();

  if (finalText) {
    pushFinalizedBlock(finalText, meta);
  }

  state.currentUtteranceFinal = "";
  state.currentInterim = "";
  renderLiveUtterance();
}

function clearTranscript() {
  state.finalizedBlocks = [];
  state.currentUtteranceFinal = "";
  state.currentInterim = "";
  state.currentSessionId = null;
  state.sessionStartedAt = null;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  renderTranscriptFeed();
  renderLiveUtterance();
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (outputSampleRate === inputSampleRate) {
    return buffer;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16BitPcm(float32Buffer) {
  const pcm = new Int16Array(float32Buffer.length);

  for (let i = 0; i < float32Buffer.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32Buffer[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return pcm.buffer;
}

async function ensureAudioGraph() {
  if (state.audioContext) {
    return;
  }

  state.audioContext = new AudioContext();
  await state.audioContext.audioWorklet.addModule("/audio-worklet.js");

  state.mixBus = state.audioContext.createGain();
  state.mixBus.gain.value = 1;

  state.workletNode = new AudioWorkletNode(state.audioContext, "pcm-capture-processor");
  state.silentGain = state.audioContext.createGain();
  state.silentGain.gain.value = 0;

  state.workletNode.port.onmessage = (event) => {
    if (!state.isStreaming || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const mono = event.data;
    const downsampled = downsampleBuffer(mono, state.audioContext.sampleRate, state.sampleRate);
    const pcm = floatTo16BitPcm(downsampled);
    state.socket.send(pcm);
  };

  state.mixBus.connect(state.workletNode);
  state.workletNode.connect(state.silentGain);
  state.silentGain.connect(state.audioContext.destination);
}

function attachStreamToBus(kind, stream) {
  const source = state.audioContext.createMediaStreamSource(stream);
  const gain = state.audioContext.createGain();
  gain.gain.value = 1;

  source.connect(gain);
  gain.connect(state.mixBus);

  if (kind === "mic") {
    state.micSource = source;
    state.micGain = gain;
  } else {
    state.systemSource = source;
    state.systemGain = gain;
  }
}

function tearDownStream(kind) {
  const streamKey = kind === "mic" ? "micStream" : "systemStream";
  const sourceKey = kind === "mic" ? "micSource" : "systemSource";
  const gainKey = kind === "mic" ? "micGain" : "systemGain";

  state[sourceKey]?.disconnect();
  state[gainKey]?.disconnect();

  const stream = state[streamKey];
  stream?.getTracks().forEach((track) => track.stop());

  if (kind === "system") {
    state.systemDisplayStream?.getTracks().forEach((track) => track.stop());
    state.systemDisplayStream = null;
  }

  state[streamKey] = null;
  state[sourceKey] = null;
  state[gainKey] = null;

  updateInputStatus();
}

async function toggleMic() {
  setError("");
  await ensureAudioGraph();

  if (!state.micStream) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    state.micStream = stream;
    attachStreamToBus("mic", stream);
    updateInputStatus();
    return;
  }

  const nextValue = state.micGain.gain.value > 0 ? 0 : 1;
  state.micGain.gain.value = nextValue;
  updateInputStatus();
}

async function toggleSystemAudio() {
  setError("");
  await ensureAudioGraph();

  if (!state.systemStream) {
    const { stream: displayStream, releaseVideoAfterAudioAttach } = await getSystemAudioStream();

    const audioTracks = displayStream.getAudioTracks();

    if (!audioTracks.length) {
      displayStream.getTracks().forEach((track) => track.stop());
      throw new Error(
        "The selected share source did not expose an audio track. On macOS this is common unless the browser and selected source support audio sharing."
      );
    }

    const systemAudioOnly = new MediaStream(audioTracks);
    state.systemStream = systemAudioOnly;
    state.systemDisplayStream = displayStream;
    attachStreamToBus("system", systemAudioOnly);

    if (releaseVideoAfterAudioAttach) {
      displayStream.getVideoTracks().forEach((track) => {
        track.stop();
      });
    }

    audioTracks[0].onended = () => {
      tearDownStream("system");
      setError(
        "System audio capture ended. On macOS, allow Screen & System Audio Recording for Electron and try again."
      );
    };

    updateInputStatus();
    return;
  }

  const nextValue = state.systemGain.gain.value > 0 ? 0 : 1;
  state.systemGain.gain.value = nextValue;
  updateInputStatus();
}

async function getSystemAudioStream() {
  if (window.desktopCapture?.enableLoopbackAudio) {
    await window.desktopCapture.enableLoopbackAudio();

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      stream.getVideoTracks().forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });

      return {
        stream,
        releaseVideoAfterAudioAttach: false
      };
    } finally {
      await window.desktopCapture.disableLoopbackAudio?.();
    }
  }

  if (!navigator.mediaDevices.getDisplayMedia) {
    throw new Error("System audio capture is not supported in this runtime yet.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });

  return {
    stream,
    releaseVideoAfterAudioAttach: true
  };
}

function handleTranscriptMessage(payload) {
  const text = payload.text?.trim();
  if (!text) {
    return;
  }

  if (payload.isFinal) {
    state.currentUtteranceFinal = mergeTranscriptParts(state.currentUtteranceFinal, text);
    state.currentInterim = "";

    if (payload.speechFinal) {
      flushCurrentUtterance(state.mode === "offline" ? "Endpoint detected" : "Pause detected");
    } else {
      renderLiveUtterance();
    }
    return;
  }

  state.currentInterim = text;
  renderLiveUtterance();
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    state.socket = socket;

    socket.addEventListener("open", () => {
      const settings = loadSettings();
      socket.send(
        JSON.stringify({
          type: "start",
          mode: state.mode,
          apiKey: state.mode === "online" ? settings.deepgramApiKey || "" : undefined,
          config: {
            model: "nova-3",
            language: "en-US",
            sampleRate: state.sampleRate,
            endpointing: 700,
            utteranceEndMs: 1000
          }
        })
      );
      resolve();
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "ready":
          setConnectionStatus("Streaming");
          return;
        case "transcript":
          handleTranscriptMessage(message);
          return;
        case "utterance_end":
          flushCurrentUtterance("Gap detected");
          return;
        case "closed":
          flushCurrentUtterance("Connection closed");
          setConnectionStatus("Closed");
          state.isStreaming = false;
          updateStartStopAvailability();
          finalizeCurrentSession();
          return;
        case "stopped":
          state.socket?.close();
          state.socket = null;
          return;
        case "error":
          setError(message.message);
          return;
        default:
          return;
      }
    });

    socket.addEventListener("close", () => {
      flushCurrentUtterance("Session ended");
      setConnectionStatus("Idle");
      state.isStreaming = false;
      updateStartStopAvailability();
      finalizeCurrentSession();
    });

    socket.addEventListener("error", () => {
      reject(new Error("Unable to connect to the local WebSocket server."));
    });
  });
}

async function startStreaming() {
  setError("");

  if (state.viewingSession) {
    throw new Error("Exit the past session view before starting captions.");
  }

  if (!state.micStream && !state.systemStream) {
    throw new Error("Enable microphone, system audio, or both before starting captions.");
  }

  if (state.mode === "offline" && !state.modelStatus?.ready) {
    throw new Error("Offline model is not ready. Download it from the Offline panel first.");
  }

  await ensureAudioGraph();
  await state.audioContext.resume();
  await connectSocket();

  if (!state.sessionStartedAt) {
    state.sessionStartedAt = Date.now();
  }

  state.isStreaming = true;
  setConnectionStatus("Connecting");
  updateStartStopAvailability();
}

function updateStartStopAvailability() {
  const viewing = Boolean(state.viewingSession);
  const offlineBlocked = state.mode === "offline" && !state.modelStatus?.ready;
  ui.startButton.disabled = state.isStreaming || offlineBlocked || viewing;
  ui.stopButton.disabled = !state.isStreaming;
  ui.modeOnlineButton.disabled = state.isStreaming || viewing;
  ui.modeOfflineButton.disabled = state.isStreaming || viewing;
  ui.micButton.disabled = viewing;
  ui.systemButton.disabled = viewing;
  ui.clearButton.disabled = viewing;
}

function setViewingSession(session) {
  state.viewingSession = session;

  if (session) {
    ui.conversationKicker.textContent = `Viewing - ${session.mode === "offline" ? "Offline" : "Online"}`;
    ui.conversationTitle.textContent = session.title || "Untitled session";
    ui.conversationWave.hidden = true;
    ui.backToLiveButton.hidden = false;
    ui.interimLine.parentElement.hidden = true;
  } else {
    ui.conversationKicker.textContent = "Live room";
    ui.conversationTitle.textContent = "Transcript";
    ui.conversationWave.hidden = false;
    ui.backToLiveButton.hidden = true;
    ui.interimLine.parentElement.hidden = false;
  }

  renderTranscriptFeed();
  renderLiveUtterance();
  updateStartStopAvailability();
}

function exitViewingMode() {
  setViewingSession(null);
}

function setMode(nextMode) {
  if (state.isStreaming) {
    return;
  }
  if (state.mode === nextMode) {
    return;
  }

  state.mode = nextMode;
  ui.modeOnlineButton.setAttribute("aria-pressed", String(nextMode === "online"));
  ui.modeOfflineButton.setAttribute("aria-pressed", String(nextMode === "offline"));
  ui.offlinePanel.hidden = nextMode !== "offline";

  if (ui.modeBadge) {
    ui.modeBadge.textContent = nextMode === "offline" ? "Offline" : "Online";
  }

  if (nextMode === "offline") {
    refreshModelStatus().catch((error) => setError(error.message));
  }

  updateStartStopAvailability();
  renderOfflinePanel();
}

function formatBytes(value) {
  if (!value && value !== 0) {
    return "--";
  }
  if (value >= 1_073_741_824) {
    return `${(value / 1_073_741_824).toFixed(2)} GB`;
  }
  if (value >= 1_048_576) {
    return `${(value / 1_048_576).toFixed(0)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(0)} KB`;
  }
  return `${value} B`;
}

async function refreshModelStatus() {
  const response = await fetch("/api/model/status");
  if (!response.ok) {
    throw new Error("Unable to read offline model status.");
  }
  state.modelStatus = await response.json();
  renderOfflinePanel();
  updateStartStopAvailability();
  return state.modelStatus;
}

function renderOfflinePanel() {
  const status = state.modelStatus;
  const downloading = state.isDownloading;

  if (!status) {
    ui.offlineStatusLabel.textContent = "Checking model...";
    ui.offlineStatusDetail.textContent = "";
    ui.offlineProgressBar.style.width = "0%";
    ui.offlineDownloadButton.hidden = true;
    ui.offlineCancelButton.hidden = true;
    return;
  }

  if (status.ready) {
    ui.offlineStatusLabel.textContent = "Model ready";
    ui.offlineStatusDetail.textContent = `${status.label} - ${formatBytes(status.totalBytes)} on disk`;
    ui.offlineProgressBar.style.width = "100%";
    ui.offlineProgressTrack.dataset.state = "ready";
    ui.offlineDownloadButton.hidden = true;
    ui.offlineCancelButton.hidden = true;
    return;
  }

  if (downloading) {
    const pct = status.totalBytes
      ? Math.min(100, Math.round((status.downloadedBytes / status.totalBytes) * 100))
      : 0;
    ui.offlineStatusLabel.textContent = `Downloading model... ${pct}%`;
    ui.offlineStatusDetail.textContent = `${formatBytes(status.downloadedBytes)} of ${formatBytes(status.totalBytes)}`;
    ui.offlineProgressBar.style.width = `${pct}%`;
    ui.offlineProgressTrack.dataset.state = "downloading";
    ui.offlineDownloadButton.hidden = true;
    ui.offlineCancelButton.hidden = false;
    return;
  }

  ui.offlineStatusLabel.textContent = "Model not downloaded";
  ui.offlineStatusDetail.textContent = `${status.label} - ${formatBytes(status.totalBytes)} required`;
  ui.offlineProgressBar.style.width = "0%";
  ui.offlineProgressTrack.dataset.state = "idle";
  ui.offlineDownloadButton.hidden = false;
  ui.offlineCancelButton.hidden = true;
}

function openDownloadSocket() {
  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    state.downloadSocket = socket;

    socket.addEventListener("open", () => resolve(socket));
    socket.addEventListener("error", () => reject(new Error("Unable to open download channel.")));
    socket.addEventListener("close", () => {
      if (state.downloadSocket === socket) {
        state.downloadSocket = null;
      }
    });
  });
}

async function startModelDownload() {
  if (state.isDownloading) {
    return;
  }

  setError("");

  let socket;
  try {
    socket = await openDownloadSocket();
  } catch (error) {
    setError(error.message);
    return;
  }

  state.isDownloading = true;
  renderOfflinePanel();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "model_download_progress") {
      const { downloadedBytes, totalBytes } = message.payload;
      state.modelStatus = {
        ...(state.modelStatus || {}),
        downloadedBytes,
        totalBytes,
        ready: false,
        label: state.modelStatus?.label || "Offline model"
      };
      renderOfflinePanel();
      return;
    }

    if (message.type === "model_download_complete") {
      state.modelStatus = message.payload;
      state.isDownloading = false;
      renderOfflinePanel();
      updateStartStopAvailability();
      socket.close();
      return;
    }

    if (message.type === "model_download_error") {
      state.isDownloading = false;
      setError(message.message);
      refreshModelStatus().catch((error) => setError(error.message));
      socket.close();
      return;
    }

    if (message.type === "model_download_cancelled") {
      state.isDownloading = false;
      refreshModelStatus().catch((error) => setError(error.message));
      socket.close();
    }
  });

  socket.addEventListener("close", () => {
    if (state.isDownloading) {
      state.isDownloading = false;
      refreshModelStatus().catch((error) => setError(error.message));
    }
  });

  socket.send(JSON.stringify({ type: "model_download" }));
}

function cancelModelDownload() {
  if (!state.isDownloading || !state.downloadSocket) {
    return;
  }
  state.downloadSocket.send(JSON.stringify({ type: "model_cancel_download" }));
}

function stopStreaming() {
  state.isStreaming = false;
  setConnectionStatus("Finalizing");

  finalizeCurrentSession();

  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ type: "stop" }));
    return;
  }

  state.socket = null;
  setConnectionStatus("Idle");
  updateStartStopAvailability();
}

ui.micButton.addEventListener("click", async () => {
  try {
    await toggleMic();
  } catch (error) {
    setError(error.message);
  }
});

ui.systemButton.addEventListener("click", async () => {
  try {
    await toggleSystemAudio();
  } catch (error) {
    setError(error.message);
  }
});

ui.startButton.addEventListener("click", async () => {
  try {
    await startStreaming();
  } catch (error) {
    setError(error.message);
  }
});

ui.stopButton.addEventListener("click", () => {
  stopStreaming();
});

ui.clearButton.addEventListener("click", () => {
  clearTranscript();
});

ui.copyAllButton.addEventListener("click", async () => {
  try {
    await copyText(formatTranscriptExport(), ui.copyAllButton);
  } catch (error) {
    setError(error.message);
  }
});

ui.copyLiveButton.addEventListener("click", async () => {
  try {
    await copyText(getLiveUtteranceText(), ui.copyLiveButton);
  } catch (error) {
    setError(error.message);
  }
});

ui.modeOnlineButton.addEventListener("click", () => setMode("online"));
ui.modeOfflineButton.addEventListener("click", () => setMode("offline"));

ui.offlineDownloadButton.addEventListener("click", () => {
  startModelDownload().catch((error) => setError(error.message));
});

ui.offlineCancelButton.addEventListener("click", () => {
  cancelModelDownload();
});

ui.helpButton.addEventListener("click", () => {
  runTour().catch((error) => setError(error.message));
});

ui.historyButton.addEventListener("click", async () => {
  try {
    await runHistoryModal({
      onOpenSession: (session) => {
        setViewingSession(session);
      }
    });
  } catch (error) {
    setError(error.message);
  }
});

ui.backToLiveButton.addEventListener("click", () => {
  exitViewingMode();
});

ui.settingsButton.addEventListener("click", async () => {
  try {
    const result = await runSettingsModal();
    if (result?.replayTour) {
      await runTour();
    } else if (result?.reset) {
      await runFirstRunFlow();
    }
  } catch (error) {
    setError(error.message);
  }
});

window.addEventListener("beforeunload", () => {
  stopStreaming();
  tearDownStream("mic");
  tearDownStream("system");
  state.downloadSocket?.close();
});

renderTranscriptFeed();
renderLiveUtterance();
updateInputStatus();
renderOfflinePanel();
updateStartStopAvailability();

refreshModelStatus().catch(() => {
  // Silent: offline panel will show "Checking model..." until user toggles.
});

async function runFirstRunFlow() {
  const result = await runWelcomeWizard();
  if (result?.tookTour) {
    await runTour();
  }
}

if (!hasOnboarded()) {
  runFirstRunFlow().catch((error) => setError(error.message));
}

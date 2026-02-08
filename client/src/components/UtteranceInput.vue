<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import { wsStore } from "../state/wsStore";
import { speechStore } from "../state/speechStore";
import { liveStore } from "../state/liveStore";
import { cheetahStore } from "../state/cheetahStore";
import { Mic, MicOff, Loader2, Send, Check, X } from "lucide-vue-next";

type ActiveVoiceMode = "live" | "browser" | "cheetah";
type VoiceMode = ActiveVoiceMode | "off";

type MicVisualState = "idle" | "listening" | "processing" | "error";

const utterance = ref("");
const isPending = ref(false);
const voiceMode = ref<VoiceMode>("off");
const selectedVoiceMode = ref<ActiveVoiceMode>("cheetah");

const canUseBrowserVoice = computed(
  () => speechStore.isSupported && wsStore.isConnected,
);
const canUseLiveVoice = computed(() => wsStore.isConnected);
const canUseCheetahVoice = computed(
  () => cheetahStore.isSupported && wsStore.isConnected,
);
const isVoiceOn = computed(() => voiceMode.value !== "off");

const overlayIsListening = computed(() => {
  if (voiceMode.value === "live") return liveStore.status === "connected";
  if (voiceMode.value === "browser") return speechStore.isListening;
  if (voiceMode.value === "cheetah") return cheetahStore.status === "connected";
  return false;
});

const overlayIsConnecting = computed(() => {
  if (voiceMode.value === "live") return liveStore.status === "connecting";
  if (voiceMode.value === "cheetah") return cheetahStore.status === "connecting";
  return false;
});

const overlayInterim = computed(() => {
  if (voiceMode.value === "live") return liveStore.partialTranscript || "";
  if (voiceMode.value === "browser") return speechStore.interimTranscript || "";
  if (voiceMode.value === "cheetah") return cheetahStore.partialTranscript || "";
  return "";
});

const overlayError = computed(() => {
  if (voiceMode.value === "live") return liveStore.error || null;
  if (voiceMode.value === "browser") return speechStore.error || null;
  if (voiceMode.value === "cheetah") return cheetahStore.error || null;
  return null;
});

const previewCount = computed(() => wsStore.activePreviewIds.length);

const micVisualState = computed<MicVisualState>(() => {
  if (overlayError.value) return "error";
  if (overlayIsListening.value) return "listening";
  if (overlayIsConnecting.value || isPending.value) return "processing";
  return "idle";
});

function labelForMode(mode: ActiveVoiceMode): string {
  if (mode === "live") return "Deepgram Live";
  if (mode === "browser") return "Browser Voice";
  return "Cheetah";
}

const modeLabel = computed(() => {
  if (voiceMode.value === "off") {
    return `${labelForMode(selectedVoiceMode.value)} Ready`;
  }
  return labelForMode(voiceMode.value);
});

const voiceStateText = computed(() => {
  if (overlayError.value) return "Error";
  if (overlayIsListening.value) return "Listening...";
  if (overlayIsConnecting.value || isPending.value) return "Processing...";
  return "Voice off";
});

const transcriptLine = computed(() => {
  if (overlayInterim.value) return overlayInterim.value;
  if (wsStore.lastTranscript && wsStore.lastTranscript.trim().length > 0) {
    return wsStore.lastTranscript;
  }

  if (
    selectedVoiceMode.value === "cheetah" &&
    cheetahStore.error &&
    !isVoiceOn.value
  ) {
    return cheetahStore.error;
  }

  if (
    selectedVoiceMode.value === "cheetah" &&
    !cheetahStore.isConfigured &&
    !isVoiceOn.value
  ) {
    return "Set VITE_PICOVOICE_ACCESS_KEY to enable Cheetah voice mode.";
  }

  if (overlayIsListening.value) {
    return "Listening... speak naturally.";
  }

  if (overlayIsConnecting.value) {
    return "Connecting voice channel...";
  }

  return "Type a prompt or tap the mic to start voice input.";
});

const selectedModeHelp = computed(() => {
  if (selectedVoiceMode.value === "cheetah") {
    return "Endpoint-based browser transcription";
  }
  if (selectedVoiceMode.value === "live") {
    return "Server Deepgram streaming";
  }
  return "Browser Web Speech fallback";
});

function modeDisabled(mode: ActiveVoiceMode): boolean {
  if (mode === "live") return !canUseLiveVoice.value;
  if (mode === "browser") return !canUseBrowserVoice.value;
  return !canUseCheetahVoice.value;
}

function handleSubmitWithText(text: string): void {
  const trimmed = (text || "").trim();
  if (!trimmed || isPending.value || !wsStore.isConnected) return;

  isPending.value = true;
  const sent = wsStore.submitUtterance(trimmed);

  if (sent) {
    utterance.value = "";
  }

  window.setTimeout(() => {
    isPending.value = false;
  }, 500);
}

function handleSubmit(): void {
  handleSubmitWithText(utterance.value);
}

function handleInputKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
}

function shouldIgnoreGlobalSpace(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;

  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  return target.isContentEditable;
}

async function handleGlobalKeydown(event: KeyboardEvent): Promise<void> {
  if (event.code !== "Space" || event.repeat) return;
  if (shouldIgnoreGlobalSpace(event)) return;

  event.preventDefault();
  await toggleVoice();
}

async function stopAllVoice(): Promise<void> {
  speechStore.stopListening();
  speechStore.clearTranscripts();

  liveStore.stopLiveSession("ui stopAllVoice");
  await cheetahStore.stopCheetahSession("ui stopAllVoice", { emitFinal: true });
}

async function startLive(): Promise<void> {
  if (!canUseLiveVoice.value) return;

  await stopAllVoice();
  selectedVoiceMode.value = "live";
  voiceMode.value = "live";

  try {
    await liveStore.startLiveSession();
  } catch {
    voiceMode.value = "off";
    await stopAllVoice();
  }
}

async function startBrowser(): Promise<void> {
  if (!canUseBrowserVoice.value) return;

  await stopAllVoice();
  selectedVoiceMode.value = "browser";
  voiceMode.value = "browser";

  try {
    speechStore.startListening();
  } catch {
    voiceMode.value = "off";
    await stopAllVoice();
  }
}

async function startCheetah(): Promise<void> {
  if (!canUseCheetahVoice.value) return;

  await stopAllVoice();
  selectedVoiceMode.value = "cheetah";
  voiceMode.value = "cheetah";
  cheetahStore.clearError();

  await cheetahStore.startCheetahSession();
  if (cheetahStore.status !== "connected") {
    voiceMode.value = "off";
  }
}

async function startMode(mode: ActiveVoiceMode): Promise<void> {
  if (mode === "live") {
    await startLive();
    return;
  }

  if (mode === "browser") {
    await startBrowser();
    return;
  }

  await startCheetah();
}

async function selectVoiceMode(mode: ActiveVoiceMode): Promise<void> {
  selectedVoiceMode.value = mode;

  if (!isVoiceOn.value || voiceMode.value === mode) return;
  await startMode(mode);
}

async function toggleVoice(): Promise<void> {
  if (!wsStore.isConnected) return;

  if (voiceMode.value === "off") {
    await startMode(selectedVoiceMode.value);
    return;
  }

  voiceMode.value = "off";
  await stopAllVoice();
}

function commitPreviews(): void {
  if (!wsStore.isConnected || previewCount.value === 0) return;

  const commands = wsStore.activePreviewIds.map((id) => ({
    type: "commit_preview_object" as const,
    id,
  }));

  wsStore.applyCommandEnvelope(
    { commands },
    `Commit ${commands.length} preview${commands.length === 1 ? "" : "s"}`,
  );
}

function cancelPreviews(): void {
  if (!wsStore.isConnected || previewCount.value === 0) return;

  const commands = wsStore.activePreviewIds.map((id) => ({
    type: "cancel_preview_object" as const,
    id,
  }));

  wsStore.applyCommandEnvelope(
    { commands },
    `Cancel ${commands.length} preview${commands.length === 1 ? "" : "s"}`,
  );
}

watch(
  () => wsStore.isConnected,
  async (connected) => {
    if (!connected && voiceMode.value !== "off") {
      voiceMode.value = "off";
      await stopAllVoice();
    }
  },
);

watch(
  () => liveStore.status,
  async (status, prev) => {
    if (voiceMode.value !== "live") return;

    if (status === "error") {
      voiceMode.value = "off";
      speechStore.stopListening();
      speechStore.clearTranscripts();
      return;
    }

    if (status === "disconnected" && prev === "connected") {
      voiceMode.value = "off";
      speechStore.stopListening();
      speechStore.clearTranscripts();
    }
  },
);

watch(
  () => cheetahStore.status,
  (status, prev) => {
    if (voiceMode.value !== "cheetah") return;

    if (status === "error") {
      voiceMode.value = "off";
      speechStore.stopListening();
      speechStore.clearTranscripts();
      liveStore.stopLiveSession("cheetah error fallback");
      return;
    }

    if (status === "disconnected" && prev === "connected") {
      voiceMode.value = "off";
      speechStore.stopListening();
      speechStore.clearTranscripts();
      liveStore.stopLiveSession("cheetah disconnected fallback");
    }
  },
);

watch(
  () => speechStore.finalTranscript,
  (text) => {
    if (voiceMode.value !== "browser") return;

    const trimmed = (text || "").trim();
    if (!trimmed || !wsStore.isConnected || isPending.value) return;

    speechStore.clearFinal();
    handleSubmitWithText(trimmed);
  },
);

watch(
  () => cheetahStore.finalTranscript,
  (text) => {
    const trimmed = (text || "").trim();
    if (!trimmed || !wsStore.isConnected || isPending.value) return;

    cheetahStore.clearFinalTranscript();
    handleSubmitWithText(trimmed);
  },
);

const stableGlobalKeydownHandler = (event: KeyboardEvent) => {
  void handleGlobalKeydown(event);
};

onMounted(() => {
  window.addEventListener("keydown", stableGlobalKeydownHandler);
});

onUnmounted(() => {
  window.removeEventListener("keydown", stableGlobalKeydownHandler);
  void stopAllVoice();
});
</script>

<template>
  <section class="dock-panel">
    <div class="dock-top">
      <div class="voice-meta">
        <span class="state-chip" :class="`state-${micVisualState}`">{{ voiceStateText }}</span>
        <span class="mode-note">{{ modeLabel }}</span>
      </div>
      <span class="connection-chip" :class="`ws-${wsStore.status}`">
        {{ wsStore.status }}
      </span>
    </div>

    <div class="dock-core">
      <button
        class="mic-button"
        :class="`mic-${micVisualState}`"
        type="button"
        :disabled="!wsStore.isConnected"
        @click="toggleVoice"
        :title="isVoiceOn ? 'Stop voice' : 'Start voice'"
      >
        <Loader2 v-if="micVisualState === 'processing'" :size="24" class="spin" />
        <Mic v-else-if="isVoiceOn" :size="24" />
        <MicOff v-else :size="24" />
      </button>

      <div class="composer">
        <div class="input-row">
          <input
            v-model="utterance"
            type="text"
            :disabled="!wsStore.isConnected"
            placeholder="Describe the scene change..."
            @keydown="handleInputKeydown"
          />

          <button
            class="send-btn"
            type="button"
            :disabled="!wsStore.isConnected || !utterance.trim() || isPending"
            @click="handleSubmit"
          >
            <Send :size="16" />
            <span>Send</span>
          </button>
        </div>

        <div class="voice-mode-row">
          <button
            class="mode-button"
            :class="{
              selected: selectedVoiceMode === 'cheetah',
              active: voiceMode === 'cheetah',
            }"
            type="button"
            :disabled="modeDisabled('cheetah')"
            @click="selectVoiceMode('cheetah')"
            :title="!cheetahStore.isConfigured ? 'Missing VITE_PICOVOICE_ACCESS_KEY' : 'Use Cheetah browser transcription'"
          >
            Cheetah
          </button>

          <button
            class="mode-button"
            :class="{
              selected: selectedVoiceMode === 'live',
              active: voiceMode === 'live',
            }"
            type="button"
            :disabled="modeDisabled('live')"
            @click="selectVoiceMode('live')"
          >
            Deepgram
          </button>

          <button
            class="mode-button"
            :class="{
              selected: selectedVoiceMode === 'browser',
              active: voiceMode === 'browser',
            }"
            type="button"
            :disabled="modeDisabled('browser')"
            @click="selectVoiceMode('browser')"
          >
            Browser
          </button>

          <span class="mode-hint">{{ selectedModeHelp }}. Press Space to start/stop.</span>
        </div>

        <p class="transcript-line" :class="{ error: !!overlayError }">
          {{ overlayError || transcriptLine }}
        </p>
      </div>
    </div>

    <div v-if="previewCount > 0" class="preview-row">
      <span class="preview-chip">
        Previewing {{ previewCount }} item{{ previewCount === 1 ? "" : "s" }}
      </span>

      <button class="preview-action commit" type="button" @click="commitPreviews">
        <Check :size="14" />
        Commit
      </button>

      <button class="preview-action cancel" type="button" @click="cancelPreviews">
        <X :size="14" />
        Cancel
      </button>
    </div>
  </section>
</template>

<style scoped>
.dock-panel {
  width: min(980px, calc(100vw - 32px));
  margin: 0 auto;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 16px 34px rgba(17, 24, 39, 0.14);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dock-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.voice-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.state-chip,
.connection-chip {
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.7);
}

.mode-note {
  font-size: 12px;
  color: var(--text-muted);
}

.state-idle {
  color: var(--text-muted);
}

.state-listening {
  color: var(--accent-teal);
  border-color: rgba(15, 118, 110, 0.38);
  background: rgba(15, 118, 110, 0.1);
}

.state-processing {
  color: var(--accent-amber);
  border-color: rgba(217, 119, 6, 0.36);
  background: rgba(217, 119, 6, 0.1);
}

.state-error {
  color: var(--error);
  border-color: rgba(225, 29, 72, 0.36);
  background: rgba(225, 29, 72, 0.1);
}

.ws-connected {
  color: var(--success);
  border-color: rgba(22, 163, 74, 0.35);
  background: rgba(22, 163, 74, 0.1);
}

.ws-connecting {
  color: var(--warning);
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.1);
}

.ws-disconnected,
.ws-error {
  color: var(--error);
  border-color: rgba(225, 29, 72, 0.35);
  background: rgba(225, 29, 72, 0.1);
}

.dock-core {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.mic-button {
  width: 72px;
  height: 72px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.96);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

.mic-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.mic-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mic-listening {
  border-color: rgba(15, 118, 110, 0.62);
  color: var(--accent-teal);
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.14), 0 0 20px rgba(15, 118, 110, 0.2);
  animation: pulse 1.8s ease-in-out infinite;
}

.mic-processing {
  border-color: rgba(217, 119, 6, 0.5);
  color: var(--accent-amber);
  box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.12), 0 0 18px rgba(217, 119, 6, 0.15);
}

.mic-error {
  border-color: rgba(225, 29, 72, 0.48);
  color: var(--error);
  box-shadow: 0 0 0 2px rgba(225, 29, 72, 0.1), 0 0 18px rgba(225, 29, 72, 0.13);
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

input {
  height: 46px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.92);
  color: var(--text-primary);
  padding: 0 14px;
  font-size: 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input::placeholder {
  color: var(--text-muted);
}

input:focus {
  outline: none;
  border-color: rgba(15, 118, 110, 0.45);
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12);
}

input:disabled {
  opacity: 0.5;
}

.send-btn,
.preview-action,
.mode-button {
  height: 46px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.84);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.send-btn:hover:not(:disabled),
.mode-button:hover:not(:disabled),
.preview-action:hover {
  transform: translateY(-1px);
  border-color: rgba(15, 118, 110, 0.34);
  background: rgba(15, 118, 110, 0.08);
}

.send-btn {
  border-color: rgba(15, 118, 110, 0.35);
  color: #ffffff;
  background: var(--accent-teal);
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-teal-hover);
  color: #ffffff;
}

.send-btn:disabled,
.mode-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-mode-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mode-button {
  height: 32px;
  padding: 0 12px;
  border-radius: 11px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.8);
}

.mode-button.selected {
  border-color: rgba(15, 118, 110, 0.34);
  color: var(--accent-teal);
}

.mode-button.active {
  border-color: rgba(15, 118, 110, 0.42);
  background: rgba(15, 118, 110, 0.12);
  color: var(--accent-teal);
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.12);
}

.mode-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.transcript-line {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.transcript-line.error {
  color: var(--error);
}

.preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-chip {
  height: 34px;
  border-radius: 999px;
  border: 1px solid rgba(217, 119, 6, 0.35);
  background: rgba(217, 119, 6, 0.1);
  color: var(--accent-amber);
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  font-size: 12px;
}

.preview-action {
  height: 34px;
  border-radius: 12px;
  padding: 0 12px;
  font-size: 12px;
}

.preview-action.commit {
  border-color: rgba(22, 163, 74, 0.35);
  color: var(--success);
  background: rgba(22, 163, 74, 0.1);
}

.preview-action.cancel {
  border-color: rgba(225, 29, 72, 0.35);
  color: var(--error);
  background: rgba(225, 29, 72, 0.1);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12), 0 0 18px rgba(15, 118, 110, 0.17);
  }
  50% {
    box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.2), 0 0 26px rgba(15, 118, 110, 0.24);
  }
}

@media (max-width: 920px) {
  .dock-panel {
    width: calc(100vw - 20px);
    padding: 12px;
  }

  .dock-core {
    grid-template-columns: 58px minmax(0, 1fr);
  }

  .mic-button {
    width: 58px;
    height: 58px;
  }

  .mode-hint {
    width: 100%;
  }
}
</style>

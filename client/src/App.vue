<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  Waves,
} from "lucide-vue-next";
import CanvasStage from "./canvas/CanvasStage.vue";
import UtteranceInput from "./components/UtteranceInput.vue";
import StudioLeftPanel from "./components/StudioLeftPanel.vue";
import LayersPanel from "./components/LayersPanel.vue";
import ManualConsole from "./components/ManualConsole.vue";
import TimelinePanel from "./components/TimelinePanel.vue";
import DebugPanel from "./components/DebugPanel.vue";
import { wsStore } from "./state/wsStore";

type ToastLevel = "info" | "warn" | "error" | "success";

type ToastItem = {
  id: number;
  message: string;
  level: ToastLevel;
};

const leftPanelOpen = ref(true);
const rightPanelOpen = ref(true);
const selectedObjectId = ref<string | null>(null);

const toasts = ref<ToastItem[]>([]);
let toastCounter = 0;
let lastProcessedEventId: string | null = null;

const debugMode = computed(
  () => new URLSearchParams(window.location.search).get("debug") === "1",
);

const connectionLabel = computed(() => {
  if (wsStore.status === "connected") return "Connected";
  if (wsStore.status === "connecting") return "Connecting";
  if (wsStore.status === "error") return "Offline";
  return "Offline";
});

function pushToast(message: string, level: ToastLevel = "info"): void {
  const trimmed = message.trim();
  if (!trimmed) return;

  const id = ++toastCounter;
  toasts.value = [...toasts.value, { id, message: trimmed, level }];

  window.setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }, 3600);
}

onMounted(() => {
  wsStore.connect();
});

onUnmounted(() => {
  wsStore.disconnect();
});

watch(
  () => wsStore.status,
  (status, prev) => {
    if (status === "connected" && prev && prev !== "connected") {
      pushToast("WebSocket reconnected.", "success");
      return;
    }

    if (
      (status === "disconnected" || status === "error") &&
      prev === "connected"
    ) {
      pushToast("Connection lost. Reconnecting...", "warn");
    }
  },
);

watch(
  () => wsStore.lastError,
  (error, prev) => {
    if (error && error !== prev) {
      pushToast(error, "error");
    }
  },
);

watch(
  () => wsStore.sessionEvents.length,
  () => {
    if (wsStore.sessionEvents.length === 0) return;

    const event = wsStore.sessionEvents[wsStore.sessionEvents.length - 1];
    if (!event || event.id === lastProcessedEventId) return;

    lastProcessedEventId = event.id;

    if (event.status === "rejected" || event.status === "refused") {
      pushToast(event.notes || "Request was refused.", "warn");
    } else if (event.status === "error") {
      pushToast(event.notes || "Failed to apply request.", "error");
    }
  },
);

watch(
  () => wsStore.scene.order,
  () => {
    if (!selectedObjectId.value) return;
    if (!wsStore.scene.objects[selectedObjectId.value]) {
      selectedObjectId.value = null;
    }
  },
  { deep: true },
);
</script>

<template>
  <div class="studio-root">
    <div class="aurora-layer" aria-hidden="true"></div>

    <header class="top-bar glass">
      <div class="brand">
        <div class="brand-icon" aria-hidden="true"></div>
        <div>
          <p class="brand-title">IntelliCanvas</p>
          <p class="brand-subtitle">Intelligent Voice Canvas</p>
        </div>
      </div>

      <div class="session-title">Untitled Session</div>

      <div class="top-actions">
        <span class="connection-pill" :class="`ws-${wsStore.status}`">
          <span class="state-dot"></span>
          {{ connectionLabel }}
        </span>
        <button class="icon-button" type="button" aria-label="Settings">
          <Settings2 :size="17" />
        </button>
      </div>
    </header>

    <main class="workspace">
      <aside class="side-column left" :class="{ collapsed: !leftPanelOpen }">
        <button
          class="collapse-button"
          type="button"
          @click="leftPanelOpen = !leftPanelOpen"
          :aria-label="leftPanelOpen ? 'Collapse transcript panel' : 'Expand transcript panel'"
        >
          <PanelLeftClose v-if="leftPanelOpen" :size="16" />
          <PanelLeftOpen v-else :size="16" />
        </button>

        <Transition name="slide-fade-left">
          <div v-if="leftPanelOpen" class="panel-shell glass">
            <StudioLeftPanel />
          </div>
        </Transition>
      </aside>

      <section class="canvas-column">
        <CanvasStage :selectedObjectId="selectedObjectId" />
      </section>

      <aside class="side-column right" :class="{ collapsed: !rightPanelOpen }">
        <button
          class="collapse-button"
          type="button"
          @click="rightPanelOpen = !rightPanelOpen"
          :aria-label="rightPanelOpen ? 'Collapse layers panel' : 'Expand layers panel'"
        >
          <PanelRightClose v-if="rightPanelOpen" :size="16" />
          <PanelRightOpen v-else :size="16" />
        </button>

        <Transition name="slide-fade-right">
          <div v-if="rightPanelOpen" class="panel-shell glass">
            <LayersPanel
              :selectedObjectId="selectedObjectId"
              @select="selectedObjectId = $event"
            />
          </div>
        </Transition>
      </aside>
    </main>

    <footer class="dock-wrap">
      <UtteranceInput />
    </footer>

    <section v-if="debugMode" class="debug-area">
      <div class="panel-shell glass"><ManualConsole /></div>
      <div class="panel-shell glass"><TimelinePanel /></div>
      <div class="panel-shell glass"><DebugPanel /></div>
    </section>

    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast-${toast.level}`"
      >
        <Waves :size="14" />
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.studio-root {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  color: var(--text-primary);
}

.aurora-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(50% 36% at 14% 9%, rgba(217, 119, 6, 0.1), transparent 68%),
    radial-gradient(48% 34% at 84% 6%, rgba(15, 118, 110, 0.08), transparent 70%),
    radial-gradient(62% 48% at 55% 102%, rgba(17, 24, 39, 0.06), transparent 74%);
}

.glass {
  border: 1px solid var(--panel-border);
  border-radius: 16px;
  background: var(--panel-surface);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  box-shadow: 0 12px 32px rgba(17, 24, 39, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.32);
}

.top-bar {
  z-index: 2;
  position: relative;
  min-height: 66px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 10px 16px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
}

.brand-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 32%, #1f9389 0%, var(--accent-teal) 70%);
  box-shadow: 0 6px 16px rgba(15, 118, 110, 0.22);
  position: relative;
}

.brand-icon::after {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  top: -1px;
  right: -1px;
  background: var(--accent-amber);
  box-shadow: 0 0 0 2px rgba(250, 246, 239, 0.92);
}

.brand-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.brand-subtitle {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.session-title {
  justify-self: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
}

.top-actions {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.connection-pill {
  height: 34px;
  border-radius: 999px;
  padding: 0 12px;
  border: 1px solid var(--panel-border);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0.01em;
  background: rgba(255, 255, 255, 0.6);
}

.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
}

.ws-connected {
  color: var(--success);
  border-color: rgba(22, 163, 74, 0.35);
  background: rgba(22, 163, 74, 0.1);
}

.ws-connected .state-dot {
  background: var(--success);
  box-shadow: 0 0 8px rgba(22, 163, 74, 0.45);
}

.ws-connecting {
  color: var(--warning);
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.1);
}

.ws-connecting .state-dot {
  background: var(--warning);
}

.ws-disconnected,
.ws-error {
  color: var(--error);
  border-color: rgba(225, 29, 72, 0.35);
  background: rgba(225, 29, 72, 0.1);
}

.ws-disconnected .state-dot,
.ws-error .state-dot {
  background: var(--error);
}

.icon-button,
.collapse-button {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
}

.icon-button:hover,
.collapse-button:hover {
  transform: translateY(-1px);
  border-color: rgba(15, 118, 110, 0.35);
  background: rgba(15, 118, 110, 0.11);
  color: var(--text-primary);
}

.workspace {
  z-index: 1;
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

.side-column {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-height: 0;
}

.side-column.left {
  flex-direction: row;
}

.side-column.right {
  flex-direction: row-reverse;
}

.side-column.collapsed .panel-shell {
  display: none;
}

.panel-shell {
  width: 312px;
  min-height: 0;
  padding: 14px;
}

.canvas-column {
  min-width: 0;
  display: flex;
}

.dock-wrap {
  z-index: 2;
  position: sticky;
  bottom: 16px;
}

.debug-area {
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.debug-area .panel-shell {
  width: auto;
}

.toast-stack {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast {
  min-width: 250px;
  max-width: 360px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.92);
  color: var(--text-primary);
  padding: 10px 12px;
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.35;
  box-shadow: 0 12px 28px rgba(17, 24, 39, 0.16);
}

.toast-info {
  border-color: rgba(15, 118, 110, 0.3);
}

.toast-success {
  border-color: rgba(22, 163, 74, 0.32);
}

.toast-warn {
  border-color: rgba(245, 158, 11, 0.32);
}

.toast-error {
  border-color: rgba(225, 29, 72, 0.32);
}

.slide-fade-left-enter-active,
.slide-fade-left-leave-active,
.slide-fade-right-enter-active,
.slide-fade-right-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.slide-fade-left-enter-from,
.slide-fade-left-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.slide-fade-right-enter-from,
.slide-fade-right-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

@media (max-width: 1200px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .side-column {
    display: none;
  }

  .top-bar {
    grid-template-columns: 1fr auto;
    row-gap: 6px;
  }

  .session-title {
    grid-column: 1 / -1;
    justify-self: start;
    padding-left: 2px;
  }

  .debug-area {
    grid-template-columns: 1fr;
  }
}
</style>

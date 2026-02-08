<script setup lang="ts">
import { computed, ref } from "vue";
import { Copy, MessageSquareText, Activity } from "lucide-vue-next";
import { wsStore } from "../state/wsStore";
import type { SessionEvent } from "@shared/ws";

type PanelTab = "transcript" | "activity";

const activeTab = ref<PanelTab>("transcript");
const copied = ref(false);

const events = computed(() => wsStore.sessionEvents);

const transcriptEvents = computed(() =>
  events.value.filter((event) => event.utterance && event.utterance.trim().length > 0),
);

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function eventSummary(event: SessionEvent): string {
  if (event.diffSummary && event.diffSummary.trim().length > 0) {
    return event.diffSummary;
  }

  if (event.status === "applied") {
    return `Applied ${event.commands.length} command${event.commands.length === 1 ? "" : "s"}.`;
  }

  if (event.notes && event.notes.trim().length > 0) {
    return event.notes;
  }

  if (event.status === "rejected" || event.status === "refused") {
    return "Request could not be applied.";
  }

  if (event.status === "error") {
    return "An error occurred while applying this request.";
  }

  return "No activity details available.";
}

async function copyTranscript(): Promise<void> {
  if (transcriptEvents.value.length === 0) return;

  const content = transcriptEvents.value
    .map((event) => `[${formatTime(event.timestamp)}] ${event.utterance}`)
    .join("\n");

  try {
    await navigator.clipboard.writeText(content);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1200);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2 class="title">Session Feed</h2>
      <button
        class="copy-btn"
        type="button"
        @click="copyTranscript"
        :disabled="transcriptEvents.length === 0"
      >
        <Copy :size="14" />
        <span>{{ copied ? "Copied" : "Copy Transcript" }}</span>
      </button>
    </div>

    <div class="tabs" role="tablist" aria-label="Left Panel Tabs">
      <button
        class="tab"
        :class="{ active: activeTab === 'transcript' }"
        role="tab"
        type="button"
        @click="activeTab = 'transcript'"
      >
        <MessageSquareText :size="14" />
        Transcript
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'activity' }"
        role="tab"
        type="button"
        @click="activeTab = 'activity'"
      >
        <Activity :size="14" />
        Activity
      </button>
    </div>

    <div class="scroll-area" v-if="activeTab === 'transcript'">
      <div v-if="transcriptEvents.length === 0" class="empty">
        Final utterances will appear here once you start speaking or typing.
      </div>

      <article
        v-for="event in transcriptEvents"
        :key="event.id"
        class="card transcript-card"
      >
        <header>
          <span class="badge">{{ formatTime(event.timestamp) }}</span>
        </header>
        <p class="utterance">{{ event.utterance }}</p>
      </article>
    </div>

    <div class="scroll-area" v-else>
      <div v-if="events.length === 0" class="empty">
        Applied actions will appear here as your scene evolves.
      </div>

      <article v-for="event in events" :key="event.id" class="card activity-card">
        <header>
          <span class="badge">{{ formatTime(event.timestamp) }}</span>
          <span
            class="status"
            :class="`status-${event.status}`"
          >
            {{ event.status }}
          </span>
        </header>
        <p class="activity">{{ eventSummary(event) }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.title {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
}

.copy-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(15, 118, 110, 0.32);
  background: rgba(15, 118, 110, 0.08);
  color: var(--accent-teal);
}

.copy-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(17, 24, 39, 0.1);
  padding-bottom: 8px;
}

.tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.tab:hover {
  color: var(--text-secondary);
}

.tab.active {
  color: var(--accent-teal);
  border-color: rgba(15, 118, 110, 0.28);
  background: rgba(15, 118, 110, 0.1);
}

.scroll-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;
}

.empty {
  border: 1px dashed var(--panel-border);
  border-radius: 14px;
  padding: 16px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
  background: rgba(255, 255, 255, 0.54);
}

.card {
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.68);
  padding: 12px;
  box-shadow: 0 7px 16px rgba(17, 24, 39, 0.08);
}

.card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.badge {
  font-size: 11px;
  color: var(--text-muted);
}

.utterance {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.45;
  font-size: 14px;
}

.activity {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.45;
  font-size: 13px;
}

.status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 66px;
  height: 22px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.status-applied {
  color: var(--success);
  border-color: rgba(22, 163, 74, 0.3);
  background: rgba(22, 163, 74, 0.1);
}

.status-rejected,
.status-refused {
  color: var(--warning);
  border-color: rgba(245, 158, 11, 0.32);
  background: rgba(245, 158, 11, 0.1);
}

.status-error {
  color: var(--error);
  border-color: rgba(225, 29, 72, 0.32);
  background: rgba(225, 29, 72, 0.1);
}
</style>

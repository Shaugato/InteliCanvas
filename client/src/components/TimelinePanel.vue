<script setup lang="ts">
import { ref, computed } from 'vue'
import { wsStore } from '../state/wsStore'
import { Copy, Check, X, AlertCircle, Clock } from 'lucide-vue-next'
import type { SessionEvent } from '@shared/ws'

function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

const selectedEventId = ref<string | null>(null)
const copied = ref(false)

const events = computed(() => wsStore.sessionEvents)

function selectEvent(event: SessionEvent) {
  selectedEventId.value = selectedEventId.value === event.id ? null : event.id
}

const selectedEvent = computed(() => {
  if (!selectedEventId.value) return null
  return events.value.find(e => e.id === selectedEventId.value) || null
})

function copyJson() {
  if (!selectedEvent.value) return
  const json = JSON.stringify({ commands: selectedEvent.value.commands }, null, 2)
  navigator.clipboard.writeText(json)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'applied': return Check
    case 'rejected': return X
    case 'error': return AlertCircle
    default: return Clock
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case 'applied': return 'status-applied'
    case 'rejected': return 'status-rejected'
    case 'error': return 'status-error'
    default: return 'status-default'
  }
}
</script>

<template>
  <div class="timeline-panel">
    <div class="panel-header">
      <h3>Timeline</h3>
      <span class="revision-label">Rev {{ wsStore.revision }}</span>
    </div>
    
    <div class="stats-row">
      <span>Events: {{ events.length }}</span>
      <span>Active previews: {{ wsStore.activePreviewIds.length }}</span>
    </div>
    
    <div class="event-list" data-testid="timeline-list">
      <div 
        v-for="event in events" 
        :key="event.id"
        class="event-item"
        :class="{ selected: selectedEventId === event.id }"
        @click="selectEvent(event)"
        :data-testid="`event-item-${event.id}`"
      >
        <div class="event-header">
          <span class="timestamp">{{ formatTimestamp(event.timestamp) }}</span>
          <span class="status-badge" :class="getStatusClass(event.status)">
            <component :is="getStatusIcon(event.status)" :size="12" />
          </span>
        </div>
        <div class="utterance">{{ event.utterance }}</div>
        <div v-if="event.diffSummary" class="diff-summary">{{ event.diffSummary }}</div>
      </div>
      
      <div v-if="events.length === 0" class="empty-state">
        No events yet. Submit an utterance to see history.
      </div>
    </div>
    
    <div v-if="selectedEvent" class="event-inspector" data-testid="event-inspector">
      <div class="inspector-header">
        <span>Event Details</span>
        <button @click="copyJson" class="copy-btn" data-testid="button-copy-json">
          <Copy :size="14" />
          {{ copied ? 'Copied!' : 'Copy JSON' }}
        </button>
      </div>
      <div class="inspector-meta">
        <span v-if="selectedEvent.latencyMs">Latency: {{ selectedEvent.latencyMs }}ms</span>
        <span v-if="selectedEvent.notes">Notes: {{ selectedEvent.notes }}</span>
      </div>
      <pre class="inspector-json">{{ JSON.stringify({ commands: selectedEvent.commands }, null, 2) }}</pre>
    </div>
  </div>
</template>

<style scoped>
.timeline-panel {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  max-height: 400px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.revision-label {
  padding: 2px 8px;
  background: rgba(99, 102, 241, 0.2);
  border-radius: 10px;
  font-size: 11px;
  font-family: monospace;
  color: #a5b4fc;
}

.stats-row {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: #64748b;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.event-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.event-item {
  padding: 8px 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.event-item:hover {
  background: rgba(255,255,255,0.06);
}

.event-item.selected {
  background: rgba(99, 102, 241, 0.15);
  border-color: #6366f1;
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.timestamp {
  font-size: 10px;
  color: #64748b;
  font-family: 'JetBrains Mono', monospace;
}

.status-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
}

.status-applied {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.status-rejected {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.status-error {
  background: rgba(251, 146, 60, 0.2);
  color: #fb923c;
}

.status-default {
  background: rgba(100, 116, 139, 0.2);
  color: #64748b;
}

.utterance {
  font-size: 12px;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.diff-summary {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-state {
  text-align: center;
  padding: 24px;
  color: #64748b;
  font-size: 12px;
}

.event-inspector {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.1);
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.copy-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.05);
  color: #cbd5e1;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.copy-btn:hover {
  background: rgba(255,255,255,0.1);
}

.inspector-meta {
  display: flex;
  gap: 12px;
  font-size: 10px;
  color: #64748b;
  margin-bottom: 8px;
}

.inspector-json {
  background: #0a0a14;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  padding: 8px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: #a5b4fc;
  max-height: 120px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
}
</style>

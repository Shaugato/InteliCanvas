<script setup lang="ts">
import { computed } from 'vue'
import { wsStore } from '../state/wsStore'

const sceneJson = computed(() => JSON.stringify(wsStore.scene, null, 2))
const eventsCount = computed(() => wsStore.sessionEvents.length)
const lastEvent = computed(() => {
  if (wsStore.sessionEvents.length === 0) return null
  return wsStore.sessionEvents[wsStore.sessionEvents.length - 1]
})

function copyScene() {
  navigator.clipboard.writeText(sceneJson.value)
}

function copyLastEvent() {
  if (lastEvent.value) {
    navigator.clipboard.writeText(JSON.stringify({ commands: lastEvent.value.commands }, null, 2))
  }
}
</script>

<template>
  <div class="debug-panel">
    <h3>Debug Panel</h3>
    
    <div class="stat-row">
      <span>Revision:</span>
      <strong>{{ wsStore.revision }}</strong>
    </div>
    
    <div class="stat-row">
      <span>Events:</span>
      <strong>{{ eventsCount }}</strong>
    </div>
    
    <div class="stat-row">
      <span>WS Status:</span>
      <strong :class="wsStore.status">{{ wsStore.status }}</strong>
    </div>
    
    <div class="section">
      <div class="section-header">
        <span>Scene JSON</span>
        <button @click="copyScene" data-testid="button-copy-scene">Copy</button>
      </div>
      <pre class="json-view">{{ sceneJson }}</pre>
    </div>
    
    <div v-if="lastEvent" class="section">
      <div class="section-header">
        <span>Last Event: {{ lastEvent.utterance }}</span>
        <button @click="copyLastEvent" data-testid="button-copy-event">Copy</button>
      </div>
      <pre class="json-view small">{{ lastEvent.diffSummary || `${lastEvent.commands.length} command(s)` }}</pre>
    </div>
  </div>
</template>

<style scoped>
.debug-panel {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 16px;
}

h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  font-size: 13px;
  color: #94a3b8;
}

.stat-row strong {
  color: #22c55e;
}

.stat-row strong.connected {
  color: #22c55e;
}

.stat-row strong.connecting {
  color: #f59e0b;
}

.stat-row strong.disconnected,
.stat-row strong.error {
  color: #ef4444;
}

.section {
  margin-top: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
  color: #64748b;
}

.section-header button {
  padding: 4px 8px;
  background: #374151;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  cursor: pointer;
}

.section-header button:hover {
  background: #4b5563;
}

.json-view {
  background: #0a0a14;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  padding: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #94a3b8;
  overflow: auto;
  max-height: 200px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.json-view.small {
  max-height: 60px;
}
</style>

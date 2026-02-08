<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { wsStore } from '../state/wsStore'
import { CommandEnvelopeSchema } from '@shared/index'
import { demoSteps } from '../demo/demoEnvelopes'
import { Check } from 'lucide-vue-next'

const jsonInput = ref('')
const autoApply = ref(false)
const selectedIndex = ref<number | null>(null)
const appliedIndex = ref<number | null>(null)
const completed = reactive(new Set<number>())

type StatusKind = 'idle' | 'loaded' | 'validated_ok' | 'validated_err' | 'applied_ok' | 'applied_err'
const status = ref<{ kind: StatusKind; msg?: string }>({ kind: 'idle' })

function getStepName(index: number): string {
  const step = demoSteps[index]
  if (!step) return `Step ${index + 1}`
  const parts = step.name.split(': ')
  return parts.length > 1 ? parts[1] : step.name
}

function handleLoadStep(index: number) {
  const step = demoSteps[index]
  if (!step) return
  
  selectedIndex.value = index
  jsonInput.value = JSON.stringify(step.envelope, null, 2)
  status.value = { kind: 'loaded', msg: `Loaded: ${getStepName(index)}` }
  
  if (autoApply.value) {
    doApplyFromTextarea()
  }
}

function handleNextStep() {
  let next: number
  if (selectedIndex.value === null) {
    next = 0
  } else {
    next = Math.min(selectedIndex.value + 1, demoSteps.length - 1)
  }
  handleLoadStep(next)
}

function handleValidate() {
  try {
    const obj = JSON.parse(jsonInput.value)
    const parsed = CommandEnvelopeSchema.safeParse(obj)
    if (parsed.success) {
      status.value = { kind: 'validated_ok', msg: 'Valid envelope' }
    } else {
      status.value = { kind: 'validated_err', msg: parsed.error.issues[0]?.message || 'Invalid envelope' }
    }
  } catch {
    status.value = { kind: 'validated_err', msg: 'Invalid JSON (cannot parse)' }
  }
}


function doApplyFromTextarea() {
  if (!wsStore.isConnected) {
    status.value = { kind: 'applied_err', msg: 'WS not connected — cannot apply' }
    return
  }

  const stepName = selectedIndex.value !== null ? getStepName(selectedIndex.value) : 'Manual command'

  let obj: unknown
  try {
    obj = JSON.parse(jsonInput.value)
  } catch {
    status.value = { kind: 'applied_err', msg: 'Invalid JSON (cannot parse)' }
    return
  }

  const parsed = CommandEnvelopeSchema.safeParse(obj)
  if (!parsed.success) {
    status.value = { kind: 'applied_err', msg: parsed.error.issues[0]?.message || 'Invalid envelope' }
    return
  }

  const sent = wsStore.applyCommandEnvelope(parsed.data, stepName)
  if (!sent) {
    status.value = { kind: 'applied_err', msg: 'Failed to send to server' }
    return
  }

  // Keep your completion UI logic
  if (selectedIndex.value !== null) {
    const expectedJson = JSON.stringify(demoSteps[selectedIndex.value].envelope, null, 2)
    if (jsonInput.value.trim() === expectedJson.trim()) {
      completed.add(selectedIndex.value)
      appliedIndex.value = selectedIndex.value
    }
  }

  status.value = { kind: 'applied_ok', msg: 'Sent to server (awaiting scene_update)' }
}


function handleApply() {
  doApplyFromTextarea()
}

function handleClear() {
  jsonInput.value = ''
  status.value = { kind: 'idle', msg: 'Cleared' }
}

function handleReset() {
  if (!wsStore.isConnected) {
    status.value = { kind: 'applied_err', msg: 'WS not connected — cannot reset' }
    return
  }

  const sent = wsStore.resetScene()
  if (!sent) {
    status.value = { kind: 'applied_err', msg: 'Failed to send reset to server' }
    return
  }

  selectedIndex.value = null
  appliedIndex.value = null
  completed.clear()
  jsonInput.value = ''
  status.value = { kind: 'applied_ok', msg: 'Reset sent to server (awaiting scene_update)' }
}


const selectedName = computed(() => {
  if (selectedIndex.value === null) return 'None'
  return getStepName(selectedIndex.value)
})

const appliedName = computed(() => {
  if (appliedIndex.value === null) return 'None'
  return getStepName(appliedIndex.value)
})

const completedCount = computed(() => completed.size)

function isSelected(i: number) {
  return i === selectedIndex.value
}

function isCompleted(i: number) {
  return completed.has(i)
}

function isLastApplied(i: number) {
  return i === appliedIndex.value
}

function getButtonClasses(i: number) {
  const classes = ['step-btn']
  if (isSelected(i)) {
    classes.push('selected')
  }
  if (isLastApplied(i)) {
    classes.push('last-applied')
  }
  return classes.join(' ')
}

const statusClass = computed(() => {
  const kind = status.value.kind
  if (kind === 'validated_ok' || kind === 'applied_ok') return 'success'
  if (kind === 'validated_err' || kind === 'applied_err') return 'error'
  return 'neutral'
})
</script>

<template>
  <div class="console-panel">
    <h3>Manual Console</h3>
    
    <div class="toggle-row">
      <label class="toggle-label">
        <input type="checkbox" v-model="autoApply" data-testid="checkbox-auto-apply" />
        <span>Auto-apply on load</span>
      </label>
    </div>
    
    <div class="demo-buttons">
      <button 
        v-for="(step, i) in demoSteps" 
        :key="i"
        @click="handleLoadStep(i)"
        :class="getButtonClasses(i)"
        :title="step.name"
        :data-testid="`button-step-${i}`"
      >
        <span class="btn-label">{{ getStepName(i) }}</span>
        <span v-if="isCompleted(i)" class="check-badge">
          <Check :size="12" />
        </span>
      </button>
    </div>
    
    <div class="status-strip">
      <span><strong>Selected:</strong> {{ selectedName }}</span>
      <span><strong>Last applied:</strong> {{ appliedName }}</span>
      <span><strong>Completed:</strong> {{ completedCount }}/{{ demoSteps.length }}</span>
      <span class="auto-indicator" :class="{ on: autoApply }">Auto: {{ autoApply ? 'ON' : 'OFF' }}</span>
    </div>
    
    <div class="nav-row">
      <button @click="handleNextStep" class="next-btn" :disabled="selectedIndex !== null && selectedIndex >= demoSteps.length - 1" data-testid="button-next-step">
        Next Step
      </button>
    </div>
    
    <textarea 
      v-model="jsonInput" 
      placeholder="Paste CommandEnvelope JSON here..."
      rows="10"
      data-testid="input-json"
    ></textarea>
    
    <div class="button-row">
      <button @click="handleValidate" data-testid="button-validate">Validate</button>
      <button @click="handleApply" data-testid="button-apply">Apply</button>
      <button @click="handleClear" data-testid="button-clear">Clear</button>
      <button @click="handleReset" class="reset-btn" data-testid="button-reset">Reset Scene</button>
    </div>
    
    <div 
      v-if="status.msg" 
      class="result"
      :class="statusClass"
      data-testid="text-result"
    >
      {{ status.msg }}
    </div>
  </div>
</template>

<style scoped>
.console-panel {
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

.toggle-row {
  margin-bottom: 12px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #94a3b8;
  cursor: pointer;
}

.toggle-label input {
  width: 16px;
  height: 16px;
  accent-color: #6366f1;
}

.demo-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.step-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
  transition: all 0.15s;
}

.step-btn:hover {
  background: #334155;
}

.step-btn.selected {
  background: #2563eb;
  border-color: #60a5fa;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
  color: #fff;
}

.step-btn.last-applied {
  box-shadow: 0 0 0 2px #22c55e;
}

.step-btn.selected.last-applied {
  box-shadow: 0 0 0 2px #22c55e, 0 0 10px rgba(59, 130, 246, 0.4);
}

.btn-label {
  flex: 1;
}

.check-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: #22c55e;
  border-radius: 50%;
  color: #fff;
  margin-left: 4px;
}

.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 12px;
}

.status-strip strong {
  color: #cbd5e1;
}

.auto-indicator {
  padding: 2px 6px;
  border-radius: 3px;
  background: #374151;
}

.auto-indicator.on {
  background: #166534;
  color: #86efac;
}

.nav-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.next-btn {
  padding: 8px 16px;
  background: #6366f1;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}

.next-btn:hover:not(:disabled) {
  background: #4f46e5;
}

.next-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

textarea {
  width: 100%;
  background: #0a0a14;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  color: #e2e8f0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 12px;
  resize: vertical;
  box-sizing: border-box;
}

.button-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.button-row button {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  background: #374151;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}

.button-row button:hover {
  background: #4b5563;
}

.reset-btn {
  background: #dc2626 !important;
}

.reset-btn:hover {
  background: #ef4444 !important;
}

.result {
  margin-top: 12px;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  word-break: break-word;
}

.result.success {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.result.error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.result.neutral {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}
</style>

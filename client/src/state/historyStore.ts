import { reactive } from 'vue'
import type { SceneGraph } from '@shared/scene'
import { CommandEnvelopeSchema } from '@shared/index'
import { createEmptyScene, applyCommands } from './reducer'
import { createEvent, type SessionEvent } from './sessionEvents'
import { summarizeDiff } from './diffSummary'

interface HistoryState {
  baseScene: SceneGraph
  scene: SceneGraph
  events: SessionEvent[]
  redoStack: SessionEvent[]
  lastApplyMs: number
}

const state = reactive<HistoryState>({
  baseScene: createEmptyScene(),
  scene: createEmptyScene(),
  events: [],
  redoStack: [],
  lastApplyMs: 0
})

function rebuildScene(events: SessionEvent[]): SceneGraph {
  let result = state.baseScene
  for (const event of events) {
    if (event.status === 'applied') {
      result = applyCommands(result, event.commands)
    }
  }
  return result
}

export const historyStore = reactive({
  get scene() {
    return state.scene
  },
  
  get events() {
    return state.events
  },
  
  get redoStack() {
    return state.redoStack
  },
  
  get lastApplyMs() {
    return state.lastApplyMs
  },
  
  get canUndo() {
    return state.events.length > 0
  },
  
  get canRedo() {
    return state.redoStack.length > 0
  },

  validateEnvelope(jsonString: string): { ok: boolean; error?: string } {
    try {
      const parsed = JSON.parse(jsonString)
      const result = CommandEnvelopeSchema.safeParse(parsed)
      if (!result.success) {
        return { ok: false, error: result.error.message }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Parse error' }
    }
  },

  applyEvent(
    utterance: string,
    jsonString: string,
    latencyMs?: number
  ): { ok: boolean; error?: string; event?: SessionEvent } {
    const startTime = performance.now()
    
    try {
      const parsed = JSON.parse(jsonString)
      const result = CommandEnvelopeSchema.safeParse(parsed)
      
      if (!result.success) {
        const errorEvent = createEvent(utterance, [], 'rejected', {
          notes: result.error.message,
          latencyMs
        })
        return { ok: false, error: result.error.message, event: errorEvent }
      }
      
      const envelope = result.data
      const prevScene = state.scene
      
      const event = createEvent(utterance, envelope.commands, 'applied', {
        latencyMs
      })
      
      const newEvents = [...state.events, event]
      const nextScene = rebuildScene(newEvents)
      
      event.diffSummary = summarizeDiff(prevScene, nextScene, envelope.commands)
      
      state.events = newEvents
      state.scene = nextScene
      state.redoStack = []
      state.lastApplyMs = Math.round(performance.now() - startTime)
      
      return { ok: true, event }
    } catch (e) {
      const errorEvent = createEvent(utterance, [], 'error', {
        notes: e instanceof Error ? e.message : 'Unknown error',
        latencyMs
      })
      return { ok: false, error: e instanceof Error ? e.message : 'Unknown error', event: errorEvent }
    }
  },

  undo(): boolean {
    if (state.events.length === 0) {
      return false
    }
    
    const lastEvent = state.events[state.events.length - 1]
    const newEvents = state.events.slice(0, -1)
    
    state.events = newEvents
    state.redoStack = [...state.redoStack, lastEvent]
    state.scene = rebuildScene(newEvents)
    
    return true
  },

  redo(): boolean {
    if (state.redoStack.length === 0) {
      return false
    }
    
    const event = state.redoStack[state.redoStack.length - 1]
    const newEvents = [...state.events, event]
    
    state.redoStack = state.redoStack.slice(0, -1)
    state.events = newEvents
    state.scene = rebuildScene(newEvents)
    
    return true
  },

  clear(): void {
    state.scene = state.baseScene
    state.events = []
    state.redoStack = []
    state.lastApplyMs = 0
  },

  reset(): void {
    state.baseScene = createEmptyScene()
    state.scene = createEmptyScene()
    state.events = []
    state.redoStack = []
    state.lastApplyMs = 0
  }
})

export type HistoryStore = typeof historyStore

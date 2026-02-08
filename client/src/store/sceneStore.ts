import { reactive } from 'vue'
import type { SceneGraph, CommandEnvelope } from '@shared/index'
import { CommandEnvelopeSchema } from '@shared/index'
import { applyCommands } from '../engine/applyCommands'

interface SceneStore {
  scene: SceneGraph
  lastEnvelope: CommandEnvelope | null
  lastApplyMs: number
  lastError: string | null
}

function createEmptyScene(): SceneGraph {
  return {
    intent: null,
    objects: {},
    order: []
  }
}

export const sceneStore = reactive<SceneStore>({
  scene: createEmptyScene(),
  lastEnvelope: null,
  lastApplyMs: 0,
  lastError: null
})

export function validateEnvelope(rawText: string): { ok: boolean; error?: string; envelope?: CommandEnvelope } {
  try {
    const parsed = JSON.parse(rawText)
    const result = CommandEnvelopeSchema.safeParse(parsed)
    if (!result.success) {
      const firstError = result.error.errors[0]
      return { ok: false, error: `${firstError.path.join('.')}: ${firstError.message}` }
    }
    return { ok: true, envelope: result.data }
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as Error).message}` }
  }
}

export function applyEnvelope(rawText: string): { ok: boolean; error?: string } {
  sceneStore.lastError = null
  
  const validation = validateEnvelope(rawText)
  if (!validation.ok || !validation.envelope) {
    sceneStore.lastError = validation.error || 'Unknown error'
    return { ok: false, error: validation.error }
  }
  
  const envelope = validation.envelope
  
  if (envelope.refused) {
    const reason = envelope.refusalReason || 'Request refused by AI'
    sceneStore.lastError = reason
    return { ok: false, error: reason }
  }
  
  const start = performance.now()
  sceneStore.scene = applyCommands(sceneStore.scene, envelope.commands)
  sceneStore.lastApplyMs = Math.round((performance.now() - start) * 100) / 100
  sceneStore.lastEnvelope = envelope
  
  return { ok: true }
}

export function resetScene(): void {
  sceneStore.scene = createEmptyScene()
  sceneStore.lastEnvelope = null
  sceneStore.lastApplyMs = 0
  sceneStore.lastError = null
}

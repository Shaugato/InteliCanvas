import type { DrawingCommand } from '@shared/commands'

export type EventStatus = 'applied' | 'rejected' | 'refused' | 'error'

export interface SessionEvent {
  id: string
  timestamp: number
  utterance: string
  commands: DrawingCommand[]
  status: EventStatus
  notes?: string
  latencyMs?: number
  diffSummary?: string
}

export function createEvent(
  utterance: string,
  commands: DrawingCommand[],
  status: EventStatus = 'applied',
  options?: {
    notes?: string
    latencyMs?: number
    diffSummary?: string
  }
): SessionEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    utterance,
    commands,
    status,
    notes: options?.notes,
    latencyMs: options?.latencyMs,
    diffSummary: options?.diffSummary
  }
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

import type { SceneGraph } from '@shared/scene'
import type { DrawingCommand } from '@shared/commands'

export function summarizeDiff(
  prevScene: SceneGraph,
  nextScene: SceneGraph,
  commands: DrawingCommand[]
): string {
  const summaries: string[] = []

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'set_scene_intent':
        if (cmd.intent) {
          summaries.push(`Set intent: "${cmd.intent.description}"`)
        } else {
          summaries.push('Cleared scene intent')
        }
        break

      case 'add_preview_object': {
        const shapeCount = cmd.object.shapes.length
        summaries.push(`Added preview ${cmd.object.id} (${shapeCount} shapes)`)
        break
      }

      case 'add_object': {
        const shapeCount = cmd.object.shapes.length
        summaries.push(`Added object ${cmd.object.id} (${shapeCount} shapes)`)
        break
      }

      case 'update_preview_object':
      case 'update_object': {
        const patch = cmd.patch as Record<string, unknown>
        const keys = Object.keys(patch).filter(k => patch[k] !== undefined)
        if (keys.length > 0) {
          summaries.push(`Updated ${cmd.id}: ${keys.join(', ')}`)
        } else {
          summaries.push(`Updated ${cmd.id}`)
        }
        break
      }

      case 'commit_preview_object':
        summaries.push(`Committed preview ${cmd.id}`)
        break

      case 'cancel_preview_object':
        summaries.push(`Canceled preview ${cmd.id}`)
        break

      case 'delete_object':
        summaries.push(`Deleted object ${cmd.id}`)
        break

      case 'set_background_gradient':
        summaries.push('Set background gradient')
        break

      case 'set_ground_fill':
        summaries.push(`Set ground fill: ${cmd.fill}`)
        break

      case 'set_path':
        summaries.push(`Set path ${cmd.id}`)
        break

      case 'batch': {
        const batchSummary = summarizeDiff(prevScene, nextScene, cmd.commands)
        if (batchSummary) {
          summaries.push(`Batch: ${batchSummary}`)
        }
        break
      }
    }
  }

  if (summaries.length === 0) {
    const prevCount = Object.keys(prevScene.objects).length
    const nextCount = Object.keys(nextScene.objects).length
    if (nextCount > prevCount) {
      summaries.push(`Added ${nextCount - prevCount} object(s)`)
    } else if (nextCount < prevCount) {
      summaries.push(`Removed ${prevCount - nextCount} object(s)`)
    }
  }

  return summaries.join('; ')
}

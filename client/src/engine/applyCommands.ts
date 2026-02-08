import type { SceneGraph, SceneObject, DrawingCommand } from '@shared/index'

export function applyCommands(scene: SceneGraph, commands: DrawingCommand[]): SceneGraph {
  let newScene = { ...scene, objects: { ...scene.objects }, order: [...scene.order] }
  
  for (const cmd of commands) {
    newScene = applyCommand(newScene, cmd)
  }
  
  return newScene
}

function applyCommand(scene: SceneGraph, cmd: DrawingCommand): SceneGraph {
  switch (cmd.type) {
    case 'add_object':
    case 'add_preview_object': {
      const obj = cmd.object
      return {
        ...scene,
        objects: { ...scene.objects, [obj.id]: obj },
        order: scene.order.includes(obj.id) ? scene.order : [...scene.order, obj.id]
      }
    }
    
    case 'update_object':
    case 'update_preview_object': {
      const existing = scene.objects[cmd.id]
      if (!existing) return scene
      
      const patch = cmd.patch as Partial<SceneObject>
      if ('id' in patch || 'type' in patch) {
        console.warn('Attempted to mutate id or type in update - ignored')
        return scene
      }
      
      const updated: SceneObject = {
        ...existing,
        ...patch,
        id: existing.id
      }
      
      return {
        ...scene,
        objects: { ...scene.objects, [cmd.id]: updated }
      }
    }
    
    case 'delete_object': {
      const { [cmd.id]: _, ...remaining } = scene.objects
      return {
        ...scene,
        objects: remaining,
        order: scene.order.filter(id => id !== cmd.id)
      }
    }
    
    case 'commit_preview_object': {
      const existing = scene.objects[cmd.id]
      if (!existing || existing.status !== 'preview') return scene
      
      const committed: SceneObject = { ...existing, status: 'committed' }
      return {
        ...scene,
        objects: { ...scene.objects, [cmd.id]: committed }
      }
    }
    
    case 'cancel_preview_object': {
      const existing = scene.objects[cmd.id]
      if (!existing || existing.status !== 'preview') return scene
      
      const { [cmd.id]: _, ...remaining } = scene.objects
      return {
        ...scene,
        objects: remaining,
        order: scene.order.filter(id => id !== cmd.id)
      }
    }
    
    case 'set_scene_intent': {
      return { ...scene, intent: cmd.intent }
    }
    
    case 'batch': {
      return applyCommands(scene, cmd.commands as DrawingCommand[])
    }
    
    default:
      return scene
  }
}

import type { VectorShape } from '@shared/vectorShapes'

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function computeBBox(shapes: VectorShape[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  
  for (const shape of shapes) {
    const bounds = getShapeBounds(shape)
    minX = Math.min(minX, bounds.minX)
    minY = Math.min(minY, bounds.minY)
    maxX = Math.max(maxX, bounds.maxX)
    maxY = Math.max(maxY, bounds.maxY)
  }
  
  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 10, maxY: 10 }
  }
  
  return { minX, minY, maxX, maxY }
}

function getShapeBounds(shape: VectorShape): BBox {
  switch (shape.type) {
    case 'rect':
      return {
        minX: shape.x,
        minY: shape.y,
        maxX: shape.x + shape.width,
        maxY: shape.y + shape.height
      }
    
    case 'circle':
      return {
        minX: shape.x - shape.radius,
        minY: shape.y - shape.radius,
        maxX: shape.x + shape.radius,
        maxY: shape.y + shape.radius
      }
    
    case 'ellipse':
      return {
        minX: shape.x - shape.radiusX,
        minY: shape.y - shape.radiusY,
        maxX: shape.x + shape.radiusX,
        maxY: shape.y + shape.radiusY
      }
    
    case 'line':
    case 'polyline':
    case 'polygon': {
      const pts = shape.points
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i])
        maxX = Math.max(maxX, pts[i])
        minY = Math.min(minY, pts[i + 1])
        maxY = Math.max(maxY, pts[i + 1])
      }
      return { minX, minY, maxX, maxY }
    }
    
    case 'path':
      return { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    
    case 'text':
      return {
        minX: shape.x,
        minY: shape.y,
        maxX: shape.x + 50,
        maxY: shape.y + (shape.fontSize || 14)
      }
    
    default:
      return { minX: 0, minY: 0, maxX: 10, maxY: 10 }
  }
}

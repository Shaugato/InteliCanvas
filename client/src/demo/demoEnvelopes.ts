import type { CommandEnvelope } from '@shared/index'

export const demoSteps: { name: string; envelope: CommandEnvelope }[] = [
  {
    name: 'Step 1: Sky',
    envelope: {
      commands: [{
        type: 'add_object',
        object: {
          id: 'sky-1',
          layer: 'sky',
          status: 'committed',
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          semanticTag: 'sky',
          shapes: [{
            id: 'sky-rect',
            type: 'rect',
            x: 0, y: 0,
            width: 100, height: 45,
            fill: '#7ec8ff'
          }]
        }
      }]
    }
  },
  {
    name: 'Step 2: Sun',
    envelope: {
      commands: [{
        type: 'add_object',
        object: {
          id: 'sun-1',
          layer: 'background',
          status: 'committed',
          transform: { x: 78, y: 20, scale: 1, rotation: 0 },
          semanticTag: 'sun',
          shapes: [
            { id: 'sun-halo', type: 'circle', x: 0, y: 0, radius: 18, fill: 'rgba(255,200,100,0.2)' },
            { id: 'sun-glow', type: 'circle', x: 0, y: 0, radius: 14, fill: 'rgba(255,160,80,0.35)' },
            { id: 'sun-core', type: 'circle', x: 0, y: 0, radius: 10, fill: '#ffcc33', stroke: '#ff8800', strokeWidth: 0.8 }
          ]
        }
      }]
    }
  },
  {
    name: 'Step 3: Mountains',
    envelope: {
      commands: [
        {
          type: 'add_object',
          object: {
            id: 'mountain-1',
            layer: 'background',
            status: 'committed',
            transform: { x: 0, y: 20, scale: 1, rotation: 0 },
            semanticTag: 'mountain',
            shapes: [
              { id: 'mtn1-base', type: 'polygon', points: [-15, 50, 30, -5, 75, 50], fill: '#4a7fb5', stroke: '#2a4f75', strokeWidth: 0.8, opacity: 0.85 },
              { id: 'mtn1-highlight', type: 'polygon', points: [10, 25, 30, -5, 50, 25], fill: 'rgba(255,255,255,0.08)' },
              { id: 'mtn1-snow', type: 'polygon', points: [22, 5, 30, -5, 38, 5, 34, 8, 26, 8], fill: '#e8f4ff', stroke: '#b8d4ef', strokeWidth: 0.3 }
            ]
          }
        },
        {
          type: 'add_object',
          object: {
            id: 'mountain-2',
            layer: 'background',
            status: 'committed',
            transform: { x: 45, y: 22, scale: 1, rotation: 0 },
            semanticTag: 'mountain',
            shapes: [
              { id: 'mtn2-base', type: 'polygon', points: [-20, 48, 35, -8, 90, 48], fill: '#3a6f9f', stroke: '#1a3f5f', strokeWidth: 0.8, opacity: 0.9 },
              { id: 'mtn2-highlight', type: 'polygon', points: [15, 20, 35, -8, 55, 20], fill: 'rgba(255,255,255,0.06)' },
              { id: 'mtn2-snow', type: 'polygon', points: [27, 2, 35, -8, 43, 2, 39, 6, 31, 6], fill: '#e8f4ff', stroke: '#b8d4ef', strokeWidth: 0.3 }
            ]
          }
        }
      ]
    }
  },
  {
    name: 'Step 4: Field',
    envelope: {
      commands: [{
        type: 'add_object',
        object: {
          id: 'field-1',
          layer: 'ground',
          status: 'committed',
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          semanticTag: 'field',
          shapes: [
            { id: 'field-base', type: 'rect', x: 0, y: 0, width: 100, height: 55, fill: '#3db85a' },
            { id: 'field-horizon-shade', type: 'rect', x: 0, y: 0, width: 100, height: 12, fill: 'rgba(0,0,0,0.08)' },
            { id: 'field-mid-shade', type: 'rect', x: 0, y: 20, width: 100, height: 15, fill: 'rgba(0,0,0,0.03)' },
            { id: 'field-fore-shade', type: 'rect', x: 0, y: 42, width: 100, height: 13, fill: 'rgba(0,0,0,0.05)' },
            { id: 'horizon-line', type: 'line', points: [0, 0, 100, 0], stroke: 'rgba(0,0,0,0.12)', strokeWidth: 1.5 }
          ]
        }
      }]
    }
  },
  {
    name: 'Step 5: Path',
    envelope: {
      commands: [{
        type: 'add_object',
        object: {
          id: 'path-1',
          layer: 'ground',
          status: 'committed',
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          semanticTag: 'path',
          shapes: [
            { id: 'path-shadow', type: 'path', d: 'M 52 0 Q 54 12, 56 25 Q 62 40, 75 55', stroke: 'rgba(0,0,0,0.25)', strokeWidth: 18 },
            { id: 'path-edge', type: 'path', d: 'M 52 0 Q 54 12, 56 25 Q 62 40, 75 55', stroke: '#5a3a10', strokeWidth: 14 },
            { id: 'path-main', type: 'path', d: 'M 52 0 Q 54 12, 56 25 Q 62 40, 75 55', stroke: '#c9925a', strokeWidth: 10 },
            { id: 'path-highlight', type: 'path', d: 'M 51 0 Q 53 12, 55 25 Q 61 40, 74 55', stroke: 'rgba(255,255,255,0.15)', strokeWidth: 3 }
          ]
        }
      }]
    }
  },
  {
    name: 'Step 6: Tree (Preview)',
    envelope: {
      commands: [{
        type: 'add_preview_object',
        object: {
          id: 'tree-1',
          layer: 'foreground',
          status: 'preview',
          transform: { x: 18, y: 8, scale: 1, rotation: 0 },
          semanticTag: 'tree',
          shapes: [
            { id: 'tree-shadow', type: 'ellipse', x: 2, y: 20, radiusX: 12, radiusY: 4, fill: 'rgba(0,0,0,0.18)' },
            { id: 'trunk', type: 'rect', x: -2, y: 2, width: 4, height: 18, fill: '#5a2d0c', stroke: '#3b1b05', strokeWidth: 0.5 },
            { id: 'trunk-shade', type: 'rect', x: -2, y: 2, width: 1.5, height: 18, fill: 'rgba(0,0,0,0.15)' },
            { id: 'canopy-back', type: 'circle', x: 0, y: -6, radius: 12, fill: '#1a7a1a', stroke: '#0a4a0a', strokeWidth: 0.6 },
            { id: 'canopy-left', type: 'circle', x: -7, y: 0, radius: 8, fill: '#228b22', stroke: '#0a4a0a', strokeWidth: 0.5 },
            { id: 'canopy-right', type: 'circle', x: 7, y: 0, radius: 8, fill: '#228b22', stroke: '#0a4a0a', strokeWidth: 0.5 },
            { id: 'canopy-top', type: 'circle', x: 0, y: -10, radius: 7, fill: '#2e9b2e', stroke: '#0a4a0a', strokeWidth: 0.4 },
            { id: 'canopy-highlight', type: 'circle', x: 3, y: -8, radius: 4, fill: 'rgba(255,255,255,0.1)' }
          ]
        }
      }]
    }
  },
  {
    name: 'Step 7: Commit Tree',
    envelope: {
      commands: [{
        type: 'commit_preview_object',
        id: 'tree-1'
      }]
    }
  },
  {
    name: 'Step 8: House',
    envelope: {
      commands: [{
        type: 'add_object',
        object: {
          id: 'house-1',
          layer: 'foreground',
          status: 'committed',
          transform: { x: 68, y: 12, scale: 1, rotation: 0 },
          semanticTag: 'house',
          shapes: [
            { id: 'house-shadow', type: 'ellipse', x: 8, y: 20, radiusX: 12, radiusY: 4, fill: 'rgba(0,0,0,0.18)' },
            { id: 'walls', type: 'rect', x: 0, y: 6, width: 16, height: 12, fill: '#f0dcc0', stroke: '#8b7355', strokeWidth: 0.6 },
            { id: 'walls-shade', type: 'rect', x: 0, y: 6, width: 5, height: 12, fill: 'rgba(0,0,0,0.08)' },
            { id: 'roof', type: 'polygon', points: [-2, 6, 8, -4, 18, 6], fill: '#a0522d', stroke: '#5a2d10', strokeWidth: 0.6 },
            { id: 'roof-highlight', type: 'polygon', points: [2, 4, 8, -2, 14, 4], fill: 'rgba(255,255,255,0.1)' },
            { id: 'door', type: 'rect', x: 6, y: 11, width: 4, height: 7, fill: '#5a3a18', stroke: '#3b2510', strokeWidth: 0.4 },
            { id: 'door-knob', type: 'circle', x: 9, y: 14.5, radius: 0.5, fill: '#c0a080' },
            { id: 'window-left', type: 'rect', x: 2, y: 8, width: 3, height: 3, fill: '#a8d8f0', stroke: '#4a4a4a', strokeWidth: 0.5 },
            { id: 'window-right', type: 'rect', x: 11, y: 8, width: 3, height: 3, fill: '#a8d8f0', stroke: '#4a4a4a', strokeWidth: 0.5 },
            { id: 'chimney', type: 'rect', x: 12, y: -2, width: 3, height: 6, fill: '#8b5a2b', stroke: '#5a3a15', strokeWidth: 0.4 }
          ]
        }
      }]
    }
  },
  {
    name: 'Step 9: Birds',
    envelope: {
      commands: [{
        type: 'add_object',
        object: {
          id: 'birds-1',
          layer: 'background',
          status: 'committed',
          transform: { x: 55, y: 12, scale: 1, rotation: 0 },
          semanticTag: 'birds',
          shapes: [
            { id: 'bird1', type: 'polyline', points: [-4, 0, 0, -2.5, 4, 0], stroke: '#1a1a1a', strokeWidth: 1.4 },
            { id: 'bird2', type: 'polyline', points: [8, 4, 12, 1.5, 16, 4], stroke: '#1a1a1a', strokeWidth: 1.4 },
            { id: 'bird3', type: 'polyline', points: [18, -2, 22, -4.5, 26, -2], stroke: '#1a1a1a', strokeWidth: 1.4 },
            { id: 'bird4', type: 'polyline', points: [2, 6, 5, 4, 8, 6], stroke: '#2a2a2a', strokeWidth: 1.2 }
          ]
        }
      }]
    }
  },
  {
    name: 'Step 10: Flowers',
    envelope: {
      commands: [{
        type: 'add_object',
        object: {
          id: 'flowers-1',
          layer: 'foreground',
          status: 'committed',
          transform: { x: 6, y: 38, scale: 1, rotation: 0 },
          semanticTag: 'flowers',
          shapes: [
            { id: 'bush1', type: 'circle', x: 4, y: 8, radius: 5, fill: '#1a5a1a', opacity: 0.5 },
            { id: 'bush2', type: 'circle', x: 10, y: 7, radius: 4, fill: '#1a5a1a', opacity: 0.5 },
            { id: 'bush3', type: 'circle', x: 16, y: 8, radius: 5, fill: '#1a5a1a', opacity: 0.5 },
            { id: 'stem1', type: 'line', points: [0, 3, 0, 10], stroke: '#2a8a2a', strokeWidth: 1.5 },
            { id: 'stem2', type: 'line', points: [6, 5, 6, 12], stroke: '#2a8a2a', strokeWidth: 1.5 },
            { id: 'stem3', type: 'line', points: [12, 4, 12, 11], stroke: '#2a8a2a', strokeWidth: 1.5 },
            { id: 'stem4', type: 'line', points: [18, 3, 18, 10], stroke: '#2a8a2a', strokeWidth: 1.5 },
            { id: 'flower1', type: 'circle', x: 0, y: 1, radius: 3, fill: '#ff6090', stroke: '#a03060', strokeWidth: 0.4 },
            { id: 'flower1-center', type: 'circle', x: 0, y: 1, radius: 1, fill: '#ffdd44' },
            { id: 'flower2', type: 'circle', x: 6, y: 3, radius: 3.5, fill: '#ff3080', stroke: '#a01050', strokeWidth: 0.4 },
            { id: 'flower2-center', type: 'circle', x: 6, y: 3, radius: 1.2, fill: '#ffdd44' },
            { id: 'flower3', type: 'circle', x: 12, y: 2, radius: 3, fill: '#ff6090', stroke: '#a03060', strokeWidth: 0.4 },
            { id: 'flower3-center', type: 'circle', x: 12, y: 2, radius: 1, fill: '#ffdd44' },
            { id: 'flower4', type: 'circle', x: 18, y: 1, radius: 2.5, fill: '#ff3080', stroke: '#a01050', strokeWidth: 0.4 },
            { id: 'flower4-center', type: 'circle', x: 18, y: 1, radius: 0.8, fill: '#ffdd44' }
          ]
        }
      }]
    }
  }
]

import type { CommandEnvelope } from "../shared/schema";
import type { DrawingCommand } from "../shared/commands";

export const stubEnvelopes: Record<string, CommandEnvelope> = {
  sky: {
    commands: [
      {
        type: "add_object",
        object: {
          id: `sky-${Date.now()}`,
          layer: "sky",
          status: "committed",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          semanticTag: "sky",
          shapes: [
            {
              id: "sky-rect",
              type: "rect",
              x: 0,
              y: 0,
              width: 100,
              height: 45,
              fill: "#7ec8ff",
            },
          ],
        },
      },
    ],
  },
  sun: {
    commands: [
      {
        type: "add_object",
        object: {
          id: `sun-${Date.now()}`,
          layer: "background",
          status: "committed",
          transform: { x: 78, y: 20, scale: 1, rotation: 0 },
          semanticTag: "sun",
          shapes: [
            {
              id: "sun-halo",
              type: "circle",
              x: 0,
              y: 0,
              radius: 18,
              fill: "rgba(255,200,100,0.2)",
            },
            {
              id: "sun-glow",
              type: "circle",
              x: 0,
              y: 0,
              radius: 14,
              fill: "rgba(255,160,80,0.35)",
            },
            {
              id: "sun-core",
              type: "circle",
              x: 0,
              y: 0,
              radius: 10,
              fill: "#ffcc33",
              stroke: "#ff8800",
              strokeWidth: 0.8,
            },
          ],
        },
      },
    ],
  },
  birds: {
    commands: [
      {
        type: "add_object",
        object: {
          id: `birds-${Date.now()}`,
          layer: "sky",
          status: "committed",
          // place in upper sky band
          transform: {
            x: 60 + Math.random() * 30,
            y: 10 + Math.random() * 12,
            scale: 1,
            rotation: 0,
          },
          semanticTag: "birds",
          shapes: [
            // Bird 1 (two lines = V)
            {
              id: "b1-left",
              type: "line",
              points: [-3, 0, 0, -2],
              stroke: "#0b1220",
              strokeWidth: 0.8,
            },
            {
              id: "b1-right",
              type: "line",
              points: [0, -2, 3, 0],
              stroke: "#0b1220",
              strokeWidth: 0.8,
            },

            // Bird 2
            {
              id: "b2-left",
              type: "line",
              points: [5, 1, 8, -1],
              stroke: "#0b1220",
              strokeWidth: 0.8,
            },
            {
              id: "b2-right",
              type: "line",
              points: [8, -1, 11, 1],
              stroke: "#0b1220",
              strokeWidth: 0.8,
            },

            // Bird 3
            {
              id: "b3-left",
              type: "line",
              points: [14, 0, 17, -2],
              stroke: "#0b1220",
              strokeWidth: 0.8,
            },
            {
              id: "b3-right",
              type: "line",
              points: [17, -2, 20, 0],
              stroke: "#0b1220",
              strokeWidth: 0.8,
            },
          ],
        },
      },
    ],
  },
  tree: {
    commands: [
      {
        type: "add_object",
        object: {
          id: `tree-${Date.now()}`,
          layer: "foreground",
          status: "committed",
          transform: {
            x: 18 + Math.random() * 20,
            y: 8,
            scale: 1,
            rotation: 0,
          },
          semanticTag: "tree",
          shapes: [
            {
              id: "tree-shadow",
              type: "ellipse",
              x: 2,
              y: 20,
              radiusX: 12,
              radiusY: 4,
              fill: "rgba(0,0,0,0.18)",
            },
            {
              id: "trunk",
              type: "rect",
              x: -2,
              y: 2,
              width: 4,
              height: 18,
              fill: "#5a2d0c",
              stroke: "#3b1b05",
              strokeWidth: 0.5,
            },
            {
              id: "canopy-back",
              type: "circle",
              x: 0,
              y: -6,
              radius: 12,
              fill: "#1a7a1a",
              stroke: "#0a4a0a",
              strokeWidth: 0.6,
            },
            {
              id: "canopy-left",
              type: "circle",
              x: -7,
              y: 0,
              radius: 8,
              fill: "#228b22",
            },
            {
              id: "canopy-right",
              type: "circle",
              x: 7,
              y: 0,
              radius: 8,
              fill: "#228b22",
            },
            {
              id: "canopy-top",
              type: "circle",
              x: 0,
              y: -10,
              radius: 7,
              fill: "#2e9b2e",
            },
          ],
        },
      },
    ],
  },
  house: {
    commands: [
      {
        type: "add_object",
        object: {
          id: `house-${Date.now()}`,
          layer: "foreground",
          status: "committed",
          transform: { x: 68, y: 12, scale: 1, rotation: 0 },
          semanticTag: "house",
          shapes: [
            {
              id: "house-shadow",
              type: "ellipse",
              x: 8,
              y: 20,
              radiusX: 12,
              radiusY: 4,
              fill: "rgba(0,0,0,0.18)",
            },
            {
              id: "walls",
              type: "rect",
              x: 0,
              y: 6,
              width: 16,
              height: 12,
              fill: "#f0dcc0",
              stroke: "#8b7355",
              strokeWidth: 0.6,
            },
            {
              id: "roof",
              type: "polygon",
              points: [-2, 6, 8, -4, 18, 6],
              fill: "#a0522d",
              stroke: "#5a2d10",
              strokeWidth: 0.6,
            },
            {
              id: "door",
              type: "rect",
              x: 6,
              y: 11,
              width: 4,
              height: 7,
              fill: "#5a3a18",
            },
            {
              id: "window-left",
              type: "rect",
              x: 2,
              y: 8,
              width: 3,
              height: 3,
              fill: "#a8d8f0",
            },
            {
              id: "window-right",
              type: "rect",
              x: 11,
              y: 8,
              width: 3,
              height: 3,
              fill: "#a8d8f0",
            },
          ],
        },
      },
    ],
  },
  mountain: {
    commands: [
      {
        type: "add_object",
        object: {
          id: `mountain-${Date.now()}`,
          layer: "background",
          status: "committed",
          transform: {
            x: 10 + Math.random() * 40,
            y: 20,
            scale: 1,
            rotation: 0,
          },
          semanticTag: "mountain",
          shapes: [
            {
              id: "mtn-base",
              type: "polygon",
              points: [-15, 50, 30, -5, 75, 50],
              fill: "#4a7fb5",
              stroke: "#2a4f75",
              strokeWidth: 0.8,
            },
            {
              id: "mtn-snow",
              type: "polygon",
              points: [22, 5, 30, -5, 38, 5, 34, 8, 26, 8],
              fill: "#e8f4ff",
            },
          ],
        },
      },
    ],
  },
  field: {
    commands: [
      {
        type: "add_object",
        object: {
          id: `field-${Date.now()}`,
          layer: "ground",
          status: "committed",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          semanticTag: "field",
          shapes: [
            {
              id: "field-base",
              type: "rect",
              x: 0,
              y: 0,
              width: 100,
              height: 55,
              fill: "#3db85a",
            },
            {
              id: "field-shade",
              type: "rect",
              x: 0,
              y: 0,
              width: 100,
              height: 12,
              fill: "rgba(0,0,0,0.08)",
            },
          ],
        },
      },
    ],
  },
  flower: {
    commands: [
      {
        type: "add_object",
        object: {
          id: `flower-${Date.now()}`,
          layer: "foreground",
          status: "committed",
          transform: {
            x: 10 + Math.random() * 30,
            y: 35 + Math.random() * 10,
            scale: 1,
            rotation: 0,
          },
          semanticTag: "flowers",
          shapes: [
            {
              id: "stem",
              type: "line",
              points: [0, 3, 0, 10],
              stroke: "#2a8a2a",
              strokeWidth: 1.5,
            },
            {
              id: "flower",
              type: "circle",
              x: 0,
              y: 1,
              radius: 3,
              fill: "#ff6090",
            },
            {
              id: "center",
              type: "circle",
              x: 0,
              y: 1,
              radius: 1,
              fill: "#ffdd44",
            },
          ],
        },
      },
    ],
  },
};

export function findStubEnvelope(utterance: string): CommandEnvelope | null {
  const lower = utterance.toLowerCase();

  const keywords: [string[], string][] = [
    [["sky", "blue sky"], "sky"],
    [["sun", "sunshine"], "sun"],
    [["bird", "birds", "flock"], "birds"],
    [["tree", "oak", "pine"], "tree"],
    [["house", "home", "cottage", "cabin"], "house"],
    [["mountain", "mountains", "peak"], "mountain"],
    [["field", "grass", "ground", "meadow"], "field"],
    [["flower", "flowers", "rose"], "flower"],
  ];

  for (const [words, key] of keywords) {
    for (const word of words) {
      if (lower.includes(word)) {
        const template = stubEnvelopes[key];
        const now = Date.now();
        const newCommands = template.commands.map((cmd: DrawingCommand) => {
          if (cmd.type === "add_object" || cmd.type === "add_preview_object") {
            return {
              ...cmd,
              object: {
                ...cmd.object,
                id: `${cmd.object.semanticTag || key}-${now}`,
              },
            };
          }
          return cmd;
        });
        return { commands: newCommands };
      }
    }
  }

  return null;
}

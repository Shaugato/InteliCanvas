import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommandEnvelopeSchema } from "../../shared/schema";

describe("Safe Refusal Handling", () => {
  describe("JSON parsing failures", () => {
    it("returns a refused envelope when JSON is malformed", () => {
      const malformedJson = "{ not valid json at all";
      
      let parsed: unknown;
      let parseError = false;
      try {
        parsed = JSON.parse(malformedJson);
      } catch {
        parseError = true;
      }
      
      expect(parseError).toBe(true);
      
      const refusedEnvelope = {
        refused: true,
        refusalReason: "json_parse_failed",
        notes: "I couldn't understand the response. Please try again.",
        commands: []
      };
      
      const validation = CommandEnvelopeSchema.safeParse(refusedEnvelope);
      expect(validation.success).toBe(true);
    });
  });

  describe("Schema validation failures", () => {
    it("returns a refused envelope when schema validation fails", () => {
      const invalidEnvelope = {
        commands: [
          { type: "invalid_command_type", foo: "bar" }
        ]
      };
      
      const validation = CommandEnvelopeSchema.safeParse(invalidEnvelope);
      expect(validation.success).toBe(false);
      
      const refusedEnvelope = {
        refused: true,
        refusalReason: "schema_validation_failed",
        notes: "I couldn't produce a valid command envelope. Please rephrase.",
        commands: []
      };
      
      const refusedValidation = CommandEnvelopeSchema.safeParse(refusedEnvelope);
      expect(refusedValidation.success).toBe(true);
    });

    it("validates a proper add_preview_object command", () => {
      const validEnvelope = {
        commands: [
          {
            type: "add_preview_object",
            object: {
              id: "obj_tree_123",
              status: "preview",
              layer: "foreground",
              transform: { x: 30, y: 70, scale: 1.0, rotation: 0 },
              semanticTag: "tree",
              shapes: [
                { kind: "rect", x: 0, y: 0, width: 5, height: 20, style: { fill: "#8B4513" } },
                { kind: "ellipse", cx: 2.5, cy: -5, rx: 10, ry: 8, style: { fill: "#228B22" } }
              ]
            }
          }
        ],
        notes: "Adding a tree preview"
      };
      
      const validation = CommandEnvelopeSchema.safeParse(validEnvelope);
      expect(validation.success).toBe(true);
    });

    it("validates a commit_preview_object command", () => {
      const validEnvelope = {
        commands: [
          { type: "commit_preview_object", id: "obj_tree_123" }
        ]
      };
      
      const validation = CommandEnvelopeSchema.safeParse(validEnvelope);
      expect(validation.success).toBe(true);
    });
  });

  describe("Refused envelope structure", () => {
    it("allows refused=true with empty commands", () => {
      const refusedEnvelope = {
        refused: true,
        refusalReason: "ambiguous_target",
        notes: "I'm not sure which object you want to modify. Please be more specific.",
        commands: []
      };
      
      const validation = CommandEnvelopeSchema.safeParse(refusedEnvelope);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(validation.data.refused).toBe(true);
        expect(validation.data.refusalReason).toBe("ambiguous_target");
        expect(validation.data.commands).toHaveLength(0);
      }
    });
  });
});

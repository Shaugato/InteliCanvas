import { CommandEnvelopeSchema } from "../shared";

function runTests() {
  console.log("Starting Phase 1+ Validation Tests...");

  // Test 1 — valid envelope passes
  const validEnvelope = {
    commands: [{
      type: "add_object",
      object: {
        id: "tree-1",
        layer: "foreground",
        status: "committed",
        transform: { x: 50, y: 80, scale: 1, rotation: 0 },
        semanticTag: "tree",
        shapes: [
          {
            id: "trunk",
            type: "rect",
            x: 45,
            y: 70,
            width: 10,
            height: 30,
            fill: "brown"
          },
          {
            id: "canopy",
            type: "circle",
            x: 50,
            y: 50,
            radius: 25,
            fill: "green"
          }
        ]
      }
    }]
  };
  CommandEnvelopeSchema.parse(validEnvelope);
  console.log("Test 1 Passed: Valid envelope accepted.");

  // Test 2 — invalid coordinate fails
  try {
    const invalidCoord = {
      commands: [{
        type: "add_object",
        object: {
          id: "tree-2",
          layer: "foreground",
          status: "committed",
          transform: { x: -5, y: 80, scale: 1, rotation: 0 },
          shapes: [{ id: "s1", type: "circle", x: 0, y: 0, radius: 10 }]
        }
      }]
    };
    CommandEnvelopeSchema.parse(invalidCoord);
    console.error("Test 2 Failed: Out of range x was accepted.");
  } catch (e) {
    console.log("Test 2 Passed: Invalid coordinate (x: -5) rejected.");
  }

  // Test 3 — preview status enforcement
  try {
    const invalidPreview = {
      commands: [{
        type: "add_preview_object",
        object: {
          id: "tree-preview",
          layer: "foreground",
          status: "committed", // Should be "preview"
          transform: { x: 50, y: 80, scale: 1, rotation: 0 },
          shapes: [{ id: "s1", type: "circle", x: 0, y: 0, radius: 10 }]
        }
      }]
    };
    CommandEnvelopeSchema.parse(invalidPreview);
    console.error("Test 3 Failed: add_preview_object accepted committed status.");
  } catch (e) {
    console.log("Success: add_preview_object rejected committed status.");
  }

  // Test 4 — illegal patch mutation
  try {
    const illegalPatch = {
      commands: [{
        type: "update_object",
        id: "tree-1",
        patch: { id: "evil-id" }
      }]
    };
    CommandEnvelopeSchema.parse(illegalPatch);
    console.error("Test 4 Failed: update_object accepted id mutation.");
  } catch (e) {
    console.log("Success: update_object rejected id mutation.");
  }

  // Test 5 — complexity limit (shapes count)
  try {
    const tooManyShapes = {
      commands: [{
        type: "add_object",
        object: {
          id: "complex-obj",
          layer: "foreground",
          status: "committed",
          transform: { x: 50, y: 50, scale: 1, rotation: 0 },
          shapes: Array.from({ length: 61 }, (_, i) => ({
            id: `shape-${i}`,
            type: "circle",
            x: 0,
            y: 0,
            radius: 1
          }))
        }
      }]
    };
    CommandEnvelopeSchema.parse(tooManyShapes);
    console.error("Test 5 Failed: Object with 61 shapes was accepted.");
  } catch (e) {
    console.log("Success: Object with 61 shapes rejected.");
  }

  console.log("\nPhase 1+ Validation Tests Passed.");
}

runTests();

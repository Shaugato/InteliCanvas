import { describe, expect, it } from "vitest";
import { createEmptyScene } from "../reducer";
import {
  canonicalizeVoiceTranscript,
  DEMO_COMMAND_LIBRARY,
} from "./canonicalizer";

describe("voice canonicalizer", () => {
  const emptyScene = createEmptyScene();

  it.each([
    ["can you plese drow hous", "draw house"],
    ["add your leash sky", "change sky color bluish"],
    ["put two ppl wokin on rode", "add two people walking on road"],
    ["move the son lift", "move sun left"],
    ["tree on the rite of the howse", "draw tree right of house"],
  ])('maps "%s" to "%s"', (input, expected) => {
    const result = canonicalizeVoiceTranscript(input, emptyScene);
    expect(result.decision).toBe("accept");
    expect(result.canonicalUtterance).toBe(expected);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("returns repeat for unrelated text", () => {
    const result = canonicalizeVoiceTranscript(
      "what time is it in new york",
      emptyScene,
    );

    expect(result.decision).toBe("repeat");
    expect(result.canonicalUtterance).toBeUndefined();
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("keeps demo command library closed", () => {
    expect(DEMO_COMMAND_LIBRARY).toHaveLength(14);
    expect(DEMO_COMMAND_LIBRARY).toContain("draw house");
    expect(DEMO_COMMAND_LIBRARY).toContain("change sky color bluish");
  });
});

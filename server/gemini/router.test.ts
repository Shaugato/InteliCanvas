import { describe, it, expect } from "vitest";
import { classifyIntent, thinkingFor } from "./router";

describe("classifyIntent", () => {
  it("classifies final render phrases as FINAL_RENDER_PLAN", () => {
    expect(classifyIntent("let's do a final render")).toBe("FINAL_RENDER_PLAN");
    expect(classifyIntent("finalize the scene")).toBe("FINAL_RENDER_PLAN");
    expect(classifyIntent("make it a painting")).toBe("FINAL_RENDER_PLAN");
    expect(classifyIntent("cinematic view")).toBe("FINAL_RENDER_PLAN");
    expect(classifyIntent("export this")).toBe("FINAL_RENDER_PLAN");
  });

  it("classifies composition phrases as COMPOSITION_PASS", () => {
    expect(classifyIntent("improve composition")).toBe("COMPOSITION_PASS");
    expect(classifyIntent("make it look better")).toBe("COMPOSITION_PASS");
    expect(classifyIntent("balance the scene")).toBe("COMPOSITION_PASS");
    expect(classifyIntent("director pass please")).toBe("COMPOSITION_PASS");
    expect(classifyIntent("tweak layout")).toBe("COMPOSITION_PASS");
  });

  it("classifies drawing phrases as LIVE_DRAW", () => {
    expect(classifyIntent("add a tree")).toBe("LIVE_DRAW");
    expect(classifyIntent("put a house on the left")).toBe("LIVE_DRAW");
    expect(classifyIntent("draw the sun")).toBe("LIVE_DRAW");
    expect(classifyIntent("make it bigger")).toBe("LIVE_DRAW");
    expect(classifyIntent("commit it")).toBe("LIVE_DRAW");
  });
});

describe("thinkingFor", () => {
  it("returns high for COMPOSITION_PASS and FINAL_RENDER_PLAN", () => {
    expect(thinkingFor("COMPOSITION_PASS", "anything")).toBe("high");
    expect(thinkingFor("FINAL_RENDER_PLAN", "anything")).toBe("high");
  });

  it("returns low for simple LIVE_DRAW utterances", () => {
    expect(thinkingFor("LIVE_DRAW", "add a tree")).toBe("low");
    expect(thinkingFor("LIVE_DRAW", "make it red")).toBe("low");
  });

  it("returns medium for long utterances", () => {
    const longUtterance = "I want you to add a really beautiful tall oak tree on the left side of the canvas, with lush green leaves and a thick brown trunk that looks realistic";
    expect(thinkingFor("LIVE_DRAW", longUtterance)).toBe("medium");
  });

  it("returns medium for multi-step utterances", () => {
    expect(thinkingFor("LIVE_DRAW", "add a tree and a house")).toBe("medium");
    expect(thinkingFor("LIVE_DRAW", "make it bigger then move it left")).toBe("medium");
    expect(thinkingFor("LIVE_DRAW", "also add some flowers")).toBe("medium");
  });

  it("returns medium for utterances with multiple objects", () => {
    expect(thinkingFor("LIVE_DRAW", "add trees mountains flowers")).toBe("medium");
  });
});

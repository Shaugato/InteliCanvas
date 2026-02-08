import { describe, it, expect } from "vitest";

const FINAL_RENDER_KEYWORDS = [
  "final render", "finalize", "cinematic", "export", 
  "make it a painting", "render plan", "finish"
];

const COMPOSITION_KEYWORDS = [
  "improve composition", "make it look better", "balance", 
  "contrast", "director pass", "tweak layout", "rebalance",
  "adjust layout", "fix composition"
];

const MULTI_STEP_WORDS = ["and", "also", "then", "plus", "with"];

type IntentType = "LIVE_DRAW" | "COMPOSITION_PASS" | "FINAL_RENDER_PLAN";
type ThinkingLevel = "low" | "medium" | "high";

function classifyIntent(utterance: string): IntentType {
  const lower = utterance.toLowerCase();
  
  for (const kw of FINAL_RENDER_KEYWORDS) {
    if (lower.includes(kw)) return "FINAL_RENDER_PLAN";
  }
  
  for (const kw of COMPOSITION_KEYWORDS) {
    if (lower.includes(kw)) return "COMPOSITION_PASS";
  }
  
  return "LIVE_DRAW";
}

function countObjects(utterance: string): number {
  const objectWords = [
    "tree", "trees", "house", "houses", "mountain", "mountains",
    "sun", "bird", "birds", "flower", "flowers", "bush", "bushes",
    "path", "sky", "field", "cloud", "clouds", "grass"
  ];
  const lower = utterance.toLowerCase();
  let count = 0;
  for (const word of objectWords) {
    if (lower.includes(word)) count++;
  }
  return count;
}

function hasMultiStep(utterance: string): boolean {
  const lower = utterance.toLowerCase();
  let found = 0;
  for (const word of MULTI_STEP_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(lower)) found++;
  }
  return found >= 1;
}

function thinkingFor(intent: IntentType, utterance: string): ThinkingLevel {
  if (intent === "COMPOSITION_PASS" || intent === "FINAL_RENDER_PLAN") {
    return "high";
  }
  
  const isLong = utterance.length > 120;
  const isMultiStep = hasMultiStep(utterance);
  const hasMultipleObjects = countObjects(utterance) >= 3;
  
  if (isLong || isMultiStep || hasMultipleObjects) {
    return "medium";
  }
  
  return "low";
}

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

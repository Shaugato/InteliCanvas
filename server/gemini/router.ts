export type IntentType = "LIVE_DRAW" | "COMPOSITION_PASS" | "FINAL_RENDER_PLAN";
export type ThinkingLevel = "low" | "medium" | "high";

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

export function classifyIntent(utterance: string): IntentType {
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



export function thinkingFor(intent: IntentType, utterance: string): ThinkingLevel {
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

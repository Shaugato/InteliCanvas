import type { SceneGraph } from "../../shared/scene";

export type CanonicalizationDecision = "accept" | "repeat";

export interface VoiceCanonicalizationResult {
  decision: CanonicalizationDecision;
  originalUtterance: string;
  normalizedUtterance: string;
  confidence: number;
  canonicalUtterance?: string;
  matchedCommandId?: string;
  message: string;
  suggestions: string[];
}

type DemoCommand = {
  id: string;
  canonical: string;
  keywordWeights: Record<string, number>;
  requiredAnyGroups: string[][];
  phraseHints?: string[];
};

const ACCEPT_THRESHOLD = 0.74;
const REPEAT_THRESHOLD = 0.52;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "please",
  "plz",
  "pls",
  "can",
  "could",
  "would",
  "you",
  "me",
  "my",
  "i",
  "to",
  "just",
  "hey",
  "uh",
  "um",
  "kindly",
  "maybe",
  "now",
  "do",
  "it",
  "this",
  "that",
]);

const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(?:your|you|ur)\s+leash\b/g, "bluish"],
  [/\bblue\s+ish\b/g, "bluish"],
  [/\badd\s+bluish\s+sky\b/g, "change sky color bluish"],
  [/\b(?:make|set)\s+sky\s+(?:to\s+)?bluish\b/g, "change sky color bluish"],
  [/\bwalk\s+in\b/g, "walking"],
  [/\bto\s+people\b/g, "two people"],
];

const TOKEN_ALIASES: Record<string, string> = {
  drow: "draw",
  draww: "draw",
  drw: "draw",
  howse: "house",
  hous: "house",
  hause: "house",
  housee: "house",
  son: "sun",
  sunn: "sun",
  rite: "right",
  rght: "right",
  wright: "right",
  lift: "left",
  lft: "left",
  leff: "left",
  rode: "road",
  roade: "road",
  ppl: "people",
  peopl: "people",
  peopel: "people",
  peeps: "people",
  person: "people",
  persons: "people",
  wokin: "walking",
  walkin: "walking",
  walken: "walking",
  walkng: "walking",
  flyin: "flying",
  bird: "birds",
  brid: "birds",
  birb: "birds",
  blu: "bluish",
  blue: "bluish",
  blueish: "bluish",
  bluis: "bluish",
  bluh: "bluish",
  colour: "color",
  coler: "color",
  horizen: "horizon",
  horizan: "horizon",
  feild: "field",
  grasse: "grass",
  plese: "please",
  pplease: "please",
};

const DEMO_COMMANDS: DemoCommand[] = [
  {
    id: "draw_house",
    canonical: "draw house",
    keywordWeights: { draw: 1.1, add: 0.5, house: 3 },
    requiredAnyGroups: [["house"], ["draw", "add"]],
    phraseHints: ["draw house", "add house"],
  },
  {
    id: "draw_tree_left_of_house",
    canonical: "draw tree left of house",
    keywordWeights: { draw: 0.8, tree: 2.5, left: 2, house: 1.9 },
    requiredAnyGroups: [["tree"], ["left"], ["house"]],
    phraseHints: ["tree left of house", "left tree"],
  },
  {
    id: "add_sky",
    canonical: "add sky",
    keywordWeights: { add: 1.1, draw: 0.4, sky: 3 },
    requiredAnyGroups: [["sky"], ["add", "draw"]],
    phraseHints: ["add sky", "draw sky"],
  },
  {
    id: "add_grass_at_horizon",
    canonical: "add grass at horizon",
    keywordWeights: { add: 1, draw: 0.5, grass: 2.3, field: 2.1, horizon: 1.7 },
    requiredAnyGroups: [["grass", "field"], ["add", "draw", "put"]],
    phraseHints: ["grass at horizon", "field at horizon"],
  },
  {
    id: "add_sun",
    canonical: "add sun",
    keywordWeights: { add: 1.2, draw: 0.5, sun: 3 },
    requiredAnyGroups: [["sun"], ["add", "draw"]],
    phraseHints: ["add sun", "draw sun"],
  },
  {
    id: "move_sun_left",
    canonical: "move sun left",
    keywordWeights: { move: 2, sun: 2.2, left: 2 },
    requiredAnyGroups: [["move"], ["sun"], ["left"]],
    phraseHints: ["move sun left"],
  },
  {
    id: "change_sky_color_bluish",
    canonical: "change sky color bluish",
    keywordWeights: { change: 1.5, make: 0.8, sky: 2.2, color: 1.3, bluish: 2.4 },
    requiredAnyGroups: [["sky"], ["bluish"], ["change", "make", "color"]],
    phraseHints: ["sky color bluish", "bluish sky"],
  },
  {
    id: "draw_tree_right_of_house",
    canonical: "draw tree right of house",
    keywordWeights: { draw: 0.8, tree: 2.5, right: 2, house: 1.9 },
    requiredAnyGroups: [["tree"], ["right"], ["house"]],
    phraseHints: ["tree right of house", "right tree"],
  },
  {
    id: "add_road",
    canonical: "add road",
    keywordWeights: { add: 1.1, draw: 0.4, road: 3 },
    requiredAnyGroups: [["road"], ["add", "draw", "put"]],
    phraseHints: ["add road", "draw road"],
  },
  {
    id: "add_two_people_walking_on_road",
    canonical: "add two people walking on road",
    keywordWeights: { add: 0.9, two: 1.2, people: 2.4, walking: 2, road: 1.8 },
    requiredAnyGroups: [["people"], ["walking"], ["road"]],
    phraseHints: ["two people walking on road", "people walking road"],
  },
  {
    id: "add_birds_flying_in_sky",
    canonical: "add birds flying in sky",
    keywordWeights: { add: 0.9, birds: 2.4, flying: 2, sky: 1.6 },
    requiredAnyGroups: [["birds"], ["flying"], ["sky"]],
    phraseHints: ["birds flying in sky", "add birds"],
  },
  {
    id: "change_left_tree_color_pink",
    canonical: "change left tree color pink",
    keywordWeights: { change: 1.5, left: 1.8, tree: 2.2, color: 1.1, pink: 2.2 },
    requiredAnyGroups: [["tree"], ["left"], ["pink"], ["change", "make", "color"]],
    phraseHints: ["left tree color pink", "pink left tree"],
  },
  {
    id: "move_people_left",
    canonical: "move people left",
    keywordWeights: { move: 2, people: 2.3, left: 1.8 },
    requiredAnyGroups: [["move"], ["people"], ["left"]],
    phraseHints: ["move people left"],
  },
  {
    id: "change_field_color_soil_brown",
    canonical: "change field color soil brown",
    keywordWeights: {
      change: 1.5,
      field: 2.3,
      grass: 0.9,
      color: 1.1,
      soil: 1.7,
      brown: 2,
    },
    requiredAnyGroups: [["field", "grass"], ["brown", "soil"], ["change", "make", "color"]],
    phraseHints: ["field color soil brown", "brown field color"],
  },
];

const VOCAB = new Set<string>(
  [
    ...Object.keys(TOKEN_ALIASES),
    ...Object.values(TOKEN_ALIASES),
    ...STOP_WORDS,
    ...DEMO_COMMANDS.flatMap((c) => Object.keys(c.keywordWeights)),
    ...DEMO_COMMANDS.flatMap((c) => c.requiredAnyGroups.flat()),
    ...DEMO_COMMANDS.flatMap((c) => c.canonical.split(/\s+/)),
    "put",
    "set",
    "fly",
    "on",
    "in",
    "at",
    "of",
    "2",
  ].map((x) => x.toLowerCase()),
);

type ScoredCommand = {
  command: DemoCommand;
  confidence: number;
  keywordScore: number;
  groupScore: number;
  textScore: number;
};

export const DEMO_COMMAND_LIBRARY = DEMO_COMMANDS.map((c) => c.canonical);

export function isVoiceCanonicalizationEnabled(): boolean {
  const raw = (process.env.VOICE_CANONICALIZATION_DEMO_MODE ?? "1")
    .toString()
    .toLowerCase()
    .trim();
  return !["0", "false", "off", "no"].includes(raw);
}

export function canonicalizeVoiceTranscript(
  utterance: string,
  sceneGraph: SceneGraph,
): VoiceCanonicalizationResult {
  const normalized = normalizeUtterance(utterance);
  const tags = extractSceneTags(sceneGraph);

  const scored = DEMO_COMMANDS.map((command) =>
    scoreCommand(command, normalized.tokens, normalized.normalized, tags),
  ).sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const suggestions = scored.slice(0, 3).map((x) => x.command.canonical);

  if (best && best.confidence >= ACCEPT_THRESHOLD) {
    return {
      decision: "accept",
      originalUtterance: utterance,
      normalizedUtterance: normalized.normalized,
      confidence: round(best.confidence),
      canonicalUtterance: best.command.canonical,
      matchedCommandId: best.command.id,
      message: `Matched "${best.command.canonical}"`,
      suggestions,
    };
  }

  if (best && best.confidence >= REPEAT_THRESHOLD) {
    return {
      decision: "repeat",
      originalUtterance: utterance,
      normalizedUtterance: normalized.normalized,
      confidence: round(best.confidence),
      matchedCommandId: best.command.id,
      message: `Did you mean "${best.command.canonical}"? Please repeat using that phrase.`,
      suggestions,
    };
  }

  const fallback = suggestions.length
    ? `Try: "${suggestions[0]}", "${suggestions[1] ?? DEMO_COMMANDS[1].canonical}", or "${suggestions[2] ?? DEMO_COMMANDS[2].canonical}".`
    : `Try: "${DEMO_COMMANDS[0].canonical}" or "${DEMO_COMMANDS[1].canonical}".`;

  return {
    decision: "repeat",
    originalUtterance: utterance,
    normalizedUtterance: normalized.normalized,
    confidence: best ? round(best.confidence) : 0,
    matchedCommandId: best?.command.id,
    message: `I couldn't match a demo command. ${fallback}`,
    suggestions,
  };
}

function normalizeUtterance(input: string): { normalized: string; tokens: string[] } {
  let text = (input || "").toLowerCase().trim();
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(/[^a-z0-9\s]/g, " ");

  const rawTokens = text.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  for (const raw of rawTokens) {
    let token = TOKEN_ALIASES[raw] ?? raw;

    if (token === "three") {
      const hasHouseContext = rawTokens.some((t) =>
        ["house", "howse", "hous", "right", "rite", "left", "lift"].includes(t),
      );
      if (hasHouseContext) token = "tree";
    }

    token = correctToken(token);
    if (STOP_WORDS.has(token)) continue;
    tokens.push(token);
  }

  return {
    normalized: tokens.join(" ").trim(),
    tokens,
  };
}

function correctToken(token: string): string {
  if (!token || token.length <= 1) return token;
  if (/^\d+$/.test(token)) return token;
  if (VOCAB.has(token)) return token;

  let best = token;
  let bestSim = 0;
  for (const candidate of VOCAB) {
    if (Math.abs(candidate.length - token.length) > 2) continue;
    const sim = similarity(token, candidate);
    if (sim > bestSim) {
      bestSim = sim;
      best = candidate;
    }
  }

  return bestSim >= 0.8 ? best : token;
}

function scoreCommand(
  command: DemoCommand,
  tokens: string[],
  normalizedText: string,
  sceneTags: Set<string>,
): ScoredCommand {
  const keywordEntries = Object.entries(command.keywordWeights);
  const totalWeight = keywordEntries.reduce((sum, [, weight]) => sum + weight, 0);
  const matchedWeight = keywordEntries.reduce((sum, [token, weight]) => {
    return sum + weight * tokenPresence(tokens, token);
  }, 0);

  const keywordScore = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  const groupScore = computeGroupScore(command.requiredAnyGroups, tokens);
  const textScore = similarity(normalizedText, command.canonical);
  const phraseScore = computePhraseBonus(command, normalizedText);
  const contextScore = computeContextBias(command.id, sceneTags);
  const missingPenalty = computeMissingPenalty(command.requiredAnyGroups, tokens);

  const confidence = clamp(
    0.56 * keywordScore +
      0.24 * groupScore +
      0.14 * textScore +
      phraseScore +
      contextScore -
      missingPenalty,
    0,
    1,
  );

  return {
    command,
    confidence,
    keywordScore,
    groupScore,
    textScore,
  };
}

function computeGroupScore(groups: string[][], tokens: string[]): number {
  if (groups.length === 0) return 1;
  let matched = 0;
  for (const group of groups) {
    const groupPresence = Math.max(...group.map((token) => tokenPresence(tokens, token)), 0);
    if (groupPresence >= 0.72) matched++;
  }
  return matched / groups.length;
}

function computeMissingPenalty(groups: string[][], tokens: string[]): number {
  if (groups.length === 0) return 0;
  let missing = 0;
  for (const group of groups) {
    const groupPresence = Math.max(...group.map((token) => tokenPresence(tokens, token)), 0);
    if (groupPresence < 0.55) missing++;
  }
  return missing * 0.06;
}

function computePhraseBonus(command: DemoCommand, normalizedText: string): number {
  if (!normalizedText) return 0;
  let bonus = 0;

  if (normalizedText === command.canonical) {
    bonus += 0.14;
  }

  for (const hint of command.phraseHints ?? []) {
    if (normalizedText.includes(hint)) bonus += 0.04;
  }

  return Math.min(0.14, bonus);
}

function computeContextBias(commandId: string, sceneTags: Set<string>): number {
  switch (commandId) {
    case "draw_tree_left_of_house":
    case "draw_tree_right_of_house":
      return sceneTags.has("house") ? 0.08 : 0;
    case "move_sun_left":
      return sceneTags.has("sun") ? 0.12 : -0.06;
    case "change_sky_color_bluish":
      return sceneTags.has("sky") ? 0.08 : 0;
    case "add_two_people_walking_on_road":
      return sceneTags.has("road") || sceneTags.has("path") ? 0.08 : -0.03;
    case "add_birds_flying_in_sky":
      return sceneTags.has("sky") ? 0.06 : 0;
    case "change_left_tree_color_pink":
      return sceneTags.has("tree") ? 0.09 : -0.04;
    case "move_people_left":
      return sceneTags.has("people") || sceneTags.has("person") ? 0.09 : -0.05;
    case "change_field_color_soil_brown":
      return sceneTags.has("field") || sceneTags.has("grass") ? 0.08 : -0.03;
    case "add_road":
      return sceneTags.has("field") || sceneTags.has("grass") ? 0.04 : 0;
    default:
      return 0;
  }
}

function extractSceneTags(sceneGraph: SceneGraph): Set<string> {
  const tags = new Set<string>();
  for (const obj of Object.values(sceneGraph.objects)) {
    if (!obj?.semanticTag) continue;
    tags.add(obj.semanticTag.toLowerCase());
  }
  return tags;
}

function tokenPresence(tokens: string[], target: string): number {
  if (tokens.length === 0) return 0;
  let best = 0;

  for (const token of tokens) {
    if (token === target) return 1;
    const sim = similarity(token, target);
    if (sim > best) best = sim;
  }

  return best >= 0.72 ? best : 0;
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return clamp(1 - d / maxLen, 0, 1);
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

import {Grade, gradeFromString} from './grades';
import {getModel, getOpenRouterKey, getSuggestModel} from './settings';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function referer(): string {
  try {
    return location.origin || 'https://github.com/parse-nip/TelegramRizz';
  } catch{
    return 'https://github.com/parse-nip/TelegramRizz';
  }
}

async function postChatCompletions(body: object): Promise<string> {
  const key = getOpenRouterKey();
  if(!key.trim()) throw new Error('empty_api_key');
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': referer()
    },
    body: JSON.stringify(body)
  });
  if(!res.ok) {
    const t = await res.text();
    throw new Error(`openrouter_http_${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

export function buildSuggestBody(model: string, recentContext: string, draft: string, strictContext: boolean) {
  let user = `Conversation context:\n${recentContext}\n\nDraft reply being composed:\n${draft}\n\n`;
  user += 'Write 1 to 3 continuation suggestions that feel clever, playful and a little forward.\n';
  user += 'Prioritize continuity with this exact chat thread, not standalone one-liner quality.\n';
  user += 'If the draft references an earlier callback/theme and context supports it, reward that and continue it naturally.\n';
  user += 'Penalize suggestions that would feel random or disconnected in this specific conversation.\n';
  if(strictContext) {
    user += 'This is ghost completion mode: strongly anchor to concrete details from context and immediate prior turns.\n';
    user += 'Avoid generic flirty filler unless it directly connects to the context in this chat.\n';
  }
  user += 'Tone rules: confident and flirty, but still respectful, warm and never pushy.\n';
  user += 'Keep each suggestion short, specific, and high-signal (no generic filler).\n';
  user += 'Avoid emojis unless the draft already contains one.\n';
  user += 'If the draft is non-empty, each suggestion must start with the draft text exactly and only continue it.\n';
  user += 'Return JSON array only, like ["line1","line2"]. No other text.';
  return {
    model,
    temperature: 0.35,
    max_tokens: 220,
    messages: [{role: 'user' as const, content: user}]
  };
}

export function buildClassifyBody(model: string, recentContext: string, messageText: string) {
  let user = `Conversation context:\n${recentContext}\n\nMessage to evaluate:\n${messageText}\n\n`;
  user += 'You are a dating/rizz coach.\n';
  user += 'Grade with balanced weighting: standalone line quality first, then contextual fit when context is clearly relevant.\n';
  user += 'Do not punish a solid message just because it is context-neutral.\n';
  user += 'If the line attempts a callback/theme from earlier messages, reward it only when that callback is actually supported by context.\n';
  user += 'If a line strongly conflicts with known context, grade lower.\n';
  user += 'Use this rubric:\n';
  user += '- brilliant: standout, playful, high-signal, likely to spark attraction.\n';
  user += '- good: solid and positive.\n';
  user += '- inaccuracy: not bad, but vague/misaligned.\n';
  user += '- mistake: weak or awkward.\n';
  user += '- blunder: likely to hurt momentum.\n';
  user += '- resignation: catastrophic, social faceplant, abort mission.\n';
  user += '- book: standard opening/rizz line.\n';
  user += '- excellent: good move, but not brilliant.\n';
  user += '- free_piece: the other person gave an obvious opening to do something rizzy.\n';
  user += '- great_find: conversation-saving line.\n';
  user += '- missed_win: clear chance to ask them out was missed.\n';
  user += '- take_back: defusing/recovering from a message that did not go well.\n';
  user += '- checkmate: they agreed to go on a date.\n';
  user += '\nReturn JSON ONLY: ';
  user += '{"grade":"brilliant|good|inaccuracy|mistake|blunder|resignation|book|excellent|free_piece|great_find|missed_win|take_back|checkmate",';
  user += '"reason":"one short phrase","score":0-100}';
  return {
    model,
    temperature: 0.2,
    messages: [{role: 'user' as const, content: user}]
  };
}

export function buildPracticeBody(model: string, recentContext: string, userMessage: string, difficulty: number) {
  const temp = difficulty === 0 ? 0.65 : difficulty === 1 ? 0.55 : 0.45;
  let user = `Conversation context:\n${recentContext}\n\nLatest message from the user:\n${userMessage}\n\n`;
  user += 'You are the other person in this chat, replying naturally in Telegram style.\n';
  user += 'Reply with exactly one short message and no extra formatting.\n';
  if(difficulty === 0) user += 'Difficulty easy: warm and encouraging.\n';
  else if(difficulty === 1) user += 'Difficulty medium: playful, requires some specificity.\n';
  else user += 'Difficulty hard: selective, tests confidence and context awareness.\n';
  user += 'Do not output JSON.';
  return {
    model,
    temperature: temp,
    max_tokens: 90,
    messages: [{role: 'user' as const, content: user}]
  };
}

function parseScoreToGrade(score: number): Grade {
  if(score >= 90) return Grade.Brilliant;
  if(score >= 75) return Grade.Good;
  if(score >= 60) return Grade.Inaccuracy;
  if(score >= 40) return Grade.Mistake;
  if(score >= 20) return Grade.Blunder;
  if(score >= 0) return Grade.Resignation;
  return Grade.Unknown;
}

export function parseSuggestResponse(text: string): string[] {
  const trimmed = text.trim();
  try {
    const doc = JSON.parse(trimmed);
    if(Array.isArray(doc)) {
      return doc.map((x) => String(x));
    }
  } catch{ /* fall through */ }
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if(start >= 0 && end > start) {
    try {
      const doc = JSON.parse(trimmed.slice(start, end + 1));
      if(Array.isArray(doc)) {
        return doc.map((x) => String(x));
      }
    } catch{ /* */ }
  }
  return [trimmed];
}

export async function requestCasualSuggestions(recentContext: string, draft: string): Promise<string[]> {
  const body = buildSuggestBody(getModel(), recentContext, draft, false);
  const text = await postChatCompletions(body);
  return parseSuggestResponse(text);
}

export async function requestGhostSuggestions(recentContext: string, draft: string): Promise<string[]> {
  const body = buildSuggestBody(getSuggestModel(), recentContext, draft, true);
  const text = await postChatCompletions(body);
  return parseSuggestResponse(text);
}

export async function classifyMessage(recentContext: string, messageText: string): Promise<{grade: Grade, reason: string}> {
  const body = buildClassifyBody(getModel(), recentContext, messageText);
  const text = await postChatCompletions(body);
  if(!text.trim()) throw new Error('empty classification');
  let trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if(start >= 0 && end > start) trimmed = trimmed.slice(start, end + 1);
  try {
    const o = JSON.parse(trimmed);
    let grade = gradeFromString(o.grade || '');
    const score = typeof o.score === 'number' ? o.score : parseFloat(o.score);
    if(grade === Grade.Unknown && !Number.isNaN(score) && score >= 0) {
      grade = parseScoreToGrade(score);
    }
    let reason = (o.reason || '').toString().trim();
    if(!reason) reason = (o.grade || '').toString().trim();
    if(grade !== Grade.Unknown) {
      return {grade, reason};
    }
  } catch{ /* */ }
  const g = gradeFromString(text);
  if(g === Grade.Unknown) throw new Error('bad_classification');
  return {grade: g, reason: text.trim()};
}

export async function requestPracticeReply(recentContext: string, userMessage: string, difficulty: number): Promise<string> {
  const body = buildPracticeBody(getSuggestModel(), recentContext, userMessage, difficulty);
  const text = await postChatCompletions(body);
  return text.replace(/^["']|["']$/g, '').trim();
}

export type GambitReadiness = {ready: boolean, gambit?: string};

function buildGambitReadinessBody(model: string, recentContext: string, heuristicLabel: string) {
  let user = `Conversation (oldest to newest):\n${recentContext}\n\n`;
  user += `Heuristic hint (may be generic): "${heuristicLabel}"\n\n`;
  user += 'Decide if there is enough concrete shared context to name this chat\'s opening as ONE playful chess-style gambit.\n';
  user += 'If the thread is too short, too generic, or no memorable hook yet, return {"ready":false}.\n';
  user += 'If a clear recurring bit, callback, meme, or distinctive hook anchors the early chat, return {"ready":true,"gambit":"The Something Gambit"}.\n';
  user += 'The gambit must be 3–12 words (title case when natural), include "Gambit" unless it truly does not fit. ';
  user += 'Reference a memorable phrase from the messages when one exists.\n';
  user += 'Return JSON only, no markdown, no other text.';
  return {
    model,
    temperature: 0.2,
    max_tokens: 120,
    messages: [{role: 'user' as const, content: user}]
  };
}

function parseGambitReadiness(text: string): GambitReadiness {
  let trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if(start >= 0 && end > start) trimmed = trimmed.slice(start, end + 1);
  try {
    const o = JSON.parse(trimmed) as {ready?: unknown, gambit?: unknown};
    const ready = !!o.ready;
    if(!ready) return {ready: false};
    const gambit = typeof o.gambit === 'string' ? o.gambit.trim() : '';
    return {ready: true, gambit: gambit || undefined};
  } catch{
    return {ready: false};
  }
}

/** LLM decides when to name the gambit and what to call it; null on missing key / request failure. */
export async function requestGambitReadiness(recentContext: string, heuristicLabel: string): Promise<GambitReadiness | null> {
  if(!getOpenRouterKey().trim()) return null;
  const body = buildGambitReadinessBody(getModel(), recentContext, heuristicLabel);
  try {
    const text = await postChatCompletions(body);
    return parseGambitReadiness(text);
  } catch{
    return null;
  }
}

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

export type StatsOneLinerInput = {
  peerName: string;
  relationshipLabel: string;
  friendlinessThem: number;
  friendlinessLabel: string;
  flirtScore: number;
  flirtLabel: string;
  flirtHowTheyReply: string;
  topEmojis: {emoji: string, count: number}[];
  incomingTexts: string[];
};

function sanitizeStatsOneLiner(text: string): string {
  let s = text.trim().replace(/\s+/g, ' ');
  s = s.replace(/^["'""]|["'""]$/g, '');
  if(s.length > 220) s = s.slice(0, 217) + '...';
  return s;
}

export function buildStatsOneLinerBody(model: string, input: StatsOneLinerInput) {
  const lines = input.incomingTexts.slice(-48);
  let sample = lines.map((t, i) => `${i + 1}. ${t}`).join('\n');
  if(sample.length > 10000) sample = sample.slice(-10000);
  const topEmojiSummary = input.topEmojis.length ?
    input.topEmojis.slice(0, 10).map((x) => `${x.emoji}×${x.count}`).join(', ') :
    'none';

  let user = `You write short, funny one-liners about someone the user is texting on Telegram.\n`;
  user += `Their name: ${input.peerName}\n`;
  user += `Relationship tag (user-chosen): ${input.relationshipLabel}\n`;
  user += `Heuristic friendliness: ${input.friendlinessThem}/100 (${input.friendlinessLabel})\n`;
  user += `Heuristic flirt score: ${input.flirtScore}/100 (${input.flirtLabel})\n`;
  user += `Reply style (heuristic): ${input.flirtHowTheyReply}\n`;
  user += `Top emojis from them: ${topEmojiSummary}\n\n`;
  user += `Recent messages from them (numbered, oldest to newest):\n${sample || '(no text)'}\n\n`;
  user += `Write exactly ONE sentence, max 220 characters. Witty, playful, not cruel or mean-spirited. `;
  user += `No quotes around the line. No meta commentary. Plain text only.`;
  return {
    model,
    temperature: 0.4,
    max_tokens: 140,
    messages: [{role: 'user' as const, content: user}]
  };
}

/** LLM one-liner for Rizz stats; null if no API key or request failed. */
export async function requestStatsOneLiner(input: StatsOneLinerInput): Promise<string | null> {
  if(!getOpenRouterKey().trim()) return null;
  try {
    const body = buildStatsOneLinerBody(getModel(), input);
    const text = await postChatCompletions(body);
    const cleaned = sanitizeStatsOneLiner(text);
    return cleaned.length ? cleaned : null;
  } catch{
    return null;
  }
}

export type TrendWindowRow = {
  label: string;
  volume: number;
  incomingVolume: number;
  friendliness: number;
};

export type SilenceInitiativeHints = {
  lastMessageFrom: 'you' | 'them';
  hoursSinceLastMsg: number;
  avgThemReplyHours: number | null;
  recentSessionsYouFirst: number;
  recentSessionsTotal: number;
};

export type ConversationInsight = {
  whereWeAre: string;
  recentShift: string;
  suggestedNext: string;
  themes: {label: string, evidence: string}[];
  trendNarrative: string;
  trendDirection: 'up' | 'flat' | 'down';
  silenceNote: string;
  initiativeNote: string;
};

export type ConversationInsightInput = {
  peerName: string;
  relationshipLabel: string;
  transcript: string;
  friendlinessThem: number;
  friendlinessLabel: string;
  flirtScore: number;
  flirtLabel: string;
  trendRows: TrendWindowRow[];
  silenceHints: SilenceInitiativeHints;
  deterministicNotes: string;
};

function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if(t.length <= max) return t;
  return t.slice(0, max - 3) + '...';
}

function parseInsightJson(text: string): Partial<ConversationInsight> | null {
  let trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if(start >= 0 && end > start) trimmed = trimmed.slice(start, end + 1);
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    const trendDir = String(o.trendDirection || '').toLowerCase();
    const trendDirection: 'up' | 'flat' | 'down' =
      trendDir === 'up' || trendDir === 'down' || trendDir === 'flat' ? trendDir : 'flat';
    const themesRaw = o.themes;
    const themes: {label: string, evidence: string}[] = [];
    if(Array.isArray(themesRaw)) {
      for(const t of themesRaw.slice(0, 5)) {
        if(t && typeof t === 'object') {
          const label = clip(String((t as {label?: unknown}).label || ''), 48);
          const evidence = clip(String((t as {evidence?: unknown}).evidence || ''), 120);
          if(label) themes.push({label, evidence});
        }
      }
    }
    return {
      whereWeAre: clip(String(o.whereWeAre || ''), 360),
      recentShift: clip(String(o.recentShift || ''), 360),
      suggestedNext: clip(String(o.suggestedNext || ''), 280),
      themes,
      trendNarrative: clip(String(o.trendNarrative || ''), 360),
      trendDirection,
      silenceNote: clip(String(o.silenceNote || ''), 220),
      initiativeNote: clip(String(o.initiativeNote || ''), 220)
    };
  } catch{
    return null;
  }
}

export function buildConversationInsightBody(model: string, input: ConversationInsightInput) {
  let tr = input.trendRows.map((r) =>
    `${r.label}: total ${r.volume} msgs, them ${r.incomingVolume}, warmth~${r.friendliness}`
  ).join('\n');
  if(!tr.trim()) tr = '(not enough history for weekly buckets)';

  const sh = input.silenceHints;
  const sil = [
    `Last message from: ${sh.lastMessageFrom}`,
    `Hours since last message: ${sh.hoursSinceLastMsg.toFixed(1)}`,
    `Avg hours for them to reply (when you messaged first): ${sh.avgThemReplyHours != null ? sh.avgThemReplyHours.toFixed(1) : 'n/a'}`,
    `Last ${sh.recentSessionsTotal} sessions — you started first: ${sh.recentSessionsYouFirst}`
  ].join('\n');

  let user = `You analyze a private Telegram chat. Be warm, specific, and concise. Do not use chess metaphors or chess piece names.\n`;
  user += `Chat with: ${input.peerName}\n`;
  user += `Relationship tag: ${input.relationshipLabel}\n`;
  user += `Heuristic warmth (their messages): ${input.friendlinessThem}/100 (${input.friendlinessLabel})\n`;
  user += `Heuristic flirt signal: ${input.flirtScore}/100 (${input.flirtLabel})\n\n`;
  user += `Deterministic notes:\n${input.deterministicNotes}\n\n`;
  user += `Silence / initiative signals:\n${sil}\n\n`;
  user += `Weekly buckets (newest may be partial):\n${tr}\n\n`;
  user += `Recent transcript (oldest to newest, may be trimmed):\n${input.transcript || '(no text)'}\n\n`;
  user += `Return JSON ONLY with these keys:\n`;
  user += `{"whereWeAre":"1–2 sentences: current vibe and relationship of the thread",`;
  user += `"recentShift":"1–2 sentences: how tone or momentum changed lately",`;
  user += `"suggestedNext":"one short actionable idea for the user's next message",`;
  user += `"themes":[{"label":"short theme","evidence":"paraphrase or quote fragment"}],`;
  user += `"trendNarrative":"1–2 sentences interpreting the weekly buckets",`;
  user += `"trendDirection":"up|flat|down",`;
  user += `"silenceNote":"one sentence on wait/reply dynamics or empty string",`;
  user += `"initiativeNote":"one sentence on who starts chats or empty string"}\n`;
  user += `Max 5 themes. Plain text inside strings, no markdown.`;
  return {
    model,
    temperature: 0.35,
    max_tokens: 900,
    messages: [{role: 'user' as const, content: user}]
  };
}

export async function requestConversationInsight(input: ConversationInsightInput): Promise<ConversationInsight | null> {
  if(!getOpenRouterKey().trim()) return null;
  let transcript = input.transcript;
  if(transcript.length > 14000) transcript = transcript.slice(-14000);
  const body = buildConversationInsightBody(getModel(), {...input, transcript});
  try {
    const text = await postChatCompletions(body);
    const parsed = parseInsightJson(text);
    if(!parsed || !parsed.whereWeAre) return null;
    return {
      whereWeAre: parsed.whereWeAre || '',
      recentShift: parsed.recentShift || '',
      suggestedNext: parsed.suggestedNext || '',
      themes: parsed.themes?.length ? parsed.themes : [],
      trendNarrative: parsed.trendNarrative || '',
      trendDirection: parsed.trendDirection || 'flat',
      silenceNote: parsed.silenceNote || '',
      initiativeNote: parsed.initiativeNote || ''
    };
  } catch{
    return null;
  }
}

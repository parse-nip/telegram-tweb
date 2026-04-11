import type Chat from '@components/chat/chat';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {buildComposeContext, collectRizzMessages} from './rizzHistory';
import {computeChatStats, peerKeyFromPeerId, type RizzMsgLite} from './stats';
import {computePersonaPack, type PersonaPack} from './personality';
import {getPeerRelationship, relationshipLabel} from './peerRelationship';
import {
  requestConversationInsight,
  type ConversationInsight,
  type ConversationInsightInput,
  type TrendWindowRow
} from './openrouter';
import {computeTrendWindows, trendDirectionFromRows} from './trends';
import {computeSilenceInitiativeHints, formatSilenceInitiativeLines} from './silenceInitiative';
import {fallbackThemesFromMessages} from './themeBuckets';

function buildTranscriptLines(messages: RizzMsgLite[]): string[] {
  return messages.map((m) => (m.out ? 'You: ' : 'Them: ') + m.text);
}

function buildFallbackInsight(
  msgs: RizzMsgLite[],
  persona: PersonaPack,
  trendRows: TrendWindowRow[],
  silenceLines: string[]
): ConversationInsight {
  const themes = fallbackThemesFromMessages(msgs, 5);
  const dir = trendDirectionFromRows(trendRows);
  let trendNarrative = 'Not enough history to compare weeks yet.';
  const oldestFirst = [...trendRows].reverse();
  const withVol = oldestFirst.filter((r) => r.volume > 0);
  if(withVol.length >= 2) {
    const a = withVol[0].friendliness;
    const b = withVol[withVol.length - 1].friendliness;
    trendNarrative = `Warmth in their texts looks ${dir === 'up' ? 'stronger' : dir === 'down' ? 'softer' : 'steady'} from earlier to recent buckets (~${a} → ~${b} heuristic).`;
  }
  return {
    whereWeAre: `They read about ${persona.friendlinessLabel.toLowerCase()} (${persona.friendlinessThem}/100) with ${persona.flirtLabel.toLowerCase()} energy (${persona.flirtScore}/100).`,
    recentShift: withVol.length ? `Most recent week bucket has ${withVol[withVol.length - 1].volume} messages.` : 'Thread is still warming up.',
    suggestedNext: 'Ask one specific follow-up tied to something they cared about recently.',
    themes,
    trendNarrative,
    trendDirection: dir,
    silenceNote: silenceLines[0] || '',
    initiativeNote: silenceLines[1] || silenceLines[2] || ''
  };
}

function enrichInsight(
  insight: ConversationInsight,
  msgs: RizzMsgLite[],
  trendRows: TrendWindowRow[],
  silenceLines: string[]
): ConversationInsight {
  const themes = insight.themes.length ? insight.themes : fallbackThemesFromMessages(msgs, 5);
  const dir = insight.trendDirection || trendDirectionFromRows(trendRows);
  let trendNarrative = insight.trendNarrative.trim();
  if(!trendNarrative) {
    const oldestFirst = [...trendRows].reverse();
    const withVol = oldestFirst.filter((r) => r.volume > 0);
    if(withVol.length >= 2) {
      const a = withVol[0].friendliness;
      const b = withVol[withVol.length - 1].friendliness;
      trendNarrative = `Warmth in their texts looks ${dir === 'up' ? 'stronger' : dir === 'down' ? 'softer' : 'steady'} across buckets (~${a} → ~${b}).`;
    } else {
      trendNarrative = 'Not enough history to compare weeks yet.';
    }
  }
  const silenceNote = insight.silenceNote.trim() || silenceLines[0] || '';
  const initiativeNote = insight.initiativeNote.trim() || silenceLines[1] || silenceLines[2] || '';
  return {...insight, themes, trendDirection: dir, trendNarrative, silenceNote, initiativeNote};
}

export async function buildConversationInsightForChat(
  chat: Chat,
  opts?: {maxMessages?: number}
): Promise<{
  insight: ConversationInsight;
  peerKey: string;
  lastMid: number;
  peerName: string;
}> {
  const maxMessages = opts?.maxMessages ?? 1200;
  const msgs = collectRizzMessages(chat, maxMessages);
  const peerKey = peerKeyFromPeerId(chat.peerId);
  const rel = getPeerRelationship(chat.peerId);
  const relLabel = relationshipLabel(rel);
  const incoming = msgs.filter((m) => !m.out).map((m) => m.text);
  const persona = computePersonaPack(peerKey, incoming, rel);
  const stats = await computeChatStats(peerKey, msgs, maxMessages);
  const trendRows = computeTrendWindows(msgs, 4);
  const silenceHints = computeSilenceInitiativeHints(msgs, stats);
  const silenceLines = formatSilenceInitiativeLines(silenceHints);
  const deterministicNotes = [
    `Text messages in window: ${stats.cappedMessages} (you ${stats.outgoingCount}, them ${stats.incomingCount})`,
    `Reply pairs: you ${stats.replyPairsYou}, them ${stats.replyPairsThem}`,
    ...silenceLines
  ].join('\n');

  const lines = buildTranscriptLines(msgs);
  const ctx = buildComposeContext(chat, '');
  const transcript = ctx.trim() || lines.join('\n').slice(-12000);

  const peerName = await getPeerTitle({
    peerId: chat.peerId,
    plainText: true,
    limitSymbols: 40,
    useManagers: true
  }) || 'Chat';

  const input: ConversationInsightInput = {
    peerName: peerName || 'Chat',
    relationshipLabel: relLabel,
    transcript,
    friendlinessThem: persona.friendlinessThem,
    friendlinessLabel: persona.friendlinessLabel,
    flirtScore: persona.flirtScore,
    flirtLabel: persona.flirtLabel,
    trendRows,
    silenceHints,
    deterministicNotes
  };

  const llm = await requestConversationInsight(input);
  const insight: ConversationInsight = !llm ?
    buildFallbackInsight(msgs, persona, trendRows, silenceLines) :
    enrichInsight(llm, msgs, trendRows, silenceLines);

  const lastMid = msgs.length ? msgs[msgs.length - 1].mid : 0;
  return {insight, peerKey, lastMid, peerName: peerName || 'Chat'};
}

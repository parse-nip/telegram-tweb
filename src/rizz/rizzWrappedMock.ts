import {Grade} from './grades';
import type {RelationshipDeepAnalysis} from './openrouter';
import {computeChatStats, peerKeyFromPeerId, type ChatStats, type RizzMsgLite} from './stats';
import {buildActivityHeatmap, type ActivityHeatmap} from './rizzAnalysisHeatmap';
import {pickKeyMoments, type KeyMoment} from './analysisKeyMoments';
import {getPeerRelationship, type RizzPeerRelationship} from './peerRelationship';
import Modes from '@config/modes';

/**
 * Show the mock Wrapped shortcut on localhost, dev builds, staging hosts, or explicit URL flags.
 */
export function showMockWrappedShortcut(): boolean {
  if(Modes.mockAuth || Modes.mockWrap) {
    return true;
  }
  if(import.meta.env.DEV) {
    return true;
  }
  try {
    const h = location.hostname;
    if(h === 'localhost' || h === '127.0.0.1' || h.includes('staging')) {
      return true;
    }
  } catch{ /* ignore */ }
  return false;
}

function mockLlm(): RelationshipDeepAnalysis {
  return {
    interestPulse: 'Demo: warm, playful back-and-forth (mock data)',
    theirVibe: 'They read engaged and match your energy in this synthetic preview.',
    nextMoves: [
      'Suggest a concrete time to meet',
      'Send a short voice note',
      'Drop a specific plan for the weekend'
    ],
    bestLineYouSent: 'Want to grab coffee later?',
    baggingProximity: 62,
    coachNotes: 'This is mock data for local or staging QA. No crawl and no cloud LLM call was made.'
  };
}

/**
 * Synthetic transcript + derived stats for Wrapped UI when skipping real history / API.
 */
export async function buildMockWrappedRun(
  peerId: PeerId,
  _peerName: string
): Promise<{
  msgs: RizzMsgLite[],
  stats: ChatStats,
  heatmap: ActivityHeatmap,
  moments: KeyMoment[],
  llm: RelationshipDeepAnalysis | null,
  relationship: RizzPeerRelationship
}> {
  const now = Math.floor(Date.now() / 1000);
  const lines = [
    {out: false, text: 'Hey! How was your day?'},
    {out: true, text: 'Pretty good — want to grab coffee later?'},
    {out: false, text: 'Haha fair enough. Rain check?'},
    {out: true, text: 'Deal. This playlist is chef\'s kiss.'},
    {out: false, text: 'Same here honestly. Send me the link?'},
    {out: true, text: 'Sent. You always make me laugh.'},
    {out: false, text: 'Miss talking to you.'},
    {out: true, text: 'Facts. Talk later.'}
  ];
  const msgs: RizzMsgLite[] = lines.map((line, i) => ({
    date: now - (lines.length - i) * 3600,
    out: line.out,
    text: line.text,
    mid: 900000 + i,
    grade: Grade.Unknown
  }));
  const peerKey = peerKeyFromPeerId(peerId);
  const stats = await computeChatStats(peerKey, msgs, 50000);
  const heatmap = buildActivityHeatmap(msgs);
  const moments = pickKeyMoments(msgs, 20);
  const relationship = getPeerRelationship(peerId);
  return {
    msgs,
    stats,
    heatmap,
    moments,
    llm: mockLlm(),
    relationship
  };
}

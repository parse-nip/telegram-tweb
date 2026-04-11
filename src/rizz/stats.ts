import {Grade} from './grades';
import {getCached} from './gradeStore';

export type RizzMsgLite = {
  date: number;
  out: boolean;
  text: string;
  mid: number;
  grade: Grade;
};

const SESSION_GAP = 6 * 3600;

function gradeMomentum(grade: Grade): number {
  switch(grade) {
    case Grade.Checkmate: return 45;
    case Grade.Brilliant: return 35;
    case Grade.GreatFind: return 28;
    case Grade.Excellent: return 22;
    case Grade.FreePiece: return 18;
    case Grade.Good: return 12;
    case Grade.Book: return 6;
    case Grade.TakeBack: return 4;
    case Grade.Inaccuracy: return -8;
    case Grade.MissedWin: return -15;
    case Grade.Mistake: return -18;
    case Grade.Blunder: return -30;
    case Grade.Resignation: return -45;
    default: return 0;
  }
}

function openingName(messages: RizzMsgLite[]): string {
  for(const m of messages) {
    if(!m.text.trim()) continue;
    const lower = m.text.toLowerCase();
    if(/\bchef\s*kiss\b/i.test(lower) || lower.includes('chef kiss')) return 'The Chef\'s Kiss Gambit';
    if(lower.includes('coffee')) return 'Cold Coffee Attack';
    if(lower.includes('panda')) return 'Panda Gambit';
    if(lower.includes('movie') || lower.includes('date')) return 'Cinema Pressure System';
    if(lower.includes('hey') || lower.includes('hi')) return 'Classical Greeting Setup';
  }
  return 'Flexible Open';
}

/** Exported for lock-time label; same heuristics as internal `openingName`. */
export function heuristicOpeningName(messages: RizzMsgLite[]): string {
  return openingName(messages);
}

/** Without an LLM: only "name" when a keyword pattern matches (no generic opener). */
export function heuristicGambitWhenReady(messages: RizzMsgLite[]): {ready: boolean, gambit?: string} {
  const g = heuristicOpeningName(messages);
  if(g !== 'Flexible Open') return {ready: true, gambit: g};
  return {ready: false};
}

export type ChatStats = {
  cappedMessages: number;
  outgoingCount: number;
  incomingCount: number;
  doubleTextYou: number;
  doubleTextThem: number;
  sessionsTotal: number;
  sessionsYouFirst: number;
  sessionsThemFirst: number;
  replyPairsYou: number;
  replyPairsThem: number;
  replySumYou: number;
  replySumThem: number;
  bestHourYou: number | null;
  bestHourThem: number | null;
  evalScore: number;
  openingName: string;
};

export function truncate(s: string, max = 72): string {
  if(s.length <= max) return s;
  return s.slice(0, 69) + '...';
}

/** Opening / gambit line (top of thread). */
export function formatOpeningLine(
  stats: ChatStats,
  opts?: {openingLine1?: string, omitOpeningLine?: boolean}
): string | null {
  if(opts?.omitOpeningLine) {
    return null;
  }
  if(opts?.openingLine1?.trim()) {
    return truncate(opts.openingLine1.trim());
  }
  return truncate(`Opening · ${stats.openingName}`);
}

export async function computeChatStats(
  peerKey: string,
  messages: RizzMsgLite[],
  maxMessages: number
): Promise<ChatStats> {
  const slice = messages.slice(-maxMessages);
  const stats: ChatStats = {
    cappedMessages: slice.length,
    outgoingCount: 0,
    incomingCount: 0,
    doubleTextYou: 0,
    doubleTextThem: 0,
    sessionsTotal: 0,
    sessionsYouFirst: 0,
    sessionsThemFirst: 0,
    replyPairsYou: 0,
    replyPairsThem: 0,
    replySumYou: 0,
    replySumThem: 0,
    bestHourYou: null,
    bestHourThem: null,
    evalScore: 50,
    openingName: 'Flexible Open'
  };

  if(!slice.length) return stats;

  const withGrades: RizzMsgLite[] = [];
  for(const m of slice) {
    if(!m.text.trim()) continue;
    let grade = m.grade;
    if(grade === Grade.Unknown) {
      const cached = await getCached(peerKey, m.mid, m.text);
      if(cached) grade = cached.grade;
    }
    withGrades.push({...m, grade});
  }

  for(const m of withGrades) {
    if(m.out) stats.outgoingCount++;
    else stats.incomingCount++;
  }

  const bestHourYou = new Array(24).fill(0);
  const bestHourThem = new Array(24).fill(0);
  let score = 0;
  for(const m of withGrades) {
    const dt = new Date(m.date * 1000);
    const hour = dt.getHours();
    if(m.out) bestHourYou[hour]++;
    else bestHourThem[hour]++;
    if(m.grade !== Grade.Unknown) {
      const delta = gradeMomentum(m.grade);
      score += m.out ? delta : -delta;
      score = Math.max(-100, Math.min(100, score));
    }
  }
  const iy = bestHourYou.indexOf(Math.max(...bestHourYou));
  const it = bestHourThem.indexOf(Math.max(...bestHourThem));
  if(Math.max(...bestHourYou) > 0) stats.bestHourYou = iy;
  if(Math.max(...bestHourThem) > 0) stats.bestHourThem = it;

  stats.evalScore = Math.max(0, Math.min(100, 50 + Math.floor(score / 2)));
  stats.openingName = openingName(withGrades);

  for(let i = 1; i < withGrades.length; i++) {
    const a = withGrades[i - 1];
    const b = withGrades[i];
    if(!a.text.trim() || !b.text.trim()) continue;
    if(a.out === b.out) {
      if(b.out) stats.doubleTextYou++;
      else stats.doubleTextThem++;
    }
  }

  let i = 0;
  const n = withGrades.length;
  while(i < n) {
    while(i < n && !withGrades[i].text.trim()) i++;
    if(i >= n) break;
    stats.sessionsTotal++;
    if(withGrades[i].out) stats.sessionsYouFirst++;
    else stats.sessionsThemFirst++;
    let j = i + 1;
    while(j < n && (withGrades[j].date - withGrades[j - 1].date) <= SESSION_GAP) {
      j++;
    }
    i = j;
  }

  for(let k = 0; k < withGrades.length - 1; k++) {
    const a = withGrades[k];
    const b = withGrades[k + 1];
    if(!a.text.trim() || !b.text.trim()) continue;
    if(!a.out && b.out) {
      const delta = b.date - a.date;
      if(delta > 0) {
        stats.replyPairsYou++;
        stats.replySumYou += delta * 1000;
      }
    } else if(a.out && !b.out) {
      const delta = b.date - a.date;
      if(delta > 0) {
        stats.replyPairsThem++;
        stats.replySumThem += delta * 1000;
      }
    }
  }

  return stats;
}

export function peerKeyFromPeerId(peerId: PeerId): string {
  return String(peerId);
}

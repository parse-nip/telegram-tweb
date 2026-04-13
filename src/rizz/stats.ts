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
  // Wrapped additions
  powerDynamic: number; // -100 to 100
  topTopics: string[];
  totalWords: number;
  mostActiveMonth: string;
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

export function extractTopics(messages: RizzMsgLite[]): string[] {
  const stopWords = new Set(['the', 'and', 'you', 'that', 'was', 'for', 'with', 'are', 'this', 'have', 'but', 'not', 'what', 'all', 'were', 'when', 'can', 'said', 'there', 'use', 'each', 'which', 'she', 'how', 'their', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find']);
  const counts = new Map<string, number>();

  for(const m of messages) {
    const words = m.text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/);
    for(const w of words) {
      if(w.length > 3 && !stopWords.has(w)) {
        counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
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
    openingName: 'Flexible Open',
    powerDynamic: 0,
    topTopics: [],
    totalWords: 0,
    mostActiveMonth: ''
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
    stats.totalWords += m.text.split(/\s+/).length;
  }

  const monthCounts = new Map<string, number>();
  for(const m of withGrades) {
    if(m.out) stats.outgoingCount++;
    else stats.incomingCount++;

    const d = new Date(m.date * 1000);
    const mKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
    monthCounts.set(mKey, (monthCounts.get(mKey) || 0) + 1);
  }

  let maxMonth = '';
  let maxMonthCount = 0;
  monthCounts.forEach((count, key) => {
    if(count > maxMonthCount) {
      maxMonthCount = count;
      maxMonth = key;
    }
  });
  if(maxMonth) {
    const [y, m] = maxMonth.split('-');
    stats.mostActiveMonth = new Date(+y, +m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  stats.topTopics = extractTopics(withGrades);

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

  // Power dynamic calculation: -100 (submissive) to 100 (dominant)
  // Factors: initiative (sessions started), double-texts (less is more dominant), reply speed (longer is more dominant)
  const initiativeRatio = stats.sessionsTotal ? (stats.sessionsYouFirst / stats.sessionsTotal) : 0.5;
  const doubleTextRatio = (stats.doubleTextYou + stats.doubleTextThem) ? (stats.doubleTextYou / (stats.doubleTextYou + stats.doubleTextThem)) : 0.5;
  
  const avgYou = stats.replyPairsYou ? stats.replySumYou / stats.replyPairsYou : 0;
  const avgThem = stats.replyPairsThem ? stats.replySumThem / stats.replyPairsThem : 0;
  const replyRatio = (avgYou + avgThem) ? (avgYou / (avgYou + avgThem)) : 0.5;

  // We want higher power when: you start fewer sessions, you double-text less, you reply slower
  const power = (0.5 - initiativeRatio) * 40 + (0.5 - doubleTextRatio) * 30 + (replyRatio - 0.5) * 30;
  stats.powerDynamic = Math.max(-100, Math.min(100, Math.round(power * 2)));

  return stats;
}

export function peerKeyFromPeerId(peerId: PeerId): string {
  return String(peerId);
}

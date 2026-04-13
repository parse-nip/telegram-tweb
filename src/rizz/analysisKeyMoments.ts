import {Grade} from './grades';
import type {RizzMsgLite} from './stats';

const SESSION_GAP_SEC = 6 * 3600;
const SLOW_REPLY_SEC = 30 * 60;

export type KeyMomentKind = 'top_graded' | 'long_message' | 'session_start' | 'reply_gap';

export type KeyMoment = {
  date: number;
  out: boolean;
  text: string;
  mid: number;
  kind: KeyMomentKind;
  detail: string;
};

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

/** Notable messages for an analytics timeline (not a chat transcript). */
export function pickKeyMoments(msgs: RizzMsgLite[], maxItems = 12): KeyMoment[] {
  const withText = msgs.filter((m) => m.text.trim());
  if(!withText.length) return [];

  const byMid = new Map<number, KeyMoment>();

  const tryAdd = (m: RizzMsgLite, kind: KeyMomentKind, detail: string) => {
    if(byMid.has(m.mid)) return;
    byMid.set(m.mid, {
      date: m.date,
      out: m.out,
      text: m.text,
      mid: m.mid,
      kind,
      detail
    });
  };

  const outgoing = withText.filter((m) => m.out);
  const graded = outgoing
  .map((m) => ({m, s: m.grade !== Grade.Unknown ? gradeMomentum(m.grade) : 0}))
  .filter((x) => x.s >= 12)
  .sort((a, b) => b.s - a.s)
  .slice(0, 4);
  for(const {m, s} of graded) {
    tryAdd(m, 'top_graded', s >= 28 ? 'Standout graded line' : 'Solid graded line');
  }

  const byLength = [...withText].sort((a, b) => b.text.length - a.text.length).slice(0, 3);
  for(const m of byLength) {
    tryAdd(m, 'long_message', m.text.length > 220 ? 'Very long message' : 'Longer-than-usual message');
  }

  let sessionStarts = 0;
  for(let i = 0; i < withText.length; i++) {
    if(sessionStarts >= 5) break;
    if(i === 0 || withText[i].date - withText[i - 1].date > SESSION_GAP_SEC) {
      tryAdd(withText[i], 'session_start', 'New session / thread pickup');
      sessionStarts++;
    }
  }

  for(let i = 1; i < withText.length; i++) {
    const prev = withText[i - 1];
    const cur = withText[i];
    if(prev.out && !cur.out) {
      const gap = cur.date - prev.date;
      if(gap > SLOW_REPLY_SEC) {
        const mins = Math.round(gap / 60);
        tryAdd(cur, 'reply_gap', mins >= 120 ? `Reply after ~${Math.round(mins / 60)}h` : `Reply after ~${mins}m`);
      }
    }
  }

  return [...byMid.values()]
  .sort((a, b) => a.date - b.date)
  .slice(0, maxItems);
}

export function formatAnalysisTimestamp(tsSec: number): string {
  try {
    const d = new Date(tsSec * 1000);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch{
    return '';
  }
}

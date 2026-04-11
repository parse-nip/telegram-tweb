import {friendlinessScoreForIncoming} from './personality';
import type {RizzMsgLite} from './stats';
import type {TrendWindowRow} from './openrouter';

const WEEK_SEC = 7 * 24 * 3600;

function weekLabel(startSec: number, endSec: number): string {
  const a = new Date(startSec * 1000);
  const b = new Date(endSec * 1000);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(a)}–${fmt(b)}`;
}

/** Last `maxWeeks` windows of ~7 days each, newest bucket first in the returned array. */
export function computeTrendWindows(messages: RizzMsgLite[], maxWeeks: number): TrendWindowRow[] {
  if(!messages.length || maxWeeks < 1) return [];
  const nowSec = Math.floor(Date.now() / 1000);
  const rows: TrendWindowRow[] = [];
  for(let w = 0; w < maxWeeks; w++) {
    const hi = nowSec - w * WEEK_SEC;
    const lo = hi - WEEK_SEC;
    const inWin = messages.filter((m) => m.date >= lo && m.date < hi);
    const incoming = inWin.filter((m) => !m.out).map((m) => m.text);
    const vol = inWin.length;
    const incomingVol = incoming.length;
    const friendliness = friendlinessScoreForIncoming(incoming);
    rows.push({
      label: weekLabel(lo, hi),
      volume: vol,
      incomingVolume: incomingVol,
      friendliness
    });
  }
  return rows;
}

export function trendDirectionFromRows(rows: TrendWindowRow[]): 'up' | 'flat' | 'down' {
  const oldestFirst = [...rows].reverse();
  const withVol = oldestFirst.filter((r) => r.volume > 0);
  if(withVol.length < 2) return 'flat';
  const first = withVol[0].friendliness;
  const last = withVol[withVol.length - 1].friendliness;
  const d = last - first;
  if(d > 8) return 'up';
  if(d < -8) return 'down';
  return 'flat';
}

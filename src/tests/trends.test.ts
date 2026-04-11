import {describe, expect, it} from 'vitest';
import {Grade} from '../rizz/grades';
import type {RizzMsgLite} from '../rizz/stats';
import {computeTrendWindows, trendDirectionFromRows} from '../rizz/trends';

function msg(mid: number, date: number, out: boolean, text: string): RizzMsgLite {
  return {mid, date, out, text, grade: Grade.Unknown};
}

describe('computeTrendWindows', () => {
  it('buckets last four weeks', () => {
    const now = Math.floor(Date.now() / 1000);
    const week = 7 * 24 * 3600;
    const rows = computeTrendWindows([
      msg(1, now - 2 * 24 * 3600, false, 'hello there'),
      msg(2, now - 10 * 24 * 3600, false, 'older')
    ], 4);
    expect(rows.length).toBe(4);
    expect(rows[0].volume).toBeGreaterThanOrEqual(1);
  });
});

describe('trendDirectionFromRows', () => {
  it('returns flat for sparse data', () => {
    expect(trendDirectionFromRows([])).toBe('flat');
  });
});

import type {RizzMsgLite} from './stats';

export type ActivityHeatmap = {
  /** 7 rows (Mon–Sun) × 24 hour buckets, local time */
  grid: number[][];
  max: number;
  total: number;
  dayLabels: string[];
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Activity by weekday × hour of day (local), for message timestamps. */
export function buildActivityHeatmap(msgs: RizzMsgLite[]): ActivityHeatmap {
  const grid: number[][] = Array.from({length: 7}, () => Array.from({length: 24}, () => 0));
  let total = 0;
  for(const m of msgs) {
    const d = new Date(m.date * 1000);
    const day = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    grid[day][hour]++;
    total++;
  }
  let max = 0;
  for(const row of grid) {
    for(const c of row) {
      if(c > max) max = c;
    }
  }
  return {grid, max: max || 1, total, dayLabels: DAYS};
}

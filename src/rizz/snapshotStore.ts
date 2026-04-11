import type {ConversationInsight} from './openrouter';

const STORAGE_KEY = 'rizz_insight_snapshot_v1';

type Stored = {
  insight: ConversationInsight;
  at: number;
};

function readAll(): Record<string, Stored> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return {};
    return JSON.parse(raw) as Record<string, Stored>;
  } catch{
    return {};
  }
}

function saveAll(m: Record<string, Stored>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}

export function insightCacheKey(peerKey: string, lastMid: number): string {
  return `${peerKey}:${lastMid}`;
}

export function getCachedInsight(peerKey: string, lastMid: number): ConversationInsight | undefined {
  if(!lastMid) return undefined;
  const all = readAll();
  const e = all[insightCacheKey(peerKey, lastMid)];
  return e?.insight;
}

export function setCachedInsight(peerKey: string, lastMid: number, insight: ConversationInsight): void {
  if(!lastMid) return;
  const all = readAll();
  all[insightCacheKey(peerKey, lastMid)] = {insight, at: Date.now()};
  saveAll(all);
}

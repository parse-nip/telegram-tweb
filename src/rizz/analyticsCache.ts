/** Cached per-peer analytics for global “Rizz analytics” leaderboard. */

export type CachedPeerAnalytics = {
  peerId: string;
  peerName: string;
  friendlinessThem: number;
  flirtScore: number;
  at: number;
};

const KEY = 'rizz_analytics_cache_v1';

function readAll(): Record<string, CachedPeerAnalytics> {
  try {
    const raw = localStorage.getItem(KEY);
    if(!raw) return {};
    return JSON.parse(raw) as Record<string, CachedPeerAnalytics>;
  } catch{
    return {};
  }
}

export function cachePeerAnalytics(entry: Omit<CachedPeerAnalytics, 'at'> & {at?: number}): void {
  const all = readAll();
  const peerId = entry.peerId;
  all[peerId] = {
    peerId,
    peerName: entry.peerName,
    friendlinessThem: entry.friendlinessThem,
    flirtScore: entry.flirtScore,
    at: entry.at ?? Date.now()
  };
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function listCachedPeerAnalytics(): CachedPeerAnalytics[] {
  return Object.values(readAll()).sort((a, b) => b.friendlinessThem - a.friendlinessThem);
}

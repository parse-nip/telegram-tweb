/** Per-chat relationship tag (stored locally). */

export type RizzPeerRelationship =
  | 'unset'
  | 'friend'
  | 'longtime_friend'
  | 'acquaintance'
  | 'romantic'
  | 'significant_other'
  | 'situationship'
  | 'family'
  | 'coworker'
  | 'rival';

const STORAGE_KEY = 'rizz_peer_relationship_v1';

function loadMap(): Record<string, RizzPeerRelationship> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return {};
    const o = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, RizzPeerRelationship> = {};
    const allowed: RizzPeerRelationship[] = [
      'unset',
      'friend',
      'longtime_friend',
      'acquaintance',
      'romantic',
      'significant_other',
      'situationship',
      'family',
      'coworker',
      'rival'
    ];
    for(const k of Object.keys(o)) {
      const v = o[k] as RizzPeerRelationship;
      if(allowed.includes(v)) out[k] = v;
    }
    return out;
  } catch{
    return {};
  }
}

function saveMap(m: Record<string, RizzPeerRelationship>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}

export function getPeerRelationship(peerId: PeerId): RizzPeerRelationship {
  const k = String(peerId);
  const m = loadMap();
  return m[k] || 'unset';
}

export function setPeerRelationship(peerId: PeerId, r: RizzPeerRelationship) {
  const k = String(peerId);
  const m = loadMap();
  if(r === 'unset') delete m[k];
  else m[k] = r;
  saveMap(m);
}

/** Shown on first open of a chat (and in the picker). Order matches product wireframe. */
export const RIZZ_RELATIONSHIP_PICKER_OPTIONS: {value: RizzPeerRelationship, label: string}[] = [
  {value: 'friend', label: 'Friend'},
  {value: 'longtime_friend', label: 'Long-time friend'},
  {value: 'acquaintance', label: 'Acquaintance'},
  {value: 'romantic', label: 'Romantic interest'},
  {value: 'significant_other', label: 'Significant other'},
  {value: 'situationship', label: 'Situationship'}
];

const LABEL_BY_VALUE: Record<RizzPeerRelationship, string> = {
  unset: 'Not set',
  friend: 'Friend',
  longtime_friend: 'Long-time friend',
  acquaintance: 'Acquaintance',
  romantic: 'Romantic interest',
  significant_other: 'Significant other',
  situationship: 'Situationship',
  family: 'Family',
  coworker: 'Coworker / school',
  rival: 'Rival (friendly or not)'
};

export function relationshipLabel(r: RizzPeerRelationship): string {
  return LABEL_BY_VALUE[r] ?? 'Not set';
}

const SESSION_SKIP_PREFIX = 'rizz_rel_skip_v1:';

export function markRelationshipPromptSkippedForSession(peerId: PeerId) {
  try {
    sessionStorage.setItem(SESSION_SKIP_PREFIX + String(peerId), '1');
  } catch{
    /* ignore */
  }
}

export function wasRelationshipPromptSkippedThisSession(peerId: PeerId): boolean {
  try {
    return sessionStorage.getItem(SESSION_SKIP_PREFIX + String(peerId)) === '1';
  } catch{
    return false;
  }
}


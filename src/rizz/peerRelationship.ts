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
export const RIZZ_RELATIONSHIP_PICKER_OPTIONS: {value: RizzPeerRelationship, label: string, emoji: string}[] = [
  {value: 'friend', label: 'Friend', emoji: '👥'},
  {value: 'longtime_friend', label: 'Long-time friend', emoji: '🧑‍🤝‍🧑'},
  {value: 'acquaintance', label: 'Acquaintance', emoji: '🤝'},
  {value: 'romantic', label: 'Romantic interest', emoji: '💕'},
  {value: 'significant_other', label: 'Significant other', emoji: '💍'},
  {value: 'situationship', label: 'Situationship', emoji: '🔀'}
];

/** Short confirmation line after picking (shown ~1s before continuing). */
export const RELATIONSHIP_PICK_QUIPS: Partial<Record<RizzPeerRelationship, string>> = {
  friend: 'Understood. Playing the long game.',
  longtime_friend: 'Years of history — that hits different.',
  acquaintance: 'Keeping it casual. Got it.',
  romantic: 'Noted. The heart wants what it wants.',
  significant_other: 'Locked in. That\'s the vibe.',
  situationship: 'We get it! It\'s complicated.',
  family: 'Family ties. Got it.',
  coworker: 'Professional mode. Understood.',
  rival: 'Competitive energy noted.'
};

export function relationshipPickQuip(r: RizzPeerRelationship): string {
  const q = RELATIONSHIP_PICK_QUIPS[r];
  return q && q.trim() ? q : 'Got it.';
}

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


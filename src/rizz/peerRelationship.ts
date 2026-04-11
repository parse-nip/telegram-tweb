/** Per-chat relationship tag (stored locally). */

export type RizzPeerRelationship =
  | 'unset'
  | 'friend'
  | 'romantic'
  | 'family'
  | 'coworker'
  | 'acquaintance'
  | 'rival';

const STORAGE_KEY = 'rizz_peer_relationship_v1';

function loadMap(): Record<string, RizzPeerRelationship> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return {};
    const o = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, RizzPeerRelationship> = {};
    const allowed: RizzPeerRelationship[] = [
      'unset', 'friend', 'romantic', 'family', 'coworker', 'acquaintance', 'rival'
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

export const RIZZ_RELATIONSHIP_OPTIONS: {value: RizzPeerRelationship, label: string}[] = [
  {value: 'unset', label: 'Not set'},
  {value: 'friend', label: 'Friend'},
  {value: 'romantic', label: 'Romantic interest'},
  {value: 'family', label: 'Family'},
  {value: 'coworker', label: 'Coworker / school'},
  {value: 'acquaintance', label: 'Acquaintance'},
  {value: 'rival', label: 'Rival (friendly or not)'}
];

export function relationshipLabel(r: RizzPeerRelationship): string {
  const row = RIZZ_RELATIONSHIP_OPTIONS.find((x) => x.value === r);
  return row ? row.label : 'Not set';
}

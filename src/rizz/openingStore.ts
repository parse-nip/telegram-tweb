/** Persisted gambit-style opening label per chat — set once after enough messages. */

const STORAGE_KEY = 'rizz_opening_lock_v1';

type Entry = {label: string};

function load(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return {};
    return JSON.parse(raw) as Record<string, Entry>;
  } catch{
    return {};
  }
}

function save(all: Record<string, Entry>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getLockedOpeningLabel(peerKey: string): string | null {
  const e = load()[peerKey];
  return e?.label?.trim() ? e.label : null;
}

/** Only sets if missing — avoids duplicate AI calls from parallel refreshes. */
export function trySetLockedOpeningLabel(peerKey: string, label: string): boolean {
  const trimmed = label.trim();
  if(!trimmed) return false;
  const all = load();
  if(all[peerKey]?.label) return false;
  all[peerKey] = {label: trimmed};
  save(all);
  return true;
}

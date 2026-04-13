/** Wrapped “what do you want to know?” tiles — ids stored for future analytics / UI focus. */

export type WrappedIntentId =
  | 'power_dynamic'
  | 'highlights'
  | 'interest_indicator'
  | 'ai_coach'
  | 'heatmap'
  | 'common_topics'
  | 'chat_progression'
  | 'stats';

export type WrappedIntentTile = {
  id: WrappedIntentId,
  label: string,
  /** Short line shown on tile */
  line: string,
  /** Shown briefly after tap before continuing */
  quip: string,
  /** Layout hint for masonry */
  variant: 'compact' | 'tall' | 'wide' | 'full'
};

export const WRAPPED_INTENT_ROW1: WrappedIntentTile[] = [
  {
    id: 'power_dynamic',
    label: 'Power dynamic',
    line: 'Who leads the chat?',
    quip: 'Power map loading…',
    variant: 'compact'
  },
  {
    id: 'highlights',
    label: 'Highlights',
    line: 'Best moments',
    quip: 'Pulling the receipts…',
    variant: 'compact'
  },
  {
    id: 'interest_indicator',
    label: 'Interest indicator',
    line: 'Signals & energy',
    quip: 'Reading the room…',
    variant: 'tall'
  },
  {
    id: 'ai_coach',
    label: 'AI Coach',
    line: 'Quick take',
    quip: 'Coach mode on.',
    variant: 'compact'
  }
];

export const WRAPPED_INTENT_ROW2: WrappedIntentTile[] = [
  {
    id: 'heatmap',
    label: 'Heatmap',
    line: 'When you actually text',
    quip: 'Plotting your rhythm…',
    variant: 'wide'
  },
  {
    id: 'common_topics',
    label: 'Common topics',
    line: 'What you talk about',
    quip: 'Tagging themes…',
    variant: 'wide'
  },
  {
    id: 'chat_progression',
    label: 'Chat progression',
    line: 'Vibe over time',
    quip: 'Tracing the arc…',
    variant: 'wide'
  }
];

export const WRAPPED_INTENT_ROW3: WrappedIntentTile[] = [
  {
    id: 'stats',
    label: 'Stats',
    line: 'Time of day, duration, replies, double texts',
    quip: 'Crunching the numbers…',
    variant: 'full'
  }
];

const STORAGE_PREFIX = 'rizz_wrapped_intent_v1:';

export function setStoredWrappedIntent(peerId: PeerId, id: WrappedIntentId) {
  try {
    localStorage.setItem(STORAGE_PREFIX + String(peerId), id);
  } catch{
    /* ignore */
  }
}

export function getWrappedIntentTile(id: WrappedIntentId): WrappedIntentTile | undefined {
  return [...WRAPPED_INTENT_ROW1, ...WRAPPED_INTENT_ROW2, ...WRAPPED_INTENT_ROW3].find((t) => t.id === id);
}

export function getStoredWrappedIntent(peerId: PeerId): WrappedIntentId | null {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + String(peerId));
    if(!v) return null;
    const all = [
      ...WRAPPED_INTENT_ROW1,
      ...WRAPPED_INTENT_ROW2,
      ...WRAPPED_INTENT_ROW3
    ].map((t) => t.id);
    return all.includes(v as WrappedIntentId) ? v as WrappedIntentId : null;
  } catch{
    return null;
  }
}

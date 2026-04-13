/** Wrapped “what do you want to know?” tiles — multi-select ids stored for recap focus. */

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
  /** Optional flair copy (e.g. toast) */
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

const ALL_TILES: WrappedIntentTile[] = [
  ...WRAPPED_INTENT_ROW1,
  ...WRAPPED_INTENT_ROW2,
  ...WRAPPED_INTENT_ROW3
];

const ALLOWED_IDS = new Set(ALL_TILES.map((t) => t.id));

const STORAGE_PREFIX = 'rizz_wrapped_intent_v2:';

function isValidIntentId(id: string): id is WrappedIntentId {
  return ALLOWED_IDS.has(id as WrappedIntentId);
}

export function getWrappedIntentTile(id: WrappedIntentId): WrappedIntentTile | undefined {
  return ALL_TILES.find((t) => t.id === id);
}

export function setStoredWrappedIntents(peerId: PeerId, ids: WrappedIntentId[]) {
  try {
    const uniq = [...new Set(ids)].filter(isValidIntentId);
    localStorage.setItem(STORAGE_PREFIX + String(peerId), JSON.stringify(uniq));
  } catch{
    /* ignore */
  }
}

/** Legacy v1 key stored a single id string. */
const STORAGE_PREFIX_LEGACY = 'rizz_wrapped_intent_v1:';

export function getStoredWrappedIntents(peerId: PeerId): WrappedIntentId[] {
  const k = String(peerId);
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + k);
    if(raw) {
      const parsed = JSON.parse(raw) as unknown;
      if(Array.isArray(parsed)) {
        return parsed.filter((id): id is WrappedIntentId => typeof id === 'string' && isValidIntentId(id));
      }
    }
    const legacy = localStorage.getItem(STORAGE_PREFIX_LEGACY + k);
    if(legacy && isValidIntentId(legacy)) {
      return [legacy];
    }
  } catch{
    /* ignore */
  }
  return [];
}

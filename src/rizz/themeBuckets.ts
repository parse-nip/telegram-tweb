import type {RizzMsgLite} from './stats';

type Bucket = {id: string, label: string, re: RegExp};

const BUCKETS: Bucket[] = [
  {id: 'logistics', label: 'Plans & logistics', re: /\b(meet|plan|when|where|time|pick|drop|flight|train|uber|address|map|calendar|schedule|tomorrow|tonight|weekend)\b/i},
  {id: 'work', label: 'Work & school', re: /\b(work|boss|job|office|class|exam|study|deadline|meeting|school|uni|prof|homework)\b/i},
  {id: 'flirt', label: 'Flirt & affection', re: /\b(love|miss|babe|baby|kiss|heart|cutie|hot|beautiful|date|crush|xoxo)\b/i},
  {id: 'humor', label: 'Bits & humor', re: /\b(lol|lmao|haha|meme|joke|funny|dead|send|ngl|fr)\b/i},
  {id: 'checkin', label: 'Check-ins', re: /\b(how are you|wyd|you good|sup|hey|hi|morning|night)\b/i}
];

export type ThemeChip = {label: string, evidence: string};

export function fallbackThemesFromMessages(messages: RizzMsgLite[], limit: number): ThemeChip[] {
  const counts = new Map<string, {n: number, snippet: string}>();
  for(const m of messages) {
    const t = m.text;
    if(!t.trim()) continue;
    for(const b of BUCKETS) {
      if(b.re.test(t)) {
        const prev = counts.get(b.id);
        const snippet = t.length > 72 ? t.slice(0, 69) + '...' : t;
        if(!prev) {
          counts.set(b.id, {n: 1, snippet});
        } else {
          counts.set(b.id, {n: prev.n + 1, snippet: prev.snippet});
        }
        break;
      }
    }
  }
  return [...counts.entries()]
  .sort((a, b) => b[1].n - a[1].n)
  .slice(0, limit)
  .map(([id, v]) => {
    const label = BUCKETS.find((b) => b.id === id)?.label || id;
    return {label, evidence: `${v.n}× recent · ${v.snippet}`};
  });
}

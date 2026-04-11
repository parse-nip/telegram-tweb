/** `BuildSmartContext` / compose context — parity with `rizz_controller.cpp` */

function isStopToken(token: string): boolean {
  const t = token.toLowerCase();
  return [
    'you', 'your', 'youre', 'would', 'could', 'should', 'this', 'that', 'with', 'from',
    'what', 'when', 'where', 'have', 'just', 'like', 'into', 'them', 'they', 'then', 'there',
    'about', 'wanna', 'gonna'
  ].includes(t);
}

function tokensForMatch(text: string): string[] {
  const parts = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out: string[] = [];
  for(const part of parts) {
    if(part.length < 3 || isStopToken(part)) continue;
    if(!out.includes(part)) out.push(part);
  }
  return out;
}

interface ScoredLine {
  index: number;
  score: number;
}

export function buildSmartContext(
  allLines: string[],
  anchor: string,
  recentLimit: number,
  recallLimit: number
): string {
  if(!allLines.length) return '';
  const recentStart = Math.max(0, allLines.length - recentLimit);
  const recalled: number[] = [];
  const anchorTokens = tokensForMatch(anchor);
  if(recallLimit > 0 && recentStart > 0 && anchorTokens.length) {
    const tokenFrequency = new Map<string, number>();
    const olderTokens: string[][] = [];
    for(let i = 0; i < recentStart; i++) {
      const tokens = tokensForMatch(allLines[i]);
      for(const t of tokens) {
        tokenFrequency.set(t, (tokenFrequency.get(t) || 0) + 1);
      }
      olderTokens.push(tokens);
    }
    const scored: ScoredLine[] = [];
    for(let i = 0; i < recentStart; i++) {
      let score = 0;
      const tokens = olderTokens[i];
      for(const at of anchorTokens) {
        if(!tokens.includes(at)) continue;
        const frequency = Math.max(1, tokenFrequency.get(at) || 1);
        score += 1 / frequency;
      }
      if(score > 0) scored.push({index: i, score});
    }
    scored.sort((a, b) => {
      if(a.score === b.score) return b.index - a.index;
      return b.score - a.score;
    });
    const take = Math.min(recallLimit, scored.length);
    for(let i = 0; i < take; i++) {
      recalled.push(scored[i].index);
    }
    recalled.sort((a, b) => a - b);
  }

  const parts: string[] = [];
  if(recalled.length) {
    parts.push('Relevant earlier messages (oldest first):');
    for(const index of recalled) {
      parts.push(allLines[index]);
    }
    parts.push('');
  }
  parts.push('Recent messages (oldest first):');
  for(let i = recentStart; i < allLines.length; i++) {
    parts.push(allLines[i]);
  }
  return parts.join('\n');
}

export function mockSuggestions(draft: string): string[] {
  const seed = draft;
  if(!seed.trim()) {
    return [
      'Not me smiling at my screen because of you.',
      'So what trouble are we getting into this week?',
      'You\'re easy to talk to - I like that.'
    ];
  }
  return [
    `${seed} - and now you have to tell me your side of this.`,
    `${seed}, but I am low-key expecting a fun answer.`,
    `${seed}. I am not subtle about wanting this convo to continue.`
  ];
}

export function localGhostCompletions(draft: string): string[] {
  const d = draft.trimEnd();
  return [
    `${d} — what do you think?`,
    `${d}, if that works for you.`,
    `${d}. no rush.`
  ];
}

export function normalizeSuggestions(raw: string[], draft: string): string[] {
  const normalized: string[] = [];
  for(const line of raw) {
    const text = line.replace(/\s+/g, ' ').trim();
    if(!text) continue;
    if(!normalized.some((x) => x.toLowerCase() === text.toLowerCase())) {
      normalized.push(text);
    }
    if(normalized.length >= 3) break;
  }
  return normalized.length ? normalized : mockSuggestions(draft);
}

export function pickGhostTail(draft: string, lines: string[]): string {
  const d = draft.trim();
  if(!d) return '';
  const lower = d.toLowerCase();
  for(const line of lines) {
    const t = line.trim();
    if(!t.toLowerCase().startsWith(lower)) continue;
    if(t.length <= d.length) continue;
    return t.slice(d.length);
  }
  return '';
}

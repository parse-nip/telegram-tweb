import type {ChatStats, RizzMsgLite} from './stats';
import type {SilenceInitiativeHints} from './openrouter';

const SESSION_GAP = 6 * 3600;

function sessionStarts(messages: RizzMsgLite[]): boolean[] {
  const withText = messages.filter((m) => m.text.trim());
  const youFirst: boolean[] = [];
  let i = 0;
  const n = withText.length;
  while(i < n) {
    youFirst.push(withText[i].out);
    let j = i + 1;
    while(j < n && (withText[j].date - withText[j - 1].date) <= SESSION_GAP) {
      j++;
    }
    i = j;
  }
  return youFirst;
}

export function computeSilenceInitiativeHints(
  messages: RizzMsgLite[],
  stats: ChatStats
): SilenceInitiativeHints {
  const withText = messages.filter((m) => m.text.trim());
  const last = withText.length ? withText[withText.length - 1] : null;
  const nowSec = Date.now() / 1000;
  const hoursSinceLastMsg = last ? Math.max(0, (nowSec - last.date) / 3600) : 0;
  const lastMessageFrom: 'you' | 'them' = last?.out ? 'you' : 'them';

  const avgThemMs = stats.replyPairsThem ? stats.replySumThem / stats.replyPairsThem : null;
  const avgThemReplyHours = avgThemMs != null ? avgThemMs / 3600000 : null;

  const starts = sessionStarts(messages);
  const tail = 5;
  const slice = starts.slice(-tail);
  const recentSessionsTotal = slice.length;
  const recentSessionsYouFirst = slice.filter(Boolean).length;

  return {
    lastMessageFrom,
    hoursSinceLastMsg,
    avgThemReplyHours,
    recentSessionsYouFirst,
    recentSessionsTotal
  };
}

export function formatSilenceInitiativeLines(h: SilenceInitiativeHints): string[] {
  const lines: string[] = [];
  if(h.lastMessageFrom === 'you' && h.hoursSinceLastMsg >= 2) {
    const wait = h.hoursSinceLastMsg >= 48 ?
      `${Math.round(h.hoursSinceLastMsg / 24)} days` :
      `${h.hoursSinceLastMsg < 24 ? h.hoursSinceLastMsg.toFixed(1) + ' hours' : Math.round(h.hoursSinceLastMsg / 24) + ' days'}`;
    lines.push(`You sent the last message about ${wait} ago — ball may be in their court.`);
  }
  if(h.lastMessageFrom === 'them' && h.avgThemReplyHours != null && h.avgThemReplyHours > 0) {
    lines.push(`They usually take ~${h.avgThemReplyHours < 24 ? h.avgThemReplyHours.toFixed(1) + 'h' : Math.round(h.avgThemReplyHours / 24) + 'd'} to reply when you reach out.`);
  }
  if(h.recentSessionsTotal >= 2 && h.recentSessionsYouFirst >= h.recentSessionsTotal - 1) {
    lines.push(`You have started most of the last ${h.recentSessionsTotal} conversation stretches.`);
  } else if(h.recentSessionsTotal >= 2 && h.recentSessionsYouFirst <= 1) {
    lines.push(`They have often kicked off the last ${h.recentSessionsTotal} conversation stretches.`);
  }
  return lines;
}

import type Chat from '@components/chat/chat';
import PopupElement from '@components/popups';
import {computeChatStats, peerKeyFromPeerId} from './stats';
import type {ChatStats} from './stats';
import {collectRizzMessages} from './rizzHistory';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDelay(ms: number): string {
  if(ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if(s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}m ${sec}s`;
}

function formatHourLabel(h: number | null): string {
  if(h === null) return '—';
  const am = h < 12;
  const hr = h % 12 || 12;
  return `${hr}${am ? 'am' : 'pm'}`;
}

/** Flex ratios: avoid rounding gaps between two bar segments. */
function flexPair(a: number, b: number): {you: number, them: number} {
  const t = a + b;
  if(!t) return {you: 1, them: 1};
  return {you: a, them: b};
}

function renderRizzStatsHtml(s: ChatStats): string {
  const avgYou = s.replyPairsYou ? Math.round(s.replySumYou / s.replyPairsYou) : 0;
  const avgThem = s.replyPairsThem ? Math.round(s.replySumThem / s.replyPairsThem) : 0;
  const msg = flexPair(s.outgoingCount, s.incomingCount);
  const dbl = flexPair(s.doubleTextYou, s.doubleTextThem);
  const sess = flexPair(s.sessionsYouFirst, s.sessionsThemFirst);
  const reply = flexPair(s.replyPairsYou, s.replyPairsThem);

  return [
    '<section class="rizz-stats-hero">',
    `<div class="rizz-stats-dial-wrap" aria-hidden="true">`,
    `<div class="rizz-stats-dial" style="--score:${s.evalScore}"></div>`,
    `<span class="rizz-stats-dial-num">${s.evalScore}</span>`,
    '</div>',
    '<div class="rizz-stats-hero-copy">',
    '<div class="rizz-stats-hero-label">Rizz score</div>',
    `<div class="rizz-stats-hero-opening">${escapeHtml(s.openingName)}</div>`,
    '</div>',
    '</section>',

    '<section class="rizz-stats-section">',
    '<div class="rizz-stats-section-title">Messages (text)</div>',
    '<div class="rizz-stats-split-labels">',
    '<span>You</span><span>Them</span>',
    '</div>',
    `<div class="rizz-stats-split" title="Out ${s.outgoingCount} · In ${s.incomingCount}">`,
    `<div class="rizz-stats-split-you" style="flex:${msg.you} 1 0"></div>`,
    `<div class="rizz-stats-split-them" style="flex:${msg.them} 1 0"></div>`,
    '</div>',
    `<div class="rizz-stats-split-vals"><span>${s.outgoingCount}</span><span>${s.incomingCount}</span></div>`,
    '</section>',

    '<section class="rizz-stats-section">',
    '<div class="rizz-stats-section-title">Double-text streaks</div>',
    '<div class="rizz-stats-split-labels"><span>You</span><span>Them</span></div>',
    `<div class="rizz-stats-split" title="You ${s.doubleTextYou} · Them ${s.doubleTextThem}">`,
    `<div class="rizz-stats-split-you" style="flex:${dbl.you} 1 0"></div>`,
    `<div class="rizz-stats-split-them" style="flex:${dbl.them} 1 0"></div>`,
    '</div>',
    `<div class="rizz-stats-split-vals"><span>${s.doubleTextYou}</span><span>${s.doubleTextThem}</span></div>`,
    '</section>',

    '<section class="rizz-stats-section">',
    '<div class="rizz-stats-section-title">Who started sessions</div>',
    '<div class="rizz-stats-split-labels"><span>You first</span><span>Them first</span></div>',
    `<div class="rizz-stats-split" title="Sessions ${s.sessionsTotal}">`,
    `<div class="rizz-stats-split-you" style="flex:${sess.you} 1 0"></div>`,
    `<div class="rizz-stats-split-them" style="flex:${sess.them} 1 0"></div>`,
    '</div>',
    `<div class="rizz-stats-split-vals"><span>${s.sessionsYouFirst}</span><span>${s.sessionsThemFirst}</span></div>`,
    `<div class="rizz-stats-muted">Total sessions · ${s.sessionsTotal}</div>`,
    '</section>',

    '<section class="rizz-stats-section">',
    '<div class="rizz-stats-section-title">Reply pairs &amp; delay</div>',
    '<div class="rizz-stats-split-labels"><span>You reply</span><span>They reply</span></div>',
    `<div class="rizz-stats-split" title="Pairs: ${s.replyPairsYou} / ${s.replyPairsThem}">`,
    `<div class="rizz-stats-split-you" style="flex:${reply.you} 1 0"></div>`,
    `<div class="rizz-stats-split-them" style="flex:${reply.them} 1 0"></div>`,
    '</div>',
    `<div class="rizz-stats-split-vals"><span>${s.replyPairsYou}</span><span>${s.replyPairsThem}</span></div>`,
    `<div class="rizz-stats-delay-grid">`,
    `<div class="rizz-stats-delay"><span class="rizz-stats-delay-label">Avg delay (you)</span><span class="rizz-stats-delay-val">${s.replyPairsYou ? formatDelay(avgYou) : '—'}</span></div>`,
    `<div class="rizz-stats-delay"><span class="rizz-stats-delay-label">Avg delay (them)</span><span class="rizz-stats-delay-val">${s.replyPairsThem ? formatDelay(avgThem) : '—'}</span></div>`,
    '</div>',
    '</section>',

    '<section class="rizz-stats-section rizz-stats-section--hours">',
    '<div class="rizz-stats-section-title">Busiest hour</div>',
    '<div class="rizz-stats-hour-pair">',
    `<div class="rizz-stats-hour-card"><span class="rizz-stats-hour-who">You</span><span class="rizz-stats-hour-time">${formatHourLabel(s.bestHourYou)}</span></div>`,
    `<div class="rizz-stats-hour-card"><span class="rizz-stats-hour-who">Them</span><span class="rizz-stats-hour-time">${formatHourLabel(s.bestHourThem)}</span></div>`,
    '</div>',
    '</section>',

    '<p class="rizz-stats-disclaimer">Grades and stats are heuristic / model-assisted; not relationship advice.</p>'
  ].join('');
}

class PopupRizzStats extends PopupElement {
  constructor(private chat: Chat) {
    const title = document.createElement('div');
    title.textContent = 'Rizz stats';

    super('popup-rizz-stats', {
      title,
      closable: true,
      overlayClosable: true,
      body: true,
      buttons: [{langKey: 'OK', isCancel: true}]
    });

    const body = document.createElement('div');
    body.className = 'rizz-stats-popup-body';
    body.innerHTML = '<div class="rizz-stats-loading">Loading…</div>';
    this.body!.append(body);

    void (async() => {
      const msgs = collectRizzMessages(this.chat, 1200);
      const peerKey = peerKeyFromPeerId(this.chat.peerId);
      const s = await computeChatStats(peerKey, msgs, 1200);
      body.innerHTML = renderRizzStatsHtml(s);
    })();
  }
}

export function showRizzStatsPopup(chat: Chat) {
  PopupElement.createPopup(PopupRizzStats, chat).show();
}

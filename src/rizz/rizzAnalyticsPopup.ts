import PopupElement from '@components/popups';
import {listCachedPeerAnalytics} from './analyticsCache';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

class PopupRizzAnalytics extends PopupElement {
  constructor() {
    const title = document.createElement('div');
    title.textContent = 'Rizz analytics';

    super('popup-rizz-analytics', {
      title,
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      buttons: [{langKey: 'OK', isCancel: true}]
    });

    const body = document.createElement('div');
    body.className = 'rizz-analytics-popup-body';

    const rows = listCachedPeerAnalytics();
    if(!rows.length) {
      body.innerHTML = [
        '<p class="rizz-analytics-empty">Open <strong>Rizz stats</strong> in a chat to record friendliness scores.</p>',
        '<p class="rizz-analytics-muted">We keep a local leaderboard of chats you have analyzed—nothing is sent to a server.</p>'
      ].join('');
    } else {
      const top = rows[0];
      const hero = [
        '<section class="rizz-analytics-hero">',
        '<div class="rizz-analytics-hero-label">Friendliest (cached)</div>',
        `<div class="rizz-analytics-hero-name">${escapeHtml(top.peerName)}</div>`,
        `<div class="rizz-analytics-hero-sub">Friendliness · ${top.friendlinessThem} · Flirt · ${top.flirtScore}</div>`,
        '</section>'
      ].join('');

      const listItems = rows.slice(0, 24).map((r, i) => (
        `<div class="rizz-analytics-row">` +
        `<span class="rizz-analytics-rank">${i + 1}</span>` +
        `<span class="rizz-analytics-name">${escapeHtml(r.peerName)}</span>` +
        `<span class="rizz-analytics-metric">${r.friendlinessThem}</span>` +
        `</div>`
      )).join('');

      body.innerHTML = [
        hero,
        '<div class="rizz-analytics-section-title">Friendliness ranking</div>',
        '<div class="rizz-analytics-list">',
        listItems,
        '</div>',
        '<p class="rizz-analytics-muted">Higher friendliness = more positive, engaged wording in their texts (heuristic).</p>'
      ].join('');
    }

    this.body!.append(body);
  }
}

export function showRizzAnalyticsPopup() {
  PopupElement.createPopup(PopupRizzAnalytics).show();
}

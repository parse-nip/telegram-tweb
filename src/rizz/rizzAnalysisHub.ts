import PopupElement from '@components/popups';
import {avatarNew} from '@components/avatarNew';
import Icon from '@components/icon';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import {FOLDER_ID_ALL} from '@appManagers/constants';
import {isDialog} from '@lib/appManagers/utils/dialogs/isDialog';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import pause from '@helpers/schedulers/pause';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {toast, toastNew} from '@components/toast';
import Button from '@components/button';
import ripple from '@components/ripple';
import type Chat from '@components/chat/chat';
import {collectRizzMessages} from './rizzHistory';
import {computeChatStats, peerKeyFromPeerId, type ChatStats, type RizzMsgLite} from './stats';
import {computePersonaPack} from './personality';
import {
  getPeerRelationship,
  markRelationshipPromptSkippedForSession,
  relationshipLabel,
  wasRelationshipPromptSkippedThisSession
} from './peerRelationship';
import {createTelegramRelationshipPicker} from './rizzRelationshipPicker';
import {
  WRAPPED_INTENT_ROW1,
  WRAPPED_INTENT_ROW2,
  WRAPPED_INTENT_ROW3,
  setStoredWrappedIntents,
  getStoredWrappedIntents,
  getWrappedIntentTile,
  type WrappedIntentId,
  type WrappedIntentTile
} from './wrappedIntent';
import {requestRelationshipDeepAnalysis, type RelationshipDeepAnalysis} from './openrouter';
import {buildActivityHeatmap, type ActivityHeatmap} from './rizzAnalysisHeatmap';
import {formatAnalysisTimestamp, pickKeyMoments, type KeyMoment} from './analysisKeyMoments';
import {crawlFullHistory} from './rizzHistory';
import {buildMockWrappedRun, showMockWrappedShortcut} from './rizzWrappedMock';
import {PopupRizzWrapped} from './rizzWrapped';
import {listCachedPeerAnalytics} from './analyticsCache';
import {mountRizzAnalyticsBackdrop, unmountRizzAnalyticsBackdrop} from './rizzAnalyticsBackdrop';
export type ShowRizzAnalysisHubOptions = {
  /** Full-page app shell: hides chats, mounts hub in `#page-rizz-analytics`. */
  appMode?: boolean
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if(className) n.className = className;
  if(text !== undefined) n.textContent = text;
  return n;
}

function formatAvgReplyMs(ms: number): string {
  if(!ms || !Number.isFinite(ms)) return '—';
  const sec = Math.round(ms / 1000);
  if(sec < 90) return `~${sec}s`;
  if(sec < 7200) return `~${Math.round(sec / 60)} min`;
  return `~${(sec / 3600).toFixed(1)} h`;
}

async function fetchMessagesForAnalysis(peerId: PeerId, max: number, chat: Chat): Promise<RizzMsgLite[]> {
  await appImManager.setPeer({peerId}, false);
  await pause(350);
  const managers = rootScope.managers;
  for(let i = 0; i < 18; i++) {
    const n = collectRizzMessages(chat, max + 100).length;
    if(n > 0) break;
    await managers.appMessagesManager.getHistory({peerId, limit: 80});
    await pause(120);
  }
  for(let round = 0; round < 35; round++) {
    let msgs = collectRizzMessages(chat, max);
    if(msgs.length >= max) return msgs.slice(-max);
    const before = msgs.length;
    const oldest = msgs[0]?.mid;
    if(!oldest) {
      await managers.appMessagesManager.getHistory({peerId, limit: 100});
    } else {
      await managers.appMessagesManager.getHistory({
        peerId,
        offsetId: oldest,
        limit: 100,
        addOffset: 0
      });
    }
    await pause(90);
    msgs = collectRizzMessages(chat, max);
    if(msgs.length === before) break;
  }
  return collectRizzMessages(chat, max);
}

class PopupRizzAnalysisHub extends PopupElement {
  private headerTitleEl: HTMLElement;
  private peerId?: PeerId;
  private peerName = '';
  private messageLimit = 500;
  /** Back from intent step → relationship picker vs chat carousel */
  private intentBackTarget: 'relationship' | 'pick' = 'pick';
  /** Focus areas chosen on “What do you want to know?” (multi-select) */
  private wrappedIntentIds: WrappedIntentId[] = [];
  /** Private chats for carousel (pick step). */
  private carouselPeerIds: PeerId[] = [];
  private carouselSelectedIdx = 0;
  private carouselViewport?: HTMLElement;
  private carouselTrack?: HTMLElement;

  constructor(private readonly hubOptions?: ShowRizzAnalysisHubOptions) {
    const headerTitleEl = el('div', 'rizz-hub-header-title', 'Pick a chat');
    const appMode = !!hubOptions?.appMode;

    super('popup-rizz-analysis-hub', {
      title: headerTitleEl as unknown as HTMLElement,
      closable: true,
      overlayClosable: !appMode,
      withoutOverlay: appMode,
      body: true,
      // * If true, PopupElement inserts an empty `.scrollable` first; it steals max-height and pushes
      // * Back / Analyze below the fold (they stay in the DOM but are not visible).
      scrollable: false
    });

    if(appMode) {
      this.element.classList.add('rizz-analysis-hub--app');
    }

    this.headerTitleEl = headerTitleEl;
    this.renderPick();
  }

  private clearBody() {
    if(!this.body) return;
    this.body.replaceChildren();
    this.carouselViewport = undefined;
    this.carouselTrack = undefined;
    this.carouselPeerIds = [];
  }

  private setTitle(t: string) {
    this.headerTitleEl.textContent = t;
  }

  private async renderPick() {
    this.peerId = undefined;
    this.wrappedIntentIds = [];
    this.setTitle('Rizz Analytics');
    this.clearBody();
    if(!this.body) return;

    const pickTitle = el('h2', 'rizz-hub-pick-title', 'Let\'s get started!');
    const pickHint = el(
      'p',
      'rizz-hub-pick-hint',
      'Pick a chat, then continue. You can swipe this row or use the arrows.'
    );

    const leaderboardNodes: HTMLElement[] = [];
    const cached = listCachedPeerAnalytics();
    if(cached.length) {
      const lb = el('section', 'rizz-hub-leaderboard rizz-hub-leaderboard--after-pick');
      lb.append(el('p', 'rizz-hub-leaderboard__title', 'Friendliness snapshot (from chats where you opened Rizz stats)'));
      const row = el('div', 'rizz-hub-leaderboard__row');
      const top = cached[0];
      row.append(
        el('span', 'rizz-hub-leaderboard__rank', '1'),
        el('span', 'rizz-hub-leaderboard__name', top.peerName),
        el('span', 'rizz-hub-leaderboard__metric', String(top.friendlinessThem))
      );
      lb.append(row);
      lb.append(el('p', 'rizz-hub-leaderboard__hint', 'Local only · not sent to a server'));
      leaderboardNodes.push(lb);
    }

    const carouselRoot = el('div', 'rizz-hub-carousel rizz-hub-carousel--pick');
    const arrowsRow = el('div', 'rizz-hub-carousel__arrows');

    const navPrev = document.createElement('button');
    navPrev.type = 'button';
    navPrev.className = 'rizz-hub-carousel__nav rizz-hub-carousel__nav--prev';
    navPrev.setAttribute('aria-label', 'Previous chats');
    navPrev.append(Icon('arrow_prev', 'rizz-hub-carousel__nav-ico'));
    ripple(navPrev);

    const navNext = document.createElement('button');
    navNext.type = 'button';
    navNext.className = 'rizz-hub-carousel__nav rizz-hub-carousel__nav--next';
    navNext.setAttribute('aria-label', 'Next chats');
    navNext.append(Icon('arrow_next', 'rizz-hub-carousel__nav-ico'));
    ripple(navNext);

    arrowsRow.append(navPrev, navNext);

    const viewport = el('div', 'rizz-hub-carousel__viewport');
    const track = el('div', 'rizz-hub-carousel__track');
    viewport.append(track);
    this.carouselViewport = viewport;
    this.carouselTrack = track;

    carouselRoot.append(arrowsRow, viewport);

    const nameEl = el('div', 'rizz-hub-carousel__name', '');

    const actionsPick = el('div', 'rizz-hub-actions rizz-hub-actions--pick');
    const nextBtn = Button('btn-primary btn-color-primary rizz-hub-next-btn', {});
    nextBtn.textContent = 'Next';
    nextBtn.disabled = true;
    attachClickEvent(nextBtn, (e) => {
      e.stopPropagation();
      const id = this.carouselPeerIds[this.carouselSelectedIdx];
      if(id !== undefined) void this.openConfigure(id);
    }, {listenerSetter: this.listenerSetter});

    actionsPick.append(nextBtn);

    this.body.append(pickTitle, pickHint, carouselRoot, nameEl, actionsPick, ...leaderboardNodes);

    const loading = el('div', 'rizz-hub-loading-inline', 'Loading chats…');
    track.append(loading);

    const scrollToSelected = () => {
      const cells = [...track.querySelectorAll('.rizz-hub-carousel__cell')] as HTMLElement[];
      const cell = cells[this.carouselSelectedIdx];
      cell?.scrollIntoView({behavior: 'smooth', inline: 'center', block: 'nearest'});
    };

    const applySelection = () => {
      const cells = [...track.querySelectorAll('.rizz-hub-carousel__cell')] as HTMLElement[];
      cells.forEach((cell, i) => {
        cell.classList.toggle('rizz-hub-carousel__cell--selected', i === this.carouselSelectedIdx);
      });
      const pid = this.carouselPeerIds[this.carouselSelectedIdx];
      nextBtn.disabled = pid === undefined;
      const n = this.carouselPeerIds.length;
      navPrev.disabled = n === 0 || this.carouselSelectedIdx <= 0;
      navNext.disabled = n === 0 || this.carouselSelectedIdx >= n - 1;
      if(pid !== undefined) {
        void getPeerTitle({
          peerId: pid,
          plainText: true,
          limitSymbols: 32,
          useManagers: true
        }).then((t) => {
          nameEl.textContent = t || 'Selected chat';
        });
      } else {
        nameEl.textContent = '';
      }
    };

    const stepCarousel = (delta: number) => {
      if(!this.carouselPeerIds.length) return;
      this.carouselSelectedIdx = Math.max(0, Math.min(this.carouselPeerIds.length - 1, this.carouselSelectedIdx + delta));
      applySelection();
      scrollToSelected();
    };

    attachClickEvent(navPrev, () => stepCarousel(-1), {listenerSetter: this.listenerSetter});
    attachClickEvent(navNext, () => stepCarousel(1), {listenerSetter: this.listenerSetter});

    try {
      const {dialogs} = await rootScope.managers.dialogsStorage.getDialogs({
        limit: 140,
        filterId: FOLDER_ID_ALL
      });

      loading.remove();

      const rows: typeof dialogs = [];
      for(const d of dialogs) {
        if(!isDialog(d)) continue;
        if(d.peerId === rootScope.myId) continue;
        rows.push(d);
      }

      if(!rows.length) {
        track.append(el('div', 'rizz-hub-empty', 'No chats here yet.'));
        navPrev.disabled = true;
        navNext.disabled = true;
        return;
      }

      this.carouselPeerIds = rows.map((d) => d.peerId);
      this.carouselSelectedIdx = 0;

      const mw = this.middlewareHelper.get();
      for(let i = 0; i < rows.length; i++) {
        const d = rows[i];
        const cell = document.createElement('div');
        cell.className = 'rizz-hub-carousel__cell';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rizz-hub-carousel__item';
        btn.dataset.peerId = String(d.peerId);

        const av = avatarNew({
          middleware: mw,
          peerId: d.peerId,
          size: 56,
          isDialog: true,
          class: 'dialog-avatar',
          withStories: false
        });
        btn.append(av.node);
        cell.append(btn);

        attachClickEvent(btn, (e) => {
          e.preventDefault();
          this.carouselSelectedIdx = i;
          applySelection();
          scrollToSelected();
        }, {listenerSetter: this.listenerSetter});

        track.append(cell);
      }

      applySelection();
      queueMicrotask(() => scrollToSelected());
    } catch(err) {
      loading.textContent = 'Could not load chats.';
      console.error(err);
    }
  }

  private async openConfigure(peerId: PeerId) {
    this.peerId = peerId;
    this.peerName = (await getPeerTitle({
      peerId,
      plainText: true,
      limitSymbols: 48,
      useManagers: true
    })) || 'Chat';

    const needsRel =
      peerId.isUser() &&
      getPeerRelationship(peerId) === 'unset' &&
      !wasRelationshipPromptSkippedThisSession(peerId);

    if(needsRel) {
      this.intentBackTarget = 'relationship';
      this.renderRelationshipStep(peerId);
      return;
    }

    this.intentBackTarget = 'pick';
    this.renderWrappedIntentStep();
  }

  /** Inline step inside the hub (not a separate popup — avoids stacking under `#page-rizz-analytics`). */
  private renderRelationshipStep(peerId: PeerId) {
    this.setTitle(this.peerName);
    this.clearBody();
    if(!this.body) return;

    const picker = createTelegramRelationshipPicker({
      peerId,
      titleMode: 'person',
      listenerSetter: this.listenerSetter,
      autoAdvanceMs: 0,
      onCancel: () => void this.renderPick(),
      onComplete: () => {
        this.intentBackTarget = 'relationship';
        this.renderWrappedIntentStep();
      },
      onSkip: () => {
        markRelationshipPromptSkippedForSession(peerId);
        this.intentBackTarget = 'pick';
        this.renderWrappedIntentStep();
      }
    });

    this.body.append(picker);
  }

  /** Masonry-style multi-select — after relationship, before “Start Wrapped”. */
  private renderWrappedIntentStep() {
    const peerId = this.peerId;
    if(!peerId) return;

    this.setTitle(this.peerName);
    this.clearBody();
    if(!this.body) return;

    const initial = this.wrappedIntentIds.length ?
      this.wrappedIntentIds :
      getStoredWrappedIntents(peerId);
    const selected = new Set<WrappedIntentId>(initial);

    const wrap = el('div', 'rizz-hub-wrapped-intent');
    const title = el('h2', 'rizz-hub-wrapped-intent__title', 'What do you want to know?');
    const hint = el(
      'p',
      'rizz-hub-wrapped-intent__hint',
      'Select one or more — we\'ll weave them into the recap. Tap Continue when ready.'
    );

    const summary = el('p', 'rizz-hub-wrapped-intent__summary');
    const updateSummary = () => {
      const n = selected.size;
      summary.textContent = n === 0 ? 'Nothing selected yet.' : `${n} selected`;
      summary.classList.toggle('rizz-hub-wrapped-intent__summary--empty', n === 0);
    };

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'btn btn-link rizz-rel-picker-native__footer-btn rizz-rel-picker-native__footer-btn--primary';
    continueBtn.textContent = 'Continue';
    continueBtn.disabled = selected.size === 0;
    ripple(continueBtn);

    const refreshTile = (btn: HTMLButtonElement, id: WrappedIntentId) => {
      const on = selected.has(id);
      btn.classList.toggle('rizz-hub-wrapped-intent__tile--selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const mark = btn.querySelector('.rizz-hub-wrapped-intent__tile-check');
      if(mark) mark.classList.toggle('rizz-hub-wrapped-intent__tile-check--on', on);
    };

    const mkTile = (tile: WrappedIntentTile) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `rizz-hub-wrapped-intent__tile rizz-hub-wrapped-intent__tile--${tile.variant}`;
      const main = el('div', 'rizz-hub-wrapped-intent__tile-main');
      main.append(
        el('span', 'rizz-hub-wrapped-intent__tile-label', tile.label),
        el('span', 'rizz-hub-wrapped-intent__tile-line', tile.line)
      );
      const check = document.createElement('span');
      check.className = 'rizz-hub-wrapped-intent__tile-check';
      check.setAttribute('aria-hidden', 'true');
      btn.append(main, check);
      ripple(btn);
      refreshTile(btn, tile.id);
      attachClickEvent(btn, () => {
        if(selected.has(tile.id)) {
          selected.delete(tile.id);
        } else {
          selected.add(tile.id);
        }
        refreshTile(btn, tile.id);
        updateSummary();
        continueBtn.disabled = selected.size === 0;
      }, {listenerSetter: this.listenerSetter});
      return btn;
    };

    const r1 = el('div', 'rizz-hub-wrapped-intent__row rizz-hub-wrapped-intent__row--r1');
    WRAPPED_INTENT_ROW1.forEach((t) => r1.append(mkTile(t)));

    const r2 = el('div', 'rizz-hub-wrapped-intent__row rizz-hub-wrapped-intent__row--r2');
    WRAPPED_INTENT_ROW2.forEach((t) => r2.append(mkTile(t)));

    const r3 = el('div', 'rizz-hub-wrapped-intent__row rizz-hub-wrapped-intent__row--r3');
    WRAPPED_INTENT_ROW3.forEach((t) => r3.append(mkTile(t)));

    const grid = el('div', 'rizz-hub-wrapped-intent__grid');
    grid.append(r1, r2, r3);

    updateSummary();

    const footer = el('div', 'rizz-rel-picker-native__footer rizz-hub-wrapped-intent__footer');
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn-link rizz-rel-picker-native__footer-btn';
    backBtn.textContent = 'Back';
    ripple(backBtn);
    attachClickEvent(backBtn, () => {
      if(this.intentBackTarget === 'relationship') {
        this.renderRelationshipStep(peerId);
      } else {
        void this.renderPick();
      }
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(continueBtn, () => {
      if(selected.size === 0) return;
      this.wrappedIntentIds = [...selected];
      setStoredWrappedIntents(peerId, this.wrappedIntentIds);
      void this.renderConfigureReady();
    }, {listenerSetter: this.listenerSetter});

    footer.append(backBtn, continueBtn);

    wrap.append(title, hint, summary, grid, footer);
    this.body.append(wrap);
  }

  private renderConfigureReady() {
    const peerId = this.peerId;
    if(!peerId) return;

    this.setTitle(this.peerName);
    this.clearBody();
    if(!this.body) return;

    const wrap = el('div', 'rizz-hub-wrapped-ready');

    const title = el('h2', 'rizz-hub-wrapped-ready__title', 'Rizz Wrapped');
    const hint = el(
      'p',
      'rizz-hub-wrapped-ready__hint',
      'We\'ll pull message history from Telegram and build a recap on this device — same idea as a year-in-review story.'
    );

    const nodes: HTMLElement[] = [title];
    if(this.wrappedIntentIds.length) {
      const labels = this.wrappedIntentIds
      .map((id) => getWrappedIntentTile(id)?.label)
      .filter((x): x is string => !!x);
      let focusText: string;
      if(labels.length <= 3) {
        focusText = labels.join(', ');
      } else {
        focusText = `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
      }
      nodes.push(
        el('p', 'rizz-hub-wrapped-ready__focus', `Focus · ${focusText}`)
      );
    }
    nodes.push(hint);

    const panel = el('div', 'rizz-hub-wrapped-ready__panel');
    const infoRows: [string, string][] = [
      ['🔒', 'Private to this browser: nothing leaves your device unless you\'ve enabled cloud AI in Rizz settings.'],
      ['📥', 'We may request older messages so the recap has enough context.'],
      ['⏱', 'Big chats can take a moment — keep this screen open while we crawl.']
    ];
    for(const [ico, text] of infoRows) {
      const row = el('div', 'rizz-hub-wrapped-ready__row');
      row.append(
        el('span', 'rizz-hub-wrapped-ready__row-ico', ico),
        el('span', 'rizz-hub-wrapped-ready__row-txt', text)
      );
      panel.append(row);
    }

    const footer = el('div', 'rizz-rel-picker-native__footer rizz-hub-wrapped-ready__footer');

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn-link rizz-rel-picker-native__footer-btn';
    backBtn.textContent = 'Back';
    ripple(backBtn);
    attachClickEvent(backBtn, () => void this.renderWrappedIntentStep(), {listenerSetter: this.listenerSetter});

    const goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'btn btn-link rizz-rel-picker-native__footer-btn rizz-rel-picker-native__footer-btn--primary';
    goBtn.textContent = 'See Wrap';
    ripple(goBtn);
    attachClickEvent(goBtn, (e) => {
      e.stopPropagation();
      void this.runAnalysis();
    }, {listenerSetter: this.listenerSetter});

    footer.append(backBtn, goBtn);
    wrap.append(...nodes, panel, footer);

    if(showMockWrappedShortcut()) {
      const mockRow = el('div', 'rizz-hub-wrapped-ready__mock-wrap');
      const mockBtn = document.createElement('button');
      mockBtn.type = 'button';
      mockBtn.className = 'btn btn-link rizz-hub-wrapped-ready__mock-btn';
      mockBtn.textContent = 'Proceed with mock Wrapped';
      ripple(mockBtn);
      attachClickEvent(mockBtn, (e) => {
        e.stopPropagation();
        void this.runMockWrapped();
      }, {listenerSetter: this.listenerSetter});
      mockRow.append(mockBtn);
      wrap.append(mockRow);
    }

    this.body.append(wrap);
  }

  private async runMockWrapped() {
    const peerId = this.peerId;
    if(!peerId) return;
    try {
      const {msgs, stats, heatmap, moments, llm, relationship} = await buildMockWrappedRun(peerId, this.peerName);
      const wrapped = PopupElement.createPopup(PopupRizzWrapped, {
        peerId,
        peerName: this.peerName,
        msgs,
        stats,
        heatmap,
        llm,
        moments,
        relationship
      });
      wrapped.show();
      this.hide();
    } catch(err) {
      console.error(err);
      toast(
        `Mock Wrapped failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private truncateForAnalyzing(text: string, maxLen: number): string {
    const t = text.trim();
    if(t.length <= maxLen) return t;
    return t.slice(0, maxLen - 1) + '…';
  }

  private pickRandomMessageText(msgs: RizzMsgLite[]): string | null {
    const withText = msgs.filter((m) => m.text && m.text.trim());
    if(!withText.length) return null;
    return withText[Math.floor(Math.random() * withText.length)].text;
  }

  private buildWrappedAnalyzingTopicLabels(): string[] {
    const labels = this.wrappedIntentIds
    .map((id) => getWrappedIntentTile(id)?.label)
    .filter((x): x is string => !!x);
    const pad = ['Moments', 'Topics', 'Rhythm'];
    const out = [...labels];
    for(const p of pad) {
      if(out.length >= 3) break;
      if(!out.includes(p)) out.push(p);
    }
    return out.slice(0, 3);
  }

  private async runAnalysis() {
    const peerId = this.peerId;
    if(!peerId) return;

    this.clearBody();
    this.setTitle(this.peerName);
    if(!this.body) return;

    const root = el('div', 'rizz-hub-wrapped-analyzing');
    const title = el('h2', 'rizz-hub-wrapped-analyzing__title', 'Analyzing…');
    const status = el('p', 'rizz-hub-wrapped-analyzing__status', 'Gathering messages…');
    const stage = el('div', 'rizz-hub-wrapped-analyzing__stage');

    const messageBox = el('div', 'rizz-hub-wrapped-analyzing__message');
    const messageText = el('p', 'rizz-hub-wrapped-analyzing__message-text');
    messageText.textContent = 'Pulling history from this chat…';
    messageBox.append(messageText);

    const topicLabels = this.buildWrappedAnalyzingTopicLabels();
    const topicChips: HTMLElement[] = [];
    const corners: ('tr' | 'bl' | 'br')[] = ['tr', 'bl', 'br'];
    const arrows = ['↗', '↙', '↘'];
    for(let i = 0; i < 3; i++) {
      const row = el('div', `rizz-hub-wrapped-analyzing__float rizz-hub-wrapped-analyzing__float--${corners[i]}`);
      const arrow = el('span', 'rizz-hub-wrapped-analyzing__float-arrow', arrows[i]);
      arrow.setAttribute('aria-hidden', 'true');
      const chip = el('span', 'rizz-hub-wrapped-analyzing__float-chip', topicLabels[i] ?? '—');
      row.append(arrow, chip);
      topicChips.push(chip);
      stage.append(row);
    }
    stage.append(messageBox);
    root.append(title, status, stage);
    this.body.append(root);

    try {
      const msgs = await crawlFullHistory(peerId, (count, all) => {
        status.textContent = `${count} messages`;
        const pick = this.pickRandomMessageText(all);
        if(pick) {
          messageText.textContent = this.truncateForAnalyzing(pick, 200);
        }
      });

      if(!msgs.length) {
        toastNew({langPackKey: 'Error.AnError'});
        void this.openConfigure(peerId);
        return;
      }

      const pickFinal = this.pickRandomMessageText(msgs);
      if(pickFinal) {
        messageText.textContent = this.truncateForAnalyzing(pickFinal, 200);
      }

      status.textContent = 'Crunching signals…';
      const peerKey = peerKeyFromPeerId(peerId);
      const incoming = msgs.filter((m) => !m.out).map((m) => m.text);
      const rel = getPeerRelationship(peerId);
      const relLabel = relationshipLabel(rel);
      const persona = computePersonaPack(peerKey, incoming, rel);
      const stats = await computeChatStats(peerKey, msgs, 50000);
      const heatmap = buildActivityHeatmap(msgs);
      const moments = pickKeyMoments(msgs, 20);

      const top = stats.topTopics.filter((t) => !!t && t.trim()).slice(0, 3);
      for(let i = 0; i < topicChips.length; i++) {
        if(top[i]) topicChips[i].textContent = top[i];
      }

      status.textContent = 'Generating AI insights…';
      const transcript = msgs.slice(-150).map((m) => (m.out ? 'You: ' : 'Them: ') + m.text).join('\n');
      const statsBlurb = [
        `Messages: ${stats.cappedMessages} (you ${stats.outgoingCount}, them ${stats.incomingCount})`,
        `Reply pairs: you→them ${stats.replyPairsYou}, them→you ${stats.replyPairsThem}`,
        `Heuristic warmth (them): ${persona.friendlinessThem}/100 (${persona.friendlinessLabel})`,
        `Heuristic flirt signal: ${persona.flirtScore}/100 (${persona.flirtLabel})`,
        `Power dynamic: ${stats.powerDynamic} (-100 to 100)`,
        `Top topics: ${stats.topTopics.join(', ')}`
      ].join('\n');

      const llm = await requestRelationshipDeepAnalysis({
        peerName: this.peerName,
        relationshipLabel: relLabel,
        statsBlurb,
        transcript
      });

      let wrapped: InstanceType<typeof PopupRizzWrapped>;
      try {
        wrapped = PopupElement.createPopup(PopupRizzWrapped, {
          peerId,
          peerName: this.peerName,
          msgs,
          stats,
          heatmap,
          llm,
          moments,
          relationship: rel
        });
      } catch(err) {
        console.error('Rizz Wrapped failed to open', err);
        toast(
          `Wrapped could not open: ${err instanceof Error ? err.message : String(err)}`
        );
        void this.openConfigure(peerId);
        return;
      }
      /* Show Wrapped first so it mounts above the hub, then close the hub (avoids nav/history races). */
      wrapped.show();
      this.hide();
    } catch(e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      toast(`Analysis failed: ${msg}`);
      toastNew({langPackKey: 'Error.AnError'});
      void this.openConfigure(peerId);
    }
  }

  private renderResults(
    msgs: RizzMsgLite[],
    stats: Awaited<ReturnType<typeof computeChatStats>>,
    heatmap: ReturnType<typeof buildActivityHeatmap>,
    llm: RelationshipDeepAnalysis | null,
    persona: ReturnType<typeof computePersonaPack>
  ) {
    this.clearBody();
    this.setTitle(this.peerName);
    if(!this.body) return;

    const bag = llm?.baggingProximity ?? Math.min(100, Math.round(persona.friendlinessThem * 0.65 + persona.flirtScore * 0.35));
    const keyMoments = pickKeyMoments(msgs, 14);

    const wrap = el('div', 'rizz-hub-results rizz-hub-results--dash');
    wrap.append(
      this.buildDashHeader(msgs.length),
      this.buildAiInsightsSection(llm, persona, bag),
      this.buildSignalsSection(persona),
      this.buildStatsGrid(stats),
      this.buildHeatmapSection(heatmap),
      this.buildTimelineSection(keyMoments),
      this.buildResultsActions()
    );
    this.body.append(wrap);
  }

  private buildDashHeader(messageCount: number): HTMLElement {
    const s = el('section', 'rizz-hub-dash-head');
    s.append(
      el('p', 'rizz-hub-dash-head__kicker', 'Relationship analytics'),
      el('p', 'rizz-hub-dash-head__sub', `This run: ${messageCount} messages · heuristics + optional model read`)
    );
    return s;
  }

  private buildAiInsightsSection(
    llm: RelationshipDeepAnalysis | null,
    persona: ReturnType<typeof computePersonaPack>,
    bag: number
  ): HTMLElement {
    const root = el('section', 'rizz-hub-section');
    root.append(el('h2', 'rizz-hub-section__title', 'AI read'));

    const pulse = el('div', 'rizz-hub-result-pulse');
    pulse.append(
      el('div', 'rizz-hub-result-pulse__label', 'Interest pulse'),
      el('div', 'rizz-hub-result-pulse__text', llm?.interestPulse || `${persona.friendlinessLabel} energy · ${persona.flirtLabel} signals (heuristic).`)
    );

    const meter = el('div', 'rizz-hub-bag-meter');
    const bar = el('div', 'rizz-hub-bag-meter__fill');
    bar.style.width = `${bag}%`;
    const track = el('div', 'rizz-hub-bag-meter__track');
    track.append(bar);
    meter.append(
      el('div', 'rizz-hub-bag-meter__head', 'Momentum toward “sealed”'),
      track,
      el('div', 'rizz-hub-bag-meter__sub', `${bag}/100 — model + stats blend (subjective)`)
    );

    const split = el('div', 'rizz-hub-ai-split');
    const cardVibe = el('div', 'rizz-hub-subcard');
    cardVibe.append(
      el('h3', 'rizz-hub-subcard__title', 'Their vibe'),
      el('p', 'rizz-hub-subcard__body', llm?.theirVibe || 'Add an OpenRouter key in Rizz settings for a fuller narrative.')
    );
    const cardCoach = el('div', 'rizz-hub-subcard');
    cardCoach.append(
      el('h3', 'rizz-hub-subcard__title', 'Coach notes'),
      el('p', 'rizz-hub-subcard__body', llm?.coachNotes || 'Enable the API key for tailored coaching from the model.')
    );
    split.append(cardVibe, cardCoach);

    const next = el('div', 'rizz-hub-subcard');
    const ul = el('ul', 'rizz-hub-next-list');
    const moves = llm?.nextMoves?.length ? llm.nextMoves : [
      'Send one specific callback to something they cared about recently.',
      'Propose a concrete plan with a time window.',
      'Mirror their energy — don\'t double-text into silence.'
    ];
    for(const m of moves) {
      ul.append(el('li', 'rizz-hub-next-li', m));
    }
    next.append(el('h3', 'rizz-hub-subcard__title', 'Next moves'), ul);

    const best = el('div', 'rizz-hub-subcard rizz-hub-subcard--highlight');
    best.append(
      el('h3', 'rizz-hub-subcard__title', 'Best line you sent'),
      el('p', 'rizz-hub-subcard__body', llm?.bestLineYouSent || 'We could not pick one — try increasing message depth.')
    );

    root.append(pulse, meter, split, next, best);
    return root;
  }

  private buildSignalsSection(persona: ReturnType<typeof computePersonaPack>): HTMLElement {
    const root = el('section', 'rizz-hub-section');
    root.append(el('h2', 'rizz-hub-section__title', 'Text signals'));

    const row = el('div', 'rizz-hub-signal-chips');
    row.append(
      el('span', 'rizz-hub-chip', `Warmth (them): ${persona.friendlinessThem}/100`),
      el('span', 'rizz-hub-chip', `Flirt signal: ${persona.flirtScore}/100`),
      el('span', 'rizz-hub-chip', persona.friendlinessLabel),
      el('span', 'rizz-hub-chip', persona.flirtLabel)
    );

    const how = el('p', 'rizz-hub-signal-how', persona.flirtHowTheyReply);

    const emojiLine = persona.topEmojis.length ?
      el('p', 'rizz-hub-signal-note', `Top emoji from them: ${persona.topEmojis.slice(0, 5).map((e) => `${e.emoji}×${e.count}`).join(' · ')}`) :
      el('p', 'rizz-hub-signal-note', 'Not enough emoji data in this window.');

    const blurb = el('p', 'rizz-hub-signal-blurb', persona.oneLiner);
    root.append(row, how, emojiLine, blurb);
    return root;
  }

  private buildStatsGrid(stats: ChatStats): HTMLElement {
    const root = el('section', 'rizz-hub-section');
    root.append(el('h2', 'rizz-hub-section__title', 'By the numbers'));

    const avgYou = stats.replyPairsYou ? stats.replySumYou / stats.replyPairsYou : 0;
    const avgThem = stats.replyPairsThem ? stats.replySumThem / stats.replyPairsThem : 0;

    const grid = el('div', 'rizz-hub-stat-grid');
    const tiles: [string, string][] = [
      ['Messages (window)', String(stats.cappedMessages)],
      ['You / them sends', `${stats.outgoingCount} / ${stats.incomingCount}`],
      ['Reply pairs (→them / →you)', `${stats.replyPairsYou} / ${stats.replyPairsThem}`],
      ['Avg reply time (you / them)', `${formatAvgReplyMs(avgYou)} · ${formatAvgReplyMs(avgThem)}`],
      ['Sessions (est.)', String(stats.sessionsTotal)],
      ['Who started first (you / them)', `${stats.sessionsYouFirst} / ${stats.sessionsThemFirst}`],
      ['Double-text streaks (you / them)', `${stats.doubleTextYou} / ${stats.doubleTextThem}`],
      ['Momentum score', `${stats.evalScore}/100`],
      ['Peak hour you / them', [
        stats.bestHourYou !== null ? `${stats.bestHourYou}:00` : '—',
        stats.bestHourThem !== null ? `${stats.bestHourThem}:00` : '—'
      ].join(' · ')],
      ['Opening tag', stats.openingName]
    ];
    for(const [label, value] of tiles) {
      const t = el('div', 'rizz-hub-stat-tile');
      t.append(el('span', 'rizz-hub-stat-tile__label', label), el('span', 'rizz-hub-stat-tile__value', value));
      grid.append(t);
    }
    root.append(grid);
    return root;
  }

  private buildHeatmapSection(heatmap: ActivityHeatmap): HTMLElement {
    const hm = el('section', 'rizz-hub-section rizz-hub-heatmap');
    hm.append(
      el('h2', 'rizz-hub-section__title', 'Activity heatmap'),
      el('p', 'rizz-hub-section__hint', 'Local time · darker = more messages in that hour')
    );
    const hLabels = el('div', 'rizz-hub-heatmap__hours');
    for(let h = 0; h < 24; h += 6) {
      hLabels.append(el('span', 'rizz-hub-heatmap__hour', `${h}:00`));
    }
    const matrix = el('div', 'rizz-hub-heatmap__matrix');
    heatmap.grid.forEach((row, di) => {
      const r = el('div', 'rizz-hub-heatmap__row');
      r.append(el('span', 'rizz-hub-heatmap__day', heatmap.dayLabels[di]));
      const cells = el('div', 'rizz-hub-heatmap__cells');
      for(let hi = 0; hi < 24; hi++) {
        const v = row[hi];
        const c = el('span', 'rizz-hub-heatmap__cell');
        const t = heatmap.max > 0 ? v / heatmap.max : 0;
        c.style.opacity = String(0.15 + t * 0.85);
        c.title = `${heatmap.dayLabels[di]} ${hi}:00 — ${v} msgs`;
        cells.append(c);
      }
      r.append(cells);
      matrix.append(r);
    });
    hm.append(hLabels, matrix);
    return hm;
  }

  private buildTimelineSection(moments: KeyMoment[]): HTMLElement {
    const root = el('section', 'rizz-hub-section');
    root.append(
      el('h2', 'rizz-hub-section__title', 'Key moments in time'),
      el('p', 'rizz-hub-section__hint', 'Graded highlights, long replies, session pickups, slow replies — not a full chat log.')
    );

    if(!moments.length) {
      root.append(el('p', 'rizz-hub-timeline-empty', 'No standout moments in this window.'));
      return root;
    }

    const list = el('div', 'rizz-hub-timeline');
    for(const km of moments) {
      const row = el('div', `rizz-hub-timeline__row rizz-hub-timeline__row--${km.kind}`);
      const meta = el('div', 'rizz-hub-timeline__meta');
      meta.append(
        el('span', 'rizz-hub-timeline__time', formatAnalysisTimestamp(km.date)),
        el('span', 'rizz-hub-timeline__who', km.out ? 'You' : 'Them'),
        el('span', 'rizz-hub-timeline__badge', km.detail)
      );
      const snippet = km.text.length > 200 ? km.text.slice(0, 197) + '…' : km.text;
      const body = el('p', 'rizz-hub-timeline__snippet', snippet);
      row.append(meta, body);
      list.append(row);
    }
    root.append(list);
    return root;
  }

  private buildResultsActions(): HTMLElement {
    const actions = el('div', 'rizz-hub-results-actions');
    const again = Button('btn-secondary btn-color-secondary', {});
    again.textContent = 'Another chat';
    attachClickEvent(again, () => void this.renderPick(), {listenerSetter: this.listenerSetter});

    const done = Button('btn-primary btn-color-primary', {});
    done.textContent = 'Done';
    attachClickEvent(done, () => this.hide(), {listenerSetter: this.listenerSetter});

    actions.append(again, done);
    return actions;
  }
}

export function showRizzAnalysisHub(opts?: ShowRizzAnalysisHubOptions) {
  const pageEl = document.getElementById('page-rizz-analytics');
  const root = document.getElementById('rizz-analytics-root');
  const chats = document.getElementById('page-chats');

  const popup = PopupElement.createPopup(PopupRizzAnalysisHub, opts);

  if(opts?.appMode && pageEl && root && chats) {
    mountRizzAnalyticsBackdrop(pageEl);

    const shellCleanup = () => {
      unmountRizzAnalyticsBackdrop();
      pageEl.style.display = 'none';
      chats.style.display = '';
      document.body.classList.remove('rizz-analytics-app');
    };

    popup.addEventListener('closeAfterTimeout', shellCleanup as any);

    pageEl.style.display = 'flex';
    chats.style.display = 'none';
    document.body.classList.add('rizz-analytics-app');
  }

  popup.show();

  if(opts?.appMode && root) {
    const el = popup.getMountHTMLElement();
    queueMicrotask(() => root.append(el));
  }
}

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
import {getPeerRelationship, relationshipLabel} from './peerRelationship';
import {requestRelationshipDeepAnalysis, type RelationshipDeepAnalysis} from './openrouter';
import {buildActivityHeatmap, type ActivityHeatmap} from './rizzAnalysisHeatmap';
import {formatAnalysisTimestamp, pickKeyMoments, type KeyMoment} from './analysisKeyMoments';
import {crawlFullHistory} from './rizzHistory';
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

    this.setTitle(this.peerName);
    this.clearBody();
    if(!this.body) return;

    const hero = el('div', 'rizz-hub-hero rizz-hub-hero--compact');
    const deco = el('div', 'rizz-hub-hero__deco');
    hero.append(deco);

    const hint = el('p', 'rizz-hub-sub', 'Ready to see your year in review? We will deep crawl your history to build your Rizz Wrapped experience.');

    const actions = el('div', 'rizz-hub-actions');
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn-primary btn-transparent';
    backBtn.textContent = 'Back';
    ripple(backBtn);
    attachClickEvent(backBtn, () => void this.renderPick(), {listenerSetter: this.listenerSetter});

    const goBtn = Button('btn-primary btn-color-primary rizz-hub-analyze-btn', {});
    goBtn.textContent = 'Start Wrapped';
    attachClickEvent(goBtn, (e) => {
      e.stopPropagation();
      void this.runAnalysis();
    }, {listenerSetter: this.listenerSetter});

    actions.append(backBtn, goBtn);

    this.body.append(hero, hint, actions);
  }

  private async runAnalysis() {
    const peerId = this.peerId;
    if(!peerId) return;

    this.clearBody();
    this.setTitle(`Analyzing ${this.peerName}…`);
    if(!this.body) return;

    const loadBox = el('div', 'rizz-hub-loading rizz-hub-loading--wrapped');
    const pulse = el('div', 'rizz-hub-loading__pulse');
    const text = el('p', 'rizz-hub-loading__text', 'Deep crawling history…');
    const progress = el('div', 'rizz-hub-loading__progress', '0 messages');
    const snippets = el('div', 'rizz-hub-loading__snippets');
    loadBox.append(pulse, text, progress, snippets);
    this.body.append(loadBox);

    try {
      const msgs = await crawlFullHistory(peerId, (count) => {
        progress.textContent = `${count} messages`;
      });

      if(!msgs.length) {
        toastNew({langPackKey: 'Error.AnError'});
        void this.openConfigure(peerId);
        return;
      }

      // Show some random snippets while computing stats
      const showSnippets = async () => {
        for(let i = 0; i < 15; i++) {
          const m = msgs[Math.floor(Math.random() * msgs.length)];
          if(m && m.text) {
            const s = el('div', 'rizz-hub-loading__snippet', m.text);
            s.style.left = `${Math.random() * 60 + 10}%`;
            s.style.top = `${Math.random() * 60 + 20}%`;
            snippets.append(s);
            setTimeout(() => s.remove(), 2000);
          }
          await pause(300);
        }
      };
      void showSnippets();

      text.textContent = 'Crunching signals…';
      const peerKey = peerKeyFromPeerId(peerId);
      const incoming = msgs.filter((m) => !m.out).map((m) => m.text);
      const rel = getPeerRelationship(peerId);
      const relLabel = relationshipLabel(rel);
      const persona = computePersonaPack(peerKey, incoming, rel);
      const stats = await computeChatStats(peerKey, msgs, 50000);
      const heatmap = buildActivityHeatmap(msgs);
      const moments = pickKeyMoments(msgs, 20);

      text.textContent = 'Generating AI insights…';
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

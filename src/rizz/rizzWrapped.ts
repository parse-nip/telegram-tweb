import PopupElement from '@components/popups';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {avatarNew} from '@components/avatarNew';
import type {ChatStats, RizzMsgLite} from './stats';
import type {RelationshipDeepAnalysis} from './openrouter';
import type {ActivityHeatmap} from './rizzAnalysisHeatmap';
import type {KeyMoment} from './analysisKeyMoments';
import {formatAnalysisTimestamp} from './analysisKeyMoments';
import {relationshipLabel, type RizzPeerRelationship} from './peerRelationship';
import Button from '@components/button';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if(className) n.className = className;
  if(text !== undefined) n.textContent = text;
  return n;
}

export class PopupRizzWrapped extends PopupElement {
  private currentSlide = 0;
  private slides: HTMLElement[] = [];
  private progressBars: HTMLElement[] = [];
  private autoTimer?: number;
  private readonly SLIDE_DURATION = 6000;

  constructor(private data: {
    peerId: PeerId,
    peerName: string,
    msgs: RizzMsgLite[],
    stats: ChatStats,
    heatmap: ActivityHeatmap,
    llm: RelationshipDeepAnalysis | null,
    moments: KeyMoment[],
    relationship: RizzPeerRelationship
  }) {
    super('popup-rizz-wrapped', {
      body: true,
      closable: true,
      scrollable: false,
      withoutOverlay: true
    });

    this.element.classList.add('rizz-wrapped-standalone');
    this.header.remove();
    this.initSlides();
    this.renderSlide(0);
    this.startAutoAdvance();
  }

  private initSlides() {
    this.slides = [
      this.buildIntroSlide(),
      this.buildRelationshipSlide(),
      this.buildVolumeSlide(),
      this.buildTimingSlide(),
      this.buildPowerDynamicSlide(),
      this.buildTopicsSlide(),
      this.buildHighlightsSlide(),
      this.buildGlobalRankingSlide(),
      this.buildSummarySlide()
    ];

    const progressContainer = el('div', 'rizz-wrapped-progress');
    this.slides.forEach((_, i) => {
      const bar = el('div', 'rizz-wrapped-progress-bar');
      const fill = el('div', 'rizz-wrapped-progress-fill');
      bar.append(fill);
      this.progressBars.push(fill);
      progressContainer.append(bar);
    });

    const body = this.body!;
    body.append(progressContainer);

    const closeBtn = el('button', 'rizz-wrapped-close');
    closeBtn.innerHTML = '&times;';
    attachClickEvent(closeBtn, (e) => {
      e.stopPropagation();
      this.hide();
    });
    body.append(closeBtn);

    const slideContainer = el('div', 'rizz-wrapped-slide-container');
    this.slides.forEach((s) => {
      s.classList.add('rizz-wrapped-slide');
      slideContainer.append(s);
    });
    body.append(slideContainer);

    // Navigation overlays
    const leftNav = el('div', 'rizz-wrapped-nav rizz-wrapped-nav--left');
    const rightNav = el('div', 'rizz-wrapped-nav rizz-wrapped-nav--right');
    attachClickEvent(leftNav, () => this.prevSlide());
    attachClickEvent(rightNav, () => this.nextSlide());
    body.append(leftNav, rightNav);
  }

  private renderSlide(idx: number) {
    this.slides.forEach((s, i) => {
      s.classList.toggle('active', i === idx);
    });

    this.progressBars.forEach((p, i) => {
      p.style.width = i < idx ? '100%' : '0%';
      p.classList.toggle('animating', i === idx);
    });

    this.currentSlide = idx;
  }

  private nextSlide() {
    if(this.currentSlide < this.slides.length - 1) {
      this.renderSlide(this.currentSlide + 1);
      this.startAutoAdvance();
    } else {
      this.hide();
    }
  }

  private prevSlide() {
    if(this.currentSlide > 0) {
      this.renderSlide(this.currentSlide - 1);
      this.startAutoAdvance();
    }
  }

  private startAutoAdvance() {
    if(this.autoTimer) window.clearTimeout(this.autoTimer);
    this.autoTimer = window.setTimeout(() => this.nextSlide(), this.SLIDE_DURATION);
  }

  private buildIntroSlide() {
    const s = el('div', 'rizz-wrapped-slide--intro');
    const av = avatarNew({
      middleware: this.middlewareHelper.get(),
      peerId: this.data.peerId,
      size: 120,
      isDialog: true,
      class: 'dialog-avatar',
      withStories: false
    });
    const title = el('h1', 'rizz-wrapped-title', 'Let\'s get started!');
    const sub = el('p', 'rizz-wrapped-sub', `Your year with ${this.data.peerName}`);
    s.append(av.node, title, sub);
    return s;
  }

  private buildRelationshipSlide() {
    const s = el('div', 'rizz-wrapped-slide--rel');
    const title = el('h2', 'rizz-wrapped-title', 'What\'s your relationship?');
    const label = el('div', 'rizz-wrapped-rel-badge', relationshipLabel(this.data.relationship));
    s.append(title, label);
    return s;
  }

  private buildVolumeSlide() {
    const s = el('div', 'rizz-wrapped-slide--volume');
    const count = el('div', 'rizz-wrapped-big-number', String(this.data.stats.cappedMessages));
    const text = el('p', 'rizz-wrapped-text', 'messages exchanged');
    const sub = el('p', 'rizz-wrapped-sub', `That's about ${this.data.stats.totalWords} words!`);
    s.append(count, text, sub);
    return s;
  }

  private buildTimingSlide() {
    const s = el('div', 'rizz-wrapped-slide--timing');
    const title = el('h2', 'rizz-wrapped-title', 'Busiest times');
    const month = el('div', 'rizz-wrapped-highlight', this.data.stats.mostActiveMonth);
    const sub = el('p', 'rizz-wrapped-sub', 'was your peak month');
    s.append(title, month, sub);
    return s;
  }

  private buildPowerDynamicSlide() {
    const s = el('div', 'rizz-wrapped-slide--power');
    const title = el('h2', 'rizz-wrapped-title', 'Power Dynamic');
    const val = this.data.stats.powerDynamic;
    const desc = val > 20 ? 'Dominant' : (val < -20 ? 'Submissive' : 'Equal');
    const meter = el('div', 'rizz-wrapped-power-meter');
    const pointer = el('div', 'rizz-wrapped-power-pointer');
    pointer.style.left = `${((val + 100) / 200) * 100}%`;
    meter.append(pointer);
    const label = el('div', 'rizz-wrapped-power-label', desc);
    s.append(title, meter, label);
    return s;
  }

  private buildTopicsSlide() {
    const s = el('div', 'rizz-wrapped-slide--topics');
    const title = el('h2', 'rizz-wrapped-title', 'Common topics');
    const cloud = el('div', 'rizz-wrapped-topic-cloud');
    this.data.stats.topTopics.forEach((t) => {
      const chip = el('span', 'rizz-wrapped-topic-chip', t);
      cloud.append(chip);
    });
    s.append(title, cloud);
    return s;
  }

  private buildHighlightsSlide() {
    const s = el('div', 'rizz-wrapped-slide--highlights');
    const title = el('h2', 'rizz-wrapped-title', 'The highlights');
    const container = el('div', 'rizz-wrapped-moments');
    this.data.moments.slice(0, 3).forEach((m) => {
      const card = el('div', 'rizz-wrapped-moment-card');
      card.append(el('p', 'rizz-wrapped-moment-text', m.text));
      card.append(el('span', 'rizz-wrapped-moment-meta', formatAnalysisTimestamp(m.date)));
      container.append(card);
    });
    s.append(title, container);
    return s;
  }

  private buildGlobalRankingSlide() {
    const s = el('div', 'rizz-wrapped-slide--ranking');
    const circle = el('div', 'rizz-wrapped-rank-circle');
    circle.append(el('span', 'rizz-wrapped-rank-text', 'Top 1%'));
    const sub = el('p', 'rizz-wrapped-sub', 'of total messages sent');
    s.append(circle, sub);
    return s;
  }

  private buildSummarySlide() {
    const s = el('div', 'rizz-wrapped-slide--summary');
    const title = el('h2', 'rizz-wrapped-title', 'Your Summary');
    const pulse = el('div', 'rizz-wrapped-summary-pulse', this.data.llm?.interestPulse || 'Vibe: Solid');
    const bag = el('div', 'rizz-wrapped-summary-bag', `Bagging Proximity: ${this.data.llm?.baggingProximity ?? 50}%`);
    
    const done = Button('btn-primary btn-color-primary', {text: 'Close'});
    attachClickEvent(done, (e) => {
      e.stopPropagation();
      this.hide();
    });
    
    s.append(title, pulse, bag, done);
    return s;
  }

  public hide() {
    if(this.autoTimer) window.clearTimeout(this.autoTimer);
    super.hide();
  }
}

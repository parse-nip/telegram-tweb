import type Chat from '@components/chat/chat';
import {makeFullMid, type FullMid} from '@components/chat/bubbles';
import type {Message} from '@layer';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import ListenerSetter from '@helpers/listenerSetter';
import {Grade, formatGradeTitle, gradeIconBasename} from './grades';
import {getCached, setCached} from './gradeStore';
import {getCachedInsight} from './snapshotStore';
import {
  peerKeyFromPeerId,
  computeChatStats,
  formatOpeningLine,
  heuristicGambitWhenReady,
  heuristicOpeningName
} from './stats';
import {buildClassifyContext, collectRizzMessages, buildComposeContext} from './rizzHistory';
import {
  getSuggestionsEnabled,
  getGradesEnabled,
  getEvalBarEnabled,
  getOpenRouterKey
} from './settings';
import {isRizzMockAuthEnabled} from '@config/rizzMockAuth';
import {normalizeSuggestions, localGhostCompletions, pickGhostTail} from './context';
import {requestGhostSuggestions, classifyMessage, requestGambitReadiness} from './openrouter';
import {getLockedOpeningLabel, trySetLockedOpeningLabel} from './openingStore';

const BADGE_SIZE = 20;

/** Set `true` to show the starter suggestion chip strip above the composer; ghost text is unchanged. */
export const RIZZ_CHIPS_ENABLED = false;

function badgeTooltipText(grade: Grade, reason: string): string {
  if(grade === Grade.Resignation && !reason.trim()) return 'Wth are we doing here bro...';
  if(grade === Grade.Blunder && !reason.trim()) return 'Oof. We might need a rewrite.';
  if(grade === Grade.MissedWin && !reason.trim()) return 'Clear chance slipped. Ask sooner next time.';
  const title = formatGradeTitle(grade);
  return reason.trim() ? `${title}: ${reason}` : title;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resetDomBadges(container: HTMLElement) {
  container.querySelectorAll('.rizz-msg-badge').forEach((el) => el.remove());
}

function isOutgoingBubble(bubble: HTMLElement): boolean {
  return bubble.classList.contains('is-out') || bubble.classList.contains('is-outgoing');
}

/** Colored message box; `.bubble` is full-width so badges must not use it as the positioning parent. */
function getRizzBadgeAnchor(bubble: HTMLElement): HTMLElement {
  return bubble.querySelector<HTMLElement>('.bubble-content') ?? bubble;
}

function localFallbackGrade(text: string): { grade: Grade, reason: string } {
  const t = text.trim();
  const lower = t.toLowerCase();

  if(!t) {
    return {grade: Grade.Unknown, reason: ''};
  }

  if(/\b(date|coffee|drink|dinner|meet|hang out|hangout|this week)\b/i.test(lower)) {
    return {grade: Grade.GreatFind, reason: 'clear forward move'};
  }

  if(t.length <= 3) {
    return {grade: Grade.Mistake, reason: 'too short'};
  }

  if(/^(hey|hi|yo)\b/.test(lower) && lower.split(/\s+/).length <= 2) {
    return {grade: Grade.Inaccuracy, reason: 'generic opener'};
  }

  if(t.includes('?')) {
    return {grade: Grade.Good, reason: 'keeps conversation going'};
  }

  if(/\b(haha|lol|lmao)\b|[!]/i.test(lower)) {
    return {grade: Grade.Excellent, reason: 'playful energy'};
  }

  return {grade: Grade.Good, reason: 'solid line'};
}

export class RizzChatController {
  private readonly composerLockClass = 'rizz-no-compose-grow';
  private ls = new ListenerSetter();
  private stripEl: HTMLDivElement;
  private ghostEl: HTMLDivElement;
  private ghostTail = '';
  private ghostBase = '';
  private ghostReq = 0;
  private evalLayer: HTMLDivElement;
  private evalFill: HTMLDivElement;
  private topSummaryStack: HTMLDivElement;
  private openingSummaryEl: HTMLDivElement;
  private insightStripEl: HTMLDivElement;
  private practiceLayer: HTMLDivElement;
  private io: IntersectionObserver | null = null;
  private pendingMids = new Set<string>();
  private flushTimer: number | null = null;
  private inflight = new Set<string>();
  private mutationObserver: MutationObserver | null = null;
  /** Restore after destroy; chain to reset composer height after each send. */
  private prevOnMessageSent2: (() => void) | undefined;
  /** Avoid re-calling gambit readiness on every scroll when history tail is unchanged. */
  private openingDecisionCache:
    | {peerKey: string, mid: number, result: {ready: boolean, gambit?: string}}
    | null = null;

  constructor(private readonly chat: Chat) { }

  /** Strip + ghost composer UI — any Rizz feature on (not only “suggestions” toggle). */
  private isRizzComposerEnabled(): boolean {
    return getSuggestionsEnabled() || getGradesEnabled() || getEvalBarEnabled() || isRizzMockAuthEnabled();
  }

  private isGradesOn(): boolean {
    return getGradesEnabled() || isRizzMockAuthEnabled();
  }

  private isEvalOn(): boolean {
    return getEvalBarEnabled();
  }

  public attach() {
    const {chat} = this;
    chat.input.rowsWrapper.classList.add(this.composerLockClass);
    queueMicrotask(() => {
      chat.input.messageInputField?.onFakeInput(undefined, true);
    });

    this.stripEl = document.createElement('div');
    this.stripEl.className = 'rizz-suggestions-strip hide';

    this.ghostEl = document.createElement('div');
    this.ghostEl.className = 'rizz-ghost-inline hide';

    this.evalLayer = document.createElement('div');
    this.evalLayer.className = 'rizz-eval-bar-layer hide';
    this.evalFill = document.createElement('div');
    this.evalFill.className = 'rizz-eval-bar-fill';
    this.evalLayer.append(this.evalFill);

    this.topSummaryStack = document.createElement('div');
    this.topSummaryStack.className = 'rizz-top-summary-stack';

    this.openingSummaryEl = document.createElement('div');
    this.openingSummaryEl.className = 'rizz-opening-summary-lines hide';

    this.insightStripEl = document.createElement('div');
    this.insightStripEl.className = 'rizz-insight-strip hide';

    this.topSummaryStack.append(this.openingSummaryEl, this.insightStripEl);

    this.practiceLayer = document.createElement('div');
    this.practiceLayer.className = 'rizz-practice-transcript hide';

    const rows = chat.input.rowsWrapper;
    const nm = rows.querySelector('.new-message-wrapper');
    if(nm) {
      rows.insertBefore(this.stripEl, nm);
    } else {
      rows.prepend(this.stripEl);
    }
    if(nm) {
      const inputContainer = nm.querySelector('.input-message-container');
      if(inputContainer) {
        inputContainer.prepend(this.ghostEl);
      } else {
        rows.insertBefore(this.ghostEl, nm);
      }
    }

    /* After scrollable + floating separators (same as before) — keep z-index off so overlays cannot
       stack above the whole bubble layer; see .rizz-opening-summary-lines max-height in SCSS. */
    chat.bubbles.container.append(this.topSummaryStack, this.evalLayer, this.practiceLayer);

    this.ls.add(chat.input.messageInput)('input', () => {
      this.onDraftInputImmediate();
    });

    this.ls.add(chat.input.messageInput)('keydown', (e) => {
      if(e.key === 'Tab' && this.ghostTail && this.ghostBase !== '') {
        const {value, caretPos} = getRichValueWithCaret(chat.input.messageInput, true, true);
        const prefix = caretPos >= 0 ? value.slice(0, caretPos) : value;
        if(prefix === this.ghostBase) {
          e.preventDefault();
          const suffix = caretPos >= 0 ? value.slice(caretPos) : '';
          chat.input.messageInput.textContent = prefix + this.ghostTail + suffix;
          /* noAnimation: avoid animating from stale height; onFakeInput now syncs fake before measure */
          chat.input.messageInputField.onFakeInput(undefined, true);
          this.clearGhost();
        }
      }
    });

    this.ls.add(document)('selectionchange', () => {
      if(!this.ghostTail) return;
      const sel = window.getSelection();
      if(!sel?.rangeCount) return;
      const r = sel.getRangeAt(0);
      if(!chat.input.messageInput.contains(r.commonAncestorContainer)) return;
      requestAnimationFrame(() => this.positionGhostTail());
    });

    this.ls.add(chat.input.messageInput)('scroll', () => {
      if(!this.ghostTail) return;
      this.positionGhostTail();
    });

    this.io = new IntersectionObserver(
      (entries) => {
        for(const e of entries) {
          if(!e.isIntersecting) continue;
          const bubble = e.target as HTMLElement;
          if(!bubble.classList.contains('bubble')) continue;
          this.queueBubbleForClassify(bubble);
        }
        this.scheduleFlush();
      },
      {root: chat.bubbles.scrollable.container, threshold: 0.01}
    );

    this.ls.add(chat.appImManager)('peer_changing', (c) => {
      if(c === chat) {
        resetDomBadges(chat.bubbles.container);
        this.clearPracticeTranscript();
        this.openingDecisionCache = null;
        this.insightStripEl.classList.add('hide');
        this.insightStripEl.innerHTML = '';
        queueMicrotask(() => this.onDraftInputImmediate());
      }
    });

    this.ls.add(chat.input.messageInput)('focus', () => {
      queueMicrotask(() => this.onDraftInputImmediate());
    });

    this.ls.add(chat.bubbles.scrollable.container)('scroll', () => {
      this.refreshEvalAndSummary();
      this.observeBubbles();
      this.scheduleFlush();
    });

    this.mutationObserver = new MutationObserver(() => this.observeBubbles());
    this.mutationObserver.observe(chat.bubbles.chatInner, {childList: true, subtree: true});
    this.observeBubbles();

    this.prevOnMessageSent2 = chat.input.onMessageSent2;
    chat.input.onMessageSent2 = () => {
      try {
        this.prevOnMessageSent2?.();
      } catch{
        /* ignore */
      }
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          this.clampEmptyComposerHeight();
          this.onDraftInputImmediate();
        });
      });
    };

    this.refreshEvalAndSummary();
    this.refreshInsightStripFromCache();
    this.onDraftInputImmediate();
  }

  public refreshInsightStripFromCache() {
    const chat = this.chat;
    const msgs = collectRizzMessages(chat, 1200);
    const peerKey = peerKeyFromPeerId(chat.peerId);
    const lastMid = msgs.length ? msgs[msgs.length - 1].mid : 0;
    const c = getCachedInsight(peerKey, lastMid);
    if(!c?.whereWeAre?.trim()) {
      this.insightStripEl.classList.add('hide');
      this.insightStripEl.innerHTML = '';
      return;
    }
    const line = c.whereWeAre.length > 140 ? c.whereWeAre.slice(0, 137) + '...' : c.whereWeAre;
    this.insightStripEl.innerHTML =
      `<div class="rizz-summary-line rizz-insight-line"><span class="rizz-summary-service">${escapeHtml(line)}</span></div>`;
    this.insightStripEl.classList.remove('hide');
  }

  /** After send/clear, InputField height can stay stuck; re-measure when field is empty. */
  private clampEmptyComposerHeight() {
    const {chat} = this;
    const input = chat.input.messageInput;
    const {value} = getRichValueWithCaret(input, true, false);
    if(value.trim()) return;
    input.scrollTop = 0;
    input.style.height = '';
    chat.input.messageInputField.onFakeInput(false, true);
  }

  private observeBubbles() {
    const roots = this.chat.bubbles.chatInner.querySelectorAll<HTMLElement>('.bubble');
    roots.forEach((bubble) => {
      if(!bubble.dataset.mid) return;
      this.io?.observe(bubble);
      this.queueBubbleForClassify(bubble);
    });
  }

  private queueBubbleForClassify(bubble: HTMLElement) {
    if(!isOutgoingBubble(bubble)) return;
    const text = this.getBubbleText(bubble);
    if(!text) return;
    const mid = +(bubble.dataset.mid || '');
    if(!Number.isFinite(mid) || !mid) return;
    this.pendingMids.add(makeFullMid(this.chat.peerId, mid));
  }

  private scheduleFlush() {
    if(this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flushClassify();
    }, 50);
  }

  private async flushClassify() {
    if(!this.isGradesOn()) return;
    const batch = [...this.pendingMids].slice(0, 12);
    batch.forEach((id) => this.pendingMids.delete(id));
    await Promise.all(batch.map((fm) => this.classifyOne(fm)));
    if(this.pendingMids.size) this.scheduleFlush();
  }

  private getBubbleText(bubble: HTMLElement): string {
    const messageEl = bubble.querySelector<HTMLElement>('.message');
    if(!messageEl) return '';
    return (messageEl.innerText || messageEl.textContent || '').trim();
  }

  private async classifyOne(fullMid: string) {
    if(this.inflight.has(fullMid)) return;
    const {chat} = this;
    const bubble = chat.bubbles.getBubble(fullMid as FullMid);
    if(!bubble || !isOutgoingBubble(bubble)) return;

    const msg = chat.getMessage(fullMid as FullMid);
    let text = '';
    let mid = 0;
    if(msg && msg._ === 'message') {
      const m = msg as Message.message;
      text = (m.message || '').trim();
      mid = m.mid;
    }

    if(!text) {
      text = this.getBubbleText(bubble);
      mid = mid || +(bubble.dataset.mid || '');
    }

    if(!text) return;
    const peerKey = peerKeyFromPeerId(chat.peerId);
    const cached = mid ? await getCached(peerKey, mid, text) : undefined;
    if(cached) {
      this.applyBadge(fullMid, cached.grade, cached.reason);
      return;
    }

    if(!getOpenRouterKey().trim()) {
      const fallback = localFallbackGrade(text);
      if(mid) {
        await setCached(peerKey, mid, text, fallback.grade, fallback.reason);
      }
      this.applyBadge(fullMid, fallback.grade, fallback.reason);
      return;
    }

    this.inflight.add(fullMid);
    try {
      const ctx = mid ? buildClassifyContext(chat, mid, text) : buildComposeContext(chat, text);
      const {grade, reason} = await classifyMessage(ctx, text);
      if(mid) {
        await setCached(peerKey, mid, text, grade, reason);
      }
      this.applyBadge(fullMid, grade, reason);
    } catch{
      const fallback = localFallbackGrade(text);
      if(mid) {
        await setCached(peerKey, mid, text, fallback.grade, fallback.reason);
      }
      this.applyBadge(fullMid, fallback.grade, fallback.reason);
    } finally {
      this.inflight.delete(fullMid);
    }
  }

  private applyBadge(fullMid: string, grade: Grade, reason: string) {
    const bubble = this.chat.bubbles.getBubble(fullMid);
    if(!bubble) return;
    const anchor = getRizzBadgeAnchor(bubble);
    let badge = bubble.querySelector<HTMLElement>('.rizz-msg-badge');
    if(!badge) {
      badge = document.createElement('div');
      badge.className = 'rizz-msg-badge';
      anchor.appendChild(badge);
    } else if(badge.parentElement !== anchor) {
      anchor.appendChild(badge);
    }
    if(getComputedStyle(anchor).position === 'static') {
      anchor.style.position = 'relative';
    }
    const icon = gradeIconBasename(grade);
    badge.innerHTML = '';
    if(icon) {
      const img = document.createElement('img');
      img.alt = formatGradeTitle(grade);
      img.width = BADGE_SIZE;
      img.height = BADGE_SIZE;
      img.src = `/rizz/icons/${icon}.svg`;
      badge.appendChild(img);
    } else {
      badge.textContent = '?';
    }
    badge.style.top = '-6px';
    if(isOutgoingBubble(bubble)) {
      badge.style.setProperty('inset-inline-start', '-6px');
      badge.style.removeProperty('inset-inline-end');
    } else {
      badge.style.setProperty('inset-inline-end', '-6px');
      badge.style.removeProperty('inset-inline-start');
    }
    badge.title = badgeTooltipText(grade, reason);
  }

  private onDraftInputImmediate() {
    this.ghostReq++;
    if(!this.isRizzComposerEnabled()) {
      this.stripEl.classList.add('hide');
      this.clearGhost();
      return;
    }
    const {chat} = this;
    const {value, caretPos} = getRichValueWithCaret(chat.input.messageInput, true, true);
    const draft = value.trim();
    if(!draft) {
      this.clearGhost();
      chat.input.messageInput.scrollTop = 0;
      chat.input.messageInputField.onFakeInput(false, true);
      if(RIZZ_CHIPS_ENABLED) {
        const lines = normalizeSuggestions([], '');
        this.renderChips(lines);
      } else {
        this.stripEl.classList.add('hide');
        this.stripEl.innerHTML = '';
      }
      return;
    }

    this.stripEl.classList.add('hide');
    this.stripEl.innerHTML = '';

    if(this.shouldGhost(value)) {
      void this.requestGhostPath(value, caretPos);
    } else {
      this.clearGhost();
    }
  }

  /** If attach ran before `.new-message-wrapper` existed, strip stayed detached — fix before paint. */
  private ensureStripInDom() {
    if(this.stripEl.isConnected) return;
    const rows = this.chat.input.rowsWrapper;
    const nm = rows.querySelector('.new-message-wrapper');
    if(nm) {
      rows.insertBefore(this.stripEl, nm);
    } else {
      rows.prepend(this.stripEl);
    }
  }

  private shouldGhost(value: string): boolean {
    if(!value.trim()) return false;
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount) return false;
    const r = sel.getRangeAt(0);
    if(!r.collapsed) return false;
    const input = this.chat.input.messageInput;
    return r.endContainer === input || input.contains(r.endContainer);
  }

  /** Place tail at the real caret — duplicate prefix in a span never matches rich text width. */
  private positionGhostTail() {
    const tail = this.ghostEl.querySelector<HTMLElement>('.rizz-ghost-inline-tail');
    if(!tail || this.ghostEl.classList.contains('hide')) return;
    const input = this.chat.input.messageInput;
    const sel = window.getSelection();
    if(!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    if(!input.contains(range.commonAncestorContainer) || !range.collapsed) return;

    let rect = range.getBoundingClientRect();
    if(rect.height < 2) {
      const rects = range.getClientRects();
      if(rects.length) rect = rects[rects.length - 1];
    }
    const ghostRect = this.ghostEl.getBoundingClientRect();
    tail.style.position = 'absolute';
    tail.style.left = `${rect.left - ghostRect.left}px`;
    tail.style.top = `${rect.top - ghostRect.top}px`;
    tail.style.whiteSpace = 'pre';
    tail.style.maxWidth = `${Math.max(0, ghostRect.right - rect.left)}px`;
  }

  private async requestGhostPath(draft: string, caretPos: number) {
    const req = this.ghostReq;
    const prefix = caretPos >= 0 ? draft.slice(0, caretPos) : draft;
    this.ghostBase = prefix;
    const {chat} = this;
    let lines: string[] = [];
    if(getOpenRouterKey().trim()) {
      try {
        const ctx = buildComposeContext(chat, draft);
        lines = await requestGhostSuggestions(ctx, draft);
      } catch{
        lines = localGhostCompletions(draft);
      }
    } else {
      lines = localGhostCompletions(draft);
    }
    if(req !== this.ghostReq) return;
    let tail = pickGhostTail(prefix, lines);
    if(!tail) {
      for(const l of localGhostCompletions(draft)) {
        tail = pickGhostTail(prefix, [l]);
        if(tail) break;
      }
    }
    this.ghostTail = tail || '';
    if(this.ghostTail) {
      this.ghostEl.innerHTML = '';
      const tailEl = document.createElement('span');
      tailEl.className = 'rizz-ghost-inline-tail';
      tailEl.textContent = this.ghostTail;
      this.ghostEl.append(tailEl);
      this.ghostEl.classList.remove('hide');
      requestAnimationFrame(() => {
        this.positionGhostTail();
        requestAnimationFrame(() => this.positionGhostTail());
      });
    } else {
      this.ghostEl.classList.add('hide');
    }
  }

  private clearGhost() {
    this.ghostTail = '';
    this.ghostBase = '';
    this.ghostEl.textContent = '';
    this.ghostEl.classList.add('hide');
  }

  private renderChips(lines: string[]) {
    if(!RIZZ_CHIPS_ENABLED) {
      this.stripEl.classList.add('hide');
      this.stripEl.innerHTML = '';
      return;
    }

    this.ensureStripInDom();

    if(!lines.length) {
      this.stripEl.innerHTML = '';
      this.stripEl.classList.add('hide');
      return;
    }

    this.stripEl.innerHTML = '';
    this.stripEl.classList.remove('hide');
    for(const line of lines.slice(0, 3)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rizz-suggestion-chip';
      b.textContent = line;
      b.addEventListener('click', () => {
        this.chat.input.messageInput.textContent = line;
        this.chat.input.messageInputField.onFakeInput(undefined, true);
      });
      this.stripEl.appendChild(b);
    }
  }

  public appendPracticeLine(who: 'you' | 'them', text: string) {
    this.practiceLayer.classList.remove('hide');
    const row = document.createElement('div');
    row.className = `rizz-practice-row rizz-practice-${who}`;
    row.textContent = (who === 'you' ? 'You: ' : 'Them: ') + text;
    this.practiceLayer.append(row);
    this.practiceLayer.scrollTop = this.practiceLayer.scrollHeight;
  }

  public clearPracticeTranscript() {
    this.practiceLayer.innerHTML = '';
    this.practiceLayer.classList.add('hide');
  }

  public refreshEvalAndSummary() {
    const chat = this.chat;
    if(!this.isGradesOn()) {
      this.openingSummaryEl.classList.add('hide');
      this.evalLayer.classList.add('hide');
      this.refreshInsightStripFromCache();
      return;
    }
    if(!this.isEvalOn()) {
      this.evalLayer.classList.add('hide');
    }
    void (async() => {
      const msgs = collectRizzMessages(chat, 1200);
      const peerKey = peerKeyFromPeerId(chat.peerId);
      const stats = await computeChatStats(peerKey, msgs, 1200);
      const ctx = buildComposeContext(chat, '');
      const maxMid = msgs.length ? msgs[msgs.length - 1].mid : 0;
      let openingLine1: string | undefined;
      let omitOpeningLine = false;

      const locked = getLockedOpeningLabel(peerKey);
      if(locked) {
        openingLine1 = locked;
      } else {
        let result: {ready: boolean, gambit?: string};
        if(
          this.openingDecisionCache?.peerKey === peerKey &&
          this.openingDecisionCache.mid === maxMid
        ) {
          result = this.openingDecisionCache.result;
        } else {
          const h = heuristicOpeningName(msgs);
          if(getOpenRouterKey().trim()) {
            const ai = await requestGambitReadiness(ctx, h);
            result = ai ?? {ready: false};
          } else {
            result = heuristicGambitWhenReady(msgs);
          }
          this.openingDecisionCache = {peerKey, mid: maxMid, result};
        }

        if(result.ready) {
          let gambit = (result.gambit || '').trim() || heuristicOpeningName(msgs);
          gambit = gambit.replace(/^opening\s*[·.:]\s*/i, '').trim();
          const display = `Opening · ${gambit}`;
          if(!trySetLockedOpeningLabel(peerKey, display)) {
            openingLine1 = getLockedOpeningLabel(peerKey) || display;
          } else {
            openingLine1 = display;
          }
        } else {
          omitOpeningLine = true;
        }
      }

      const line1 = formatOpeningLine(stats, omitOpeningLine ?
        {omitOpeningLine: true} :
        {openingLine1: openingLine1});
      if(line1 !== null) {
        this.openingSummaryEl.innerHTML =
          `<div class="rizz-summary-line"><span class="rizz-summary-service">${escapeHtml(line1)}</span></div>`;
        this.openingSummaryEl.classList.remove('hide');
      } else {
        this.openingSummaryEl.innerHTML = '';
        this.openingSummaryEl.classList.add('hide');
      }

      if(this.isEvalOn()) {
        this.evalLayer.classList.remove('hide');
        this.evalFill.style.height = `${stats.evalScore}%`;
      } else {
        this.evalLayer.classList.add('hide');
      }
      this.refreshInsightStripFromCache();
    })();
  }

  public destroy() {
    this.ls.removeAll();
    this.io?.disconnect();
    this.mutationObserver?.disconnect();
    this.chat.input.onMessageSent2 = this.prevOnMessageSent2;
    this.prevOnMessageSent2 = undefined;
    this.chat.input.rowsWrapper.classList.remove(this.composerLockClass);
    this.stripEl?.remove();
    this.ghostEl?.remove();
    this.evalLayer?.remove();
    this.topSummaryStack?.remove();
    this.practiceLayer?.remove();
  }
}

const weak = new WeakMap<Chat, RizzChatController>();

export function attachRizzToChat(chat: Chat) {
  if(weak.has(chat)) return;
  const c = new RizzChatController(chat);
  weak.set(chat, c);
  c.attach();
}

export function destroyRizzForChat(chat: Chat) {
  weak.get(chat)?.destroy();
  weak.delete(chat);
}

export function getRizzController(chat: Chat): RizzChatController | undefined {
  return weak.get(chat);
}

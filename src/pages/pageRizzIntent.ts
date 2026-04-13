/*
 * Post-login intent: main messenger (“Texting theory”) vs full-page Rizz Analytics app.
 * Full-viewport Telegram gradient + default pattern.
 */

import Page from '@/pages/page';
import Button from '@components/button';
import sessionStorage from '@lib/sessionStorage';
import type {CancellablePromise} from '@helpers/cancellablePromise';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ChatBackgroundPatternRenderer from '@components/chat/patternRenderer';
import {mountRizzAnalyticsBackdrop} from '@/rizz/rizzAnalyticsBackdrop';

let intentCompleteDeferred: CancellablePromise<void> | undefined;
let backdropCleanup: (() => void) | undefined;

const RIZZ_ONBOARDING = 'rizz-intent-onboarding';

/** Same pattern as `rizzChatIntegration` badge icons (`/rizz/icons/*.svg`). */
const RIZZ_ICONS_BASE = '/rizz/icons/';

function mkRizzIconImg(basename: string) {
  const img = document.createElement('img');
  img.className = 'rizz-intent-btn__svg-img';
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.src = `${RIZZ_ICONS_BASE}${basename}.svg`;
  return img;
}

/**
 * Call before `mount()` when the intent flow should continue the app (signed-in path).
 * Standalone preview should still call this with a deferred so `await deferred` resolves after a choice.
 */
export function registerIntentComplete(deferred: CancellablePromise<void>) {
  intentCompleteDeferred = deferred;
}

function mountBackdrop() {
  const backdrop = document.createElement('div');
  backdrop.className = 'rizz-intent-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  const gradient = document.createElement('div');
  gradient.className = 'rizz-intent-backdrop__gradient';

  const patternWrap = document.createElement('div');
  patternWrap.className = 'rizz-intent-backdrop__pattern-wrap';

  backdrop.append(gradient, patternWrap);

  const authPages = document.getElementById('auth-pages');
  if(authPages?.parentNode) {
    authPages.parentNode.insertBefore(backdrop, authPages);
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  const patternRenderer = ChatBackgroundPatternRenderer.getInstance({
    element: patternWrap,
    url: 'assets/img/pattern.svg',
    width: w,
    height: h
  });
  const patternCanvas = patternRenderer.createCanvas();
  patternCanvas.classList.add('rizz-intent-pattern-canvas', 'blend');
  void patternRenderer.renderToCanvas(patternCanvas);
  patternWrap.append(patternCanvas);

  const onResize = () => {
    void patternRenderer.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  backdropCleanup = () => {
    window.removeEventListener('resize', onResize);
    patternRenderer.cleanup(patternCanvas);
    backdrop.remove();
  };
}

function finishIntent(choice: 'theory' | 'analysis') {
  sessionStorage.set({
    rizz_intent_done: true,
    rizz_intent_choice: choice
  });

  /* Analysis: paint the same Telegram-style wallpaper on `#page-rizz-analytics` *before* removing the intent backdrop so the transition never flashes white. */
  if(choice === 'analysis') {
    const pageEl = document.getElementById('page-rizz-analytics');
    const chats = document.getElementById('page-chats');
    if(pageEl) {
      mountRizzAnalyticsBackdrop(pageEl);
      pageEl.style.display = 'flex';
      document.body.classList.add('rizz-analytics-app');
      if(chats) chats.style.display = 'none';
    }
  }

  backdropCleanup?.();
  backdropCleanup = undefined;
  document.body.classList.remove(RIZZ_ONBOARDING);
  document.getElementById('auth-pages')?.classList.remove(RIZZ_ONBOARDING);
  intentCompleteDeferred?.resolve();
}

const onFirstMount = () => {
  document.body.classList.add(RIZZ_ONBOARDING);
  document.getElementById('auth-pages')?.classList.add(RIZZ_ONBOARDING);
  mountBackdrop();

  const container = page.pageEl.querySelector('.container') as HTMLDivElement;

  const inner = document.createElement('div');
  inner.className = 'rizz-intent-inner';

  const title = document.createElement('h4');
  title.className = 'rizz-intent-title text-center';
  title.textContent = 'What are you here for?';

  const actions = document.createElement('div');
  actions.className = 'rizz-intent-actions';

  const mkBtn = (label: string, choice: 'theory' | 'analysis') => {
    const btn = Button('btn-primary btn-rizz-intent-cta', {});
    const row = document.createElement('span');
    row.className = 'rizz-intent-btn__row';

    if(choice === 'theory') {
      const wrap = document.createElement('span');
      wrap.className = 'rizz-intent-btn__icons';
      wrap.append(mkRizzIconImg('free_piece'), mkRizzIconImg('excellent'));
      row.append(wrap);
    } else {
      row.append(mkRizzIconImg('chart'));
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'rizz-intent-btn__label';
    labelSpan.textContent = label;
    row.append(labelSpan);

    btn.append(row);
    attachClickEvent(btn, () => finishIntent(choice));
    return btn;
  };

  actions.append(
    mkBtn('Texting theory', 'theory'),
    mkBtn('Rizz Analytics', 'analysis')
  );

  inner.append(title, actions);
  container.append(inner);
};

const page = new Page('page-rizzIntent', true, onFirstMount);
export default page;

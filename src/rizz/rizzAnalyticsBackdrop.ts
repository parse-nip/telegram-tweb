/** Same gradient + doodle pattern as the Rizz intent screen (`pageRizzIntent`). */
import ChatBackgroundPatternRenderer from '@components/chat/patternRenderer';

const BACKDROP_CLASS = 'rizz-analytics-app-backdrop';

let backdropCleanup: (() => void) | undefined;

export function mountRizzAnalyticsBackdrop(pageEl: HTMLElement) {
  if(pageEl.querySelector(`.${BACKDROP_CLASS}`)) {
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.className = BACKDROP_CLASS;
  backdrop.setAttribute('aria-hidden', 'true');

  const gradient = document.createElement('div');
  gradient.className = 'rizz-intent-backdrop__gradient';

  const patternWrap = document.createElement('div');
  patternWrap.className = 'rizz-intent-backdrop__pattern-wrap';

  backdrop.append(gradient, patternWrap);
  pageEl.prepend(backdrop);

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
    backdropCleanup = undefined;
  };
}

export function unmountRizzAnalyticsBackdrop() {
  backdropCleanup?.();
}

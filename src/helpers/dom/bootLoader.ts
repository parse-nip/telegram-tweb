/*
 * TelegramRizz — first-paint boot overlay (status + progress bar).
 * HTML lives in index.html; styles in partials/_appBoot.scss + critical inline in index.html.
 * Logo “liquid” fill: SVG mask #boot-logo-ink-mask, path updated here (sine surface + optional motion).
 */

const ROOT_ID = 'app-boot-loader';
const BAR_ID = 'app-boot-bar';
const TEXT_ID = 'app-boot-text';
const MASK_PATH_ID = 'boot-logo-mask-wave';

const LIQUID_W = 160;
const LIQUID_H = 160;
const LIQUID_AMP = 3;
const LIQUID_WAVES = 3.5;
const LIQUID_STEPS = 36;
const LIQUID_PHASE_STEP = 0.042;

/** Target progress from setBootProgress (0–1). */
let targetBootRatio = 0;
/** Smoothed progress used for the liquid mask + bar so fill does not jump between steps. */
let displayBootRatio = 0;
let liquidWavePhase = 0;
let liquidWaveRaf = 0;
let lastLiquidFrameTime = 0;
let syncedDisplayFromDom = false;

/** Seconds to close ~half the gap to target (exponential smoothing). */
const DISPLAY_RATIO_HALFLIFE_SEC = 0.16;

function buildBootLiquidMaskPath(ratio: number, phase: number): string {
  const W = LIQUID_W;
  const H = LIQUID_H;
  if(ratio <= 0.001) {
    return `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`;
  }
  if(ratio >= 0.999) {
    return 'M 0 0 Z';
  }
  const baseY = H * (1 - ratio);
  const yAt = (x: number) => baseY + LIQUID_AMP * Math.sin((x / W) * Math.PI * 2 * LIQUID_WAVES + phase);
  let d = `M 0 0 L ${W} 0 L ${W} ${yAt(W)}`;
  for(let i = LIQUID_STEPS - 1; i >= 0; i--) {
    const x = (W * i) / LIQUID_STEPS;
    d += ` L ${x} ${yAt(x)}`;
  }
  d += ` L 0 0 Z`;
  return d;
}

function applyBootLiquidMask(ratio: number, phase: number) {
  const pathEl = document.getElementById(MASK_PATH_ID);
  if(!pathEl || !(pathEl instanceof SVGPathElement)) return;
  pathEl.setAttribute('d', buildBootLiquidMaskPath(ratio, phase));
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function stepDisplayBootRatio(dt: number) {
  const diff = targetBootRatio - displayBootRatio;
  if(Math.abs(diff) < 1e-5) {
    displayBootRatio = targetBootRatio;
    return;
  }
  const alpha = 1 - Math.exp(-(Math.LN2 / DISPLAY_RATIO_HALFLIFE_SEC) * dt);
  displayBootRatio += diff * alpha;
  if(Math.abs(targetBootRatio - displayBootRatio) < 1e-4) {
    displayBootRatio = targetBootRatio;
  }
}

function applyBootProgressToDom(ratio: number) {
  const root = document.getElementById(ROOT_ID);
  if(root) {
    root.style.setProperty('--boot-progress', String(ratio));
    root.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }
  const el = document.getElementById(BAR_ID);
  if(el) {
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    el.style.width = pct + '%';
  }
}

function bootLiquidWaveFrame(now: number) {
  const root = document.getElementById(ROOT_ID);
  if(!root || root.classList.contains('app-boot-loader--hide')) {
    liquidWaveRaf = 0;
    lastLiquidFrameTime = 0;
    return;
  }
  if(prefersReducedMotion()) {
    liquidWaveRaf = 0;
    lastLiquidFrameTime = 0;
    return;
  }
  const rawDt = lastLiquidFrameTime ? (now - lastLiquidFrameTime) / 1000 : 0;
  lastLiquidFrameTime = now;
  const dt = Math.min(0.064, rawDt > 0 ? rawDt : 1 / 60);
  stepDisplayBootRatio(dt);
  applyBootProgressToDom(displayBootRatio);
  liquidWavePhase += LIQUID_PHASE_STEP;
  applyBootLiquidMask(displayBootRatio, liquidWavePhase);
  liquidWaveRaf = window.requestAnimationFrame(bootLiquidWaveFrame);
}

function ensureBootLiquidWaveLoop() {
  if(liquidWaveRaf || prefersReducedMotion()) return;
  const root = document.getElementById(ROOT_ID);
  if(!root) return;
  liquidWaveRaf = window.requestAnimationFrame(bootLiquidWaveFrame);
}

function stopBootLiquidWaveLoop() {
  if(liquidWaveRaf) {
    window.cancelAnimationFrame(liquidWaveRaf);
    liquidWaveRaf = 0;
  }
  lastLiquidFrameTime = 0;
}

export function setBootStatus(message: string) {
  const el = document.getElementById(TEXT_ID);
  if(el) el.textContent = message;
}

export function setBootProgress(ratio: number) {
  const r = Math.max(0, Math.min(1, ratio));
  targetBootRatio = r;

  const root = document.getElementById(ROOT_ID);
  if(!syncedDisplayFromDom && root) {
    const raw = root.style.getPropertyValue('--boot-progress').trim() ||
      getComputedStyle(root).getPropertyValue('--boot-progress').trim();
    const parsed = parseFloat(raw);
    if(!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      displayBootRatio = parsed;
    }
    syncedDisplayFromDom = true;
  }

  if(prefersReducedMotion()) {
    liquidWavePhase = 0;
    displayBootRatio = r;
    applyBootProgressToDom(displayBootRatio);
    applyBootLiquidMask(displayBootRatio, 0);
    return;
  }

  ensureBootLiquidWaveLoop();
  if(!liquidWaveRaf) {
    applyBootProgressToDom(displayBootRatio);
    applyBootLiquidMask(displayBootRatio, liquidWavePhase);
  }
}

export function hideBootLoader() {
  stopBootLiquidWaveLoop();
  const root = document.getElementById(ROOT_ID);
  if(!root || root.classList.contains('app-boot-loader--hide')) return;
  root.classList.add('app-boot-loader--hide');
  root.setAttribute('aria-busy', 'false');
  window.setTimeout(() => {
    root.remove();
  }, 320);
}

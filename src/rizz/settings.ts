/** Keys mirror `rizz_common.h` / handoff §21 */

export const RIZZ_KEYS = {
  openRouterKey: 'rizz-openrouter-key',
  openRouterModel: 'rizz-openrouter-model',
  openRouterSuggestModel: 'rizz-openrouter-suggest-model',
  suggestionsEnabled: 'rizz-suggestions-enabled',
  gradesEnabled: 'rizz-grades-enabled',
  evalBarEnabled: 'rizz-eval-bar-enabled',
  practiceModeEnabled: 'rizz-practice-mode-enabled',
  practiceDifficulty: 'rizz-practice-difficulty'
} as const;

/** Built-in OpenRouter key (client-visible in bundle); override via Rizz settings. */
const RIZZ_DEFAULT_OPENROUTER_KEY =
  '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';

/** Default classify + ghost models when localStorage not set (OpenRouter free tier). */
export const RIZZ_DEFAULT_MODEL = 'openai/gpt-oss-120b:free';

function readBool(key: string, defaultVal: boolean): boolean {
  const v = localStorage.getItem(key);
  if(v === null) return defaultVal;
  return v === '1' || v === 'true';
}

function writeBool(key: string, value: boolean) {
  localStorage.setItem(key, value ? '1' : '0');
}

/** User override only; empty if using built-in default key. */
export function getStoredOpenRouterKey(): string {
  return localStorage.getItem(RIZZ_KEYS.openRouterKey) ?? '';
}

/** Effective key for API calls: override or built-in default. */
export function getOpenRouterKey(): string {
  const s = getStoredOpenRouterKey().trim();
  return s || RIZZ_DEFAULT_OPENROUTER_KEY;
}

export function setOpenRouterKey(key: string) {
  if(!key.trim()) {
    localStorage.removeItem(RIZZ_KEYS.openRouterKey);
  } else {
    localStorage.setItem(RIZZ_KEYS.openRouterKey, key);
  }
}

export function getStoredModel(): string {
  return localStorage.getItem(RIZZ_KEYS.openRouterModel) ?? '';
}

export function getStoredSuggestModel(): string {
  return localStorage.getItem(RIZZ_KEYS.openRouterSuggestModel) ?? '';
}

export function getModel(): string {
  return getStoredModel().trim() || RIZZ_DEFAULT_MODEL;
}

export function getSuggestModel(): string {
  return getStoredSuggestModel().trim() || RIZZ_DEFAULT_MODEL;
}

export function getSuggestionsEnabled(): boolean {
  return readBool(RIZZ_KEYS.suggestionsEnabled, true);
}

export function getGradesEnabled(): boolean {
  return readBool(RIZZ_KEYS.gradesEnabled, true);
}

export function getEvalBarEnabled(): boolean {
  return readBool(RIZZ_KEYS.evalBarEnabled, true);
}

export function getPracticeModeEnabled(): boolean {
  return readBool(RIZZ_KEYS.practiceModeEnabled, false);
}

export function setPracticeModeEnabled(v: boolean) {
  writeBool(RIZZ_KEYS.practiceModeEnabled, v);
}

export function getPracticeDifficulty(): number {
  const n = parseInt(localStorage.getItem(RIZZ_KEYS.practiceDifficulty) || '1', 10);
  if(Number.isNaN(n) || n < 0 || n > 2) return 1;
  return n;
}

export function setPracticeDifficulty(n: number) {
  localStorage.setItem(RIZZ_KEYS.practiceDifficulty, String(Math.max(0, Math.min(2, n | 0))));
}

export function cyclePracticeDifficulty(): number {
  const next = (getPracticeDifficulty() + 1) % 3;
  setPracticeDifficulty(next);
  return next;
}

export function setGradesEnabled(v: boolean) {
  writeBool(RIZZ_KEYS.gradesEnabled, v);
}

export function setEvalBarEnabled(v: boolean) {
  writeBool(RIZZ_KEYS.evalBarEnabled, v);
}

export function setModels(main: string, suggest: string) {
  if(main.trim()) {
    localStorage.setItem(RIZZ_KEYS.openRouterModel, main);
  } else {
    localStorage.removeItem(RIZZ_KEYS.openRouterModel);
  }
  if(suggest.trim()) {
    localStorage.setItem(RIZZ_KEYS.openRouterSuggestModel, suggest);
  } else {
    localStorage.removeItem(RIZZ_KEYS.openRouterSuggestModel);
  }
}

export function setSuggestionsEnabled(v: boolean) {
  writeBool(RIZZ_KEYS.suggestionsEnabled, v);
}

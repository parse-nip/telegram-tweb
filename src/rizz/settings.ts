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

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_SUGGEST = 'google/gemini-2.0-flash-001';

function readBool(key: string, defaultVal: boolean): boolean {
  const v = localStorage.getItem(key);
  if(v === null) return defaultVal;
  return v === '1' || v === 'true';
}

function writeBool(key: string, value: boolean) {
  localStorage.setItem(key, value ? '1' : '0');
}

export function getOpenRouterKey(): string {
  return localStorage.getItem(RIZZ_KEYS.openRouterKey) || '';
}

export function setOpenRouterKey(key: string) {
  localStorage.setItem(RIZZ_KEYS.openRouterKey, key);
}

export function getModel(): string {
  return localStorage.getItem(RIZZ_KEYS.openRouterModel) || DEFAULT_MODEL;
}

export function getSuggestModel(): string {
  return localStorage.getItem(RIZZ_KEYS.openRouterSuggestModel) || DEFAULT_SUGGEST;
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
  localStorage.setItem(RIZZ_KEYS.openRouterModel, main);
  localStorage.setItem(RIZZ_KEYS.openRouterSuggestModel, suggest);
}

export function setSuggestionsEnabled(v: boolean) {
  writeBool(RIZZ_KEYS.suggestionsEnabled, v);
}

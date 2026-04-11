import {Grade, gradeFromString, gradeToString} from './grades';
import {hashMessageText} from './hash';

const STORAGE_KEY = 'rizz_grades_v1';

type Entry = {
  grade: string;
  reason: string;
  textHash: string;
};

function loadAll(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return {};
    return JSON.parse(raw) as Record<string, Entry>;
  } catch{
    return {};
  }
}

function saveAll(map: Record<string, Entry>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function cacheKey(peerKey: string, mid: number): string {
  return `${peerKey}:${mid}`;
}

export async function getCached(
  peerKey: string,
  mid: number,
  text: string
): Promise<{grade: Grade, reason: string} | undefined> {
  const key = cacheKey(peerKey, mid);
  const all = loadAll();
  const e = all[key];
  if(!e) return undefined;
  const h = await hashMessageText(text);
  if(e.textHash !== h.toString()) return undefined;
  const g = gradeFromString(e.grade);
  if(g === Grade.Unknown) return undefined;
  return {grade: g, reason: e.reason || ''};
}

export async function setCached(
  peerKey: string,
  mid: number,
  text: string,
  grade: Grade,
  reason: string
) {
  const key = cacheKey(peerKey, mid);
  const h = await hashMessageText(text);
  const all = loadAll();
  all[key] = {
    grade: gradeToString(grade),
    reason,
    textHash: h.toString()
  };
  saveAll(all);
}

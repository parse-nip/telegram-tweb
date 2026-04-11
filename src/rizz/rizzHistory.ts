import type Chat from '@components/chat/chat';
import type {Message} from '@layer';
import {Grade} from './grades';
import type {RizzMsgLite} from './stats';
import {buildSmartContext} from './context';
import {makeFullMid} from '@components/chat/bubbles';

export function collectRizzMessages(chat: Chat, max: number): RizzMsgLite[] {
  const hs = chat.getHistoryStorage?.();
  if(!hs || !hs.history?.slices) {
    return [];
  }

  const mids: number[] = [];
  for(const slice of hs.history.slices) {
    for(let i = 0; i < slice.length; i++) {
      mids.push(slice[i] as number);
    }
  }
  const out: RizzMsgLite[] = [];
  for(const mid of mids) {
    const m = chat.getMessage(mid);
    if(!m || m._ !== 'message') continue;
    const msg = m as Message.message;
    const text = (msg.message || '').trim();
    if(!text) continue;
    out.push({
      date: msg.date,
      out: !!msg.pFlags?.out,
      text,
      mid,
      grade: Grade.Unknown
    });
  }
  out.sort((a, b) => a.mid - b.mid);
  return out.slice(-max);
}

export function contextLinesBefore(chat: Chat, targetMid: number): string[] {
  const all = collectRizzMessages(chat, 5000).filter((m) => m.mid < targetMid);
  const lines: string[] = [];
  for(const m of all) {
    lines.push((m.out ? 'You: ' : 'Them: ') + m.text);
  }
  return lines;
}

export function buildClassifyContext(chat: Chat, targetMid: number, messageText: string): string {
  const lines = contextLinesBefore(chat, targetMid);
  const anchor = messageText;
  return buildSmartContext(lines, anchor, 24, 8);
}

export function buildComposeContext(chat: Chat, anchorDraft: string): string {
  const all = collectRizzMessages(chat, 5000);
  const lines = all.map((m) => (m.out ? 'You: ' : 'Them: ') + m.text);
  return buildSmartContext(lines, anchorDraft, 28, 6);
}

export function fullMidFromBubble(bubble: HTMLElement) {
  const mid = bubble.dataset.mid;
  if(mid === undefined) return undefined;
  return makeFullMid(bubble.dataset.peerId.toPeerId(), +mid);
}

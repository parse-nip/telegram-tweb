import type Chat from '@components/chat/chat';
import type {Message} from '@layer';
import Modes from '@config/modes';
import {Grade} from './grades';
import type {RizzMsgLite} from './stats';
import {buildSmartContext} from './context';
import {makeFullMid} from '@components/chat/bubbles';
import rootScope from '@lib/rootScope';
import pause from '@helpers/schedulers/pause';

/**
 * `getHistory` often omits `messages` (only `history` mids) unless search cache flags are set.
 * Resolve full message objects so crawlers work in mock and normal modes.
 */
function messagesFromHistoryResult(
  peerId: PeerId,
  res: {
    history?: Array<number | string>,
    messages?: Array<Message.message | Message.messageService>
  }
): Message.message[] {
  const am = rootScope.managers.appMessagesManager;
  if(res.messages?.length) {
    return res.messages.filter((m) => m._ === 'message') as Message.message[];
  }
  const hist = res.history;
  if(!hist?.length) return [];
  const out: Message.message[] = [];
  for(const item of hist) {
    let mid: number;
    let peer = peerId;
    if(typeof item === 'number') {
      mid = item;
    } else {
      const str = String(item);
      const idx = str.indexOf('_');
      if(idx !== -1) {
        peer = str.slice(0, idx).toPeerId();
        mid = +str.slice(idx + 1);
      } else {
        mid = +str;
      }
    }
    const m = am.getMessageByPeer(peer, mid);
    if(m && m._ === 'message') out.push(m as Message.message);
  }
  return out;
}

function messageMid(msg: Message.message): number {
  return msg.mid ?? msg.id;
}

export async function crawlFullHistory(
  peerId: PeerId,
  onProgress?: (count: number, messages: RizzMsgLite[]) => void
): Promise<RizzMsgLite[]> {
  const managers = rootScope.managers;
  let offsetId = 0;
  const all: RizzMsgLite[] = [];
  const seen = new Set<number>();

  while(true) {
    const res = await managers.appMessagesManager.getHistory({
      peerId,
      offsetId,
      limit: 100,
      addOffset: 0,
      fetchIfWasNotFetched: true
    });

    if(!res) break;

    const batch = messagesFromHistoryResult(peerId, res);
    if(!batch.length) break;

    let addedInRound = 0;
    for(const msg of batch) {
      const mid = messageMid(msg);
      if(seen.has(mid)) continue;
      seen.add(mid);

      const text = (msg.message || '').trim();
      if(!text) continue;

      all.push({
        date: msg.date,
        out: !!msg.pFlags?.out,
        text,
        mid,
        grade: Grade.Unknown
      });
      addedInRound++;
    }

    if(addedInRound === 0) break;

    offsetId = Math.min(...batch.map(messageMid));

    if(onProgress) onProgress(all.length, all);

    await pause(50);

    if(all.length > 50000) break;
  }

  if(!all.length && Modes.mockAuth) {
    const chat = managers.appChatsManager.getChat(peerId.toChatId());
    if(chat) {
      const collected = collectRizzMessages(chat, 50000);
      if(collected.length) {
        return collected.sort((a, b) => a.date - b.date);
      }
    }
  }

  return all.sort((a, b) => a.date - b.date);
}

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

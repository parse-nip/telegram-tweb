import type ChatInput from '@components/chat/input';
import {ChatType} from '@components/chat/chatType';
import {getPracticeModeEnabled, getPracticeDifficulty, getOpenRouterKey} from './settings';
import {buildComposeContext} from './rizzHistory';
import {requestPracticeReply} from './openrouter';
import {getRizzController} from './rizzChatIntegration';
import {toast} from '@components/toast';

function isRizzPracticePeerTitle(chat: ChatInput['chat']): boolean {
  const p = chat.peer;
  if(!p) return false;
  if(p._ === 'user') {
    const t = [p.first_name, p.last_name].filter(Boolean).join(' ').toLowerCase();
    return t.includes('rizz practice');
  }
  if(p._ === 'channel' || p._ === 'chat') {
    return (p.title || '').toLowerCase().includes('rizz practice');
  }
  return false;
}

/** Returns true when the send was handled locally (practice) and Telegram send should be skipped. */
export async function tryRizzPracticeSend(input: ChatInput, trimmedValue: string): Promise<boolean> {
  const chat = input.chat;
  if(chat.type !== ChatType.Chat) return false;
  if(!getPracticeModeEnabled()) return false;
  if(!isRizzPracticePeerTitle(chat)) return false;
  if(!trimmedValue) return false;

  if(!getOpenRouterKey().trim()) {
    toast('Rizz practice needs an OpenRouter API key (Rizz settings).');
    return true;
  }

  const ctx = buildComposeContext(chat, trimmedValue);
  const diff = getPracticeDifficulty();
  let reply: string;
  try {
    reply = await requestPracticeReply(ctx, trimmedValue, diff);
  } catch{
    reply = 'haha ok — tell me more?';
  }

  input.messageInput.textContent = '';
  input.messageInputField.onFakeInput();
  input.onMessageSent?.(false, false);

  const ctrl = getRizzController(chat);
  ctrl?.appendPracticeLine('you', trimmedValue);
  ctrl?.appendPracticeLine('them', reply);

  return true;
}

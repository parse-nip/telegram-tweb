import type Chat from '@components/chat/chat';
import {ChatType} from '@components/chat/chatType';
import {showRizzStatsPopup} from './rizzStatsPopup';
import {showRizzSettingsPopup} from './rizzSettingsPopup';
import {
  getEvalBarEnabled,
  setEvalBarEnabled,
  getPracticeModeEnabled,
  setPracticeModeEnabled,
  cyclePracticeDifficulty
} from './settings';
import {getRizzController} from './rizzChatIntegration';
import {toast} from '@components/toast';

function peerTitleLooksLikePractice(chat: Chat): boolean {
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

/** Extra kebab-menu entries for Rizz (insert after the first submenu item). */
export function getRizzPeerMenuButtons(chat: Chat) {
  return [
    {
      icon: 'statistics',
      text: 'Rizz stats',
      onClick: () => showRizzStatsPopup(chat),
      verify: () => chat.type === ChatType.Chat
    },
    {
      icon: 'settings',
      text: 'Rizz settings',
      onClick: () => showRizzSettingsPopup(),
      verify: () => true
    },
    {
      icon: 'colorize',
      text: 'Rizz: toggle eval bar',
      onClick: () => {
        const v = !getEvalBarEnabled();
        setEvalBarEnabled(v);
        toast(v ? 'Rizz eval bar on' : 'Rizz eval bar off');
        getRizzController(chat)?.refreshEvalAndSummary();
      },
      verify: () => chat.type === ChatType.Chat
    },
    {
      icon: 'bots',
      text: 'Rizz: toggle practice',
      onClick: () => {
        if(!peerTitleLooksLikePractice(chat)) {
          toast('Rename a chat to “Rizz Practice” for practice mode.');
          return;
        }
        const v = !getPracticeModeEnabled();
        setPracticeModeEnabled(v);
        toast(v ? 'Rizz practice on' : 'Rizz practice off');
      },
      verify: () => chat.type === ChatType.Chat
    },
    {
      icon: 'sort',
      text: 'Rizz: cycle practice difficulty',
      onClick: () => {
        const d = cyclePracticeDifficulty();
        const labels = ['easy', 'medium', 'hard'];
        toast(`Practice difficulty: ${labels[d]} (${d})`);
      },
      verify: () => chat.type === ChatType.Chat && peerTitleLooksLikePractice(chat) && getPracticeModeEnabled()
    }
  ];
}

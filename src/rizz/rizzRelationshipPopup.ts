import type Chat from '@components/chat/chat';
import PopupElement from '@components/popups';
import {ChatType} from '@components/chat/chatType';
import {
  getPeerRelationship,
  markRelationshipPromptSkippedForSession,
  wasRelationshipPromptSkippedThisSession
} from './peerRelationship';
import {createTelegramRelationshipPicker} from './rizzRelationshipPicker';

export type ShowRizzRelationshipOptions = {
  /** When true, closing without choosing is remembered for this tab session (no repeat nag). */
  fromAutoPrompt?: boolean,
  /** 'person' = DM copy; 'chat' = group/channel copy. */
  titleMode?: 'person' | 'chat',
  /** Fired when the popup begins closing (after pick or dismiss). */
  onClosed?: () => void
};

export class PopupRizzRelationship extends PopupElement {
  private saved = false;

  constructor(
    private readonly peerId: PeerId,
    private opts: ShowRizzRelationshipOptions = {}
  ) {
    super('popup-rizz-relationship popup-rizz-relationship--native', {
      title: false,
      closable: true,
      overlayClosable: true,
      body: true
    });

    this.addEventListener('close', () => {
      if(this.opts.fromAutoPrompt && !this.saved) {
        markRelationshipPromptSkippedForSession(this.peerId);
      }
      try {
        this.opts.onClosed?.();
      } catch{
        /* ignore */
      }
    });

    const root = createTelegramRelationshipPicker({
      peerId: this.peerId,
      titleMode: this.opts.titleMode ?? 'person',
      listenerSetter: this.listenerSetter,
      autoAdvanceMs: 1100,
      onCancel: () => this.forceHide(),
      onComplete: () => {
        this.saved = true;
        this.forceHide();
      }
    });

    this.body!.append(root);
  }
}

function isPrivatePersonChat(chat: Chat) {
  return chat.type === ChatType.Chat && chat.peerId.isUser();
}

export function showRizzRelationshipPopup(chat: Chat, opts?: ShowRizzRelationshipOptions) {
  if(chat.type !== ChatType.Chat) return;
  PopupElement.createPopup(PopupRizzRelationship, chat.peerId, {
    ...opts,
    titleMode: chat.peerId.isUser() ? 'person' : 'chat'
  }).show();
}

/** After opening a 1:1 chat, prompt once per session until the user picks a tag. */
export function maybeShowRelationshipOnChatOpen(chat: Chat) {
  if(!isPrivatePersonChat(chat)) return;
  if(getPeerRelationship(chat.peerId) !== 'unset') return;
  if(wasRelationshipPromptSkippedThisSession(chat.peerId)) return;
  if(PopupElement.getPopups(PopupRizzRelationship).length) return;
  showRizzRelationshipPopup(chat, {fromAutoPrompt: true});
}

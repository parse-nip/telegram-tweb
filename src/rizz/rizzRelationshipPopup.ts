import type Chat from '@components/chat/chat';
import PopupElement from '@components/popups';
import {ChatType} from '@components/chat/chatType';
import ripple from '@components/ripple';
import {
  getPeerRelationship,
  setPeerRelationship,
  relationshipLabel,
  RIZZ_RELATIONSHIP_PICKER_OPTIONS,
  markRelationshipPromptSkippedForSession,
  wasRelationshipPromptSkippedThisSession,
  type RizzPeerRelationship
} from './peerRelationship';

export type ShowRizzRelationshipOptions = {
  /** When true, closing without choosing is remembered for this tab session (no repeat nag). */
  fromAutoPrompt?: boolean
};

export class PopupRizzRelationship extends PopupElement {
  private saved = false;

  constructor(
    private chat: Chat,
    private opts: ShowRizzRelationshipOptions = {}
  ) {
    const title = document.createElement('div');
    title.className = 'rizz-relationship-popup-title';
    title.textContent = chat.peerId.isUser() ?
      'What\'s your relationship with this person?' :
      'What\'s your relationship with this chat?';

    super('popup-rizz-relationship', {
      title,
      closable: true,
      overlayClosable: true,
      body: true
    });

    this.addEventListener('close', () => {
      if(this.opts.fromAutoPrompt && !this.saved) {
        markRelationshipPromptSkippedForSession(this.chat.peerId);
      }
    });

    const wrap = document.createElement('div');
    wrap.className = 'rizz-relationship-panel';

    const hint = document.createElement('p');
    hint.className = 'rizz-relationship-hint';
    hint.textContent = 'Stored only on this device.';

    const display = document.createElement('button');
    display.type = 'button';
    display.className = 'rizz-relationship-display btn btn-flat';
    this.displayButton = display;

    const list = document.createElement('div');
    list.className = 'rizz-relationship-options';

    const initial = getPeerRelationship(this.chat.peerId);
    this.updateDisplay(initial);

    for(const opt of RIZZ_RELATIONSHIP_PICKER_OPTIONS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'rizz-relationship-row btn';
      row.dataset.value = opt.value;
      row.textContent = opt.label;
      ripple(row);
      row.addEventListener('click', () => {
        this.pick(opt.value);
      });
      list.append(row);
    }

    wrap.append(hint, display, list);
    this.body!.append(wrap);
  }

  private displayButton: HTMLButtonElement;

  private updateDisplay(r: RizzPeerRelationship) {
    if(r === 'unset') {
      this.displayButton.textContent = 'Choose below';
      this.displayButton.classList.add('is-placeholder');
    } else {
      this.displayButton.textContent = relationshipLabel(r);
      this.displayButton.classList.remove('is-placeholder');
    }
  }

  private pick(value: RizzPeerRelationship) {
    setPeerRelationship(this.chat.peerId, value);
    this.saved = true;
    this.updateDisplay(value);
    this.forceHide();
  }
}

function isPrivatePersonChat(chat: Chat) {
  return chat.type === ChatType.Chat && chat.peerId.isUser();
}

export function showRizzRelationshipPopup(chat: Chat, opts?: ShowRizzRelationshipOptions) {
  if(chat.type !== ChatType.Chat) return;
  PopupElement.createPopup(PopupRizzRelationship, chat, opts || {}).show();
}

/** After opening a 1:1 chat, prompt once per session until the user picks a tag. */
export function maybeShowRelationshipOnChatOpen(chat: Chat) {
  if(!isPrivatePersonChat(chat)) return;
  if(getPeerRelationship(chat.peerId) !== 'unset') return;
  if(wasRelationshipPromptSkippedThisSession(chat.peerId)) return;
  if(PopupElement.getPopups(PopupRizzRelationship).length) return;
  showRizzRelationshipPopup(chat, {fromAutoPrompt: true});
}

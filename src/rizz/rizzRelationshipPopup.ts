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
    const title = document.createElement('div');
    title.className = 'rizz-relationship-popup-title';
    const mode = opts.titleMode ?? 'person';
    title.textContent = mode === 'chat' ?
      'What\'s your relationship with this chat?' :
      'What\'s your relationship with this person?';

    super('popup-rizz-relationship', {
      title,
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

    const initial = getPeerRelationship(this.peerId);
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
    setPeerRelationship(this.peerId, value);
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

/**
 * Rizz Analytics hub: no Chat instance — still show the same picker before Wrapped when unset.
 * Awaits until the popup is dismissed (picked or closed).
 */
export function runRelationshipGateForPeer(peerId: PeerId): Promise<void> {
  if(!peerId.isUser()) return Promise.resolve();
  if(getPeerRelationship(peerId) !== 'unset') return Promise.resolve();
  if(wasRelationshipPromptSkippedThisSession(peerId)) return Promise.resolve();
  if(PopupElement.getPopups(PopupRizzRelationship).length) return Promise.resolve();
  return new Promise((resolve) => {
    const popup = PopupElement.createPopup(PopupRizzRelationship, peerId, {
      fromAutoPrompt: true,
      titleMode: 'person',
      onClosed: resolve
    });
    popup.show();
  });
}

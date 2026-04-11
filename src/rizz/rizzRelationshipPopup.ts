import type Chat from '@components/chat/chat';
import PopupElement from '@components/popups';
import {ChatType} from '@components/chat/chatType';
import {
  getPeerRelationship,
  setPeerRelationship,
  RIZZ_RELATIONSHIP_OPTIONS,
  type RizzPeerRelationship
} from './peerRelationship';

class PopupRizzRelationship extends PopupElement {
  constructor(private chat: Chat) {
    const title = document.createElement('div');
    title.textContent = 'Chat relationship';

    super('popup-rizz-relationship', {
      title,
      closable: true,
      overlayClosable: true,
      body: true,
      buttons: [
        {langKey: 'Cancel', isCancel: true},
        {
          text: document.createTextNode('Save'),
          callback: () => {
            const v = this.selectEl.value as RizzPeerRelationship;
            setPeerRelationship(this.chat.peerId, v);
          }
        }
      ]
    });

    const wrap = document.createElement('div');
    wrap.className = 'rizz-relationship-form';

    const hint = document.createElement('p');
    hint.className = 'rizz-relationship-hint';
    hint.textContent = 'Used for Rizz stats and summaries. Stored only on this device.';

    this.selectEl = document.createElement('select');
    this.selectEl.className = 'input-field-input rizz-relationship-select';
    for(const opt of RIZZ_RELATIONSHIP_OPTIONS) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      this.selectEl.append(o);
    }
    this.selectEl.value = getPeerRelationship(this.chat.peerId);

    wrap.append(hint, this.selectEl);
    this.body!.append(wrap);
  }

  private selectEl: HTMLSelectElement;
}

export function showRizzRelationshipPopup(chat: Chat) {
  if(chat.type !== ChatType.Chat) return;
  PopupElement.createPopup(PopupRizzRelationship, chat).show();
}

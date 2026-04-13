import {attachClickEvent} from '@helpers/dom/clickEvent';
import ripple from '@components/ripple';
import type ListenerSetter from '@helpers/listenerSetter';
import {
  getPeerRelationship,
  setPeerRelationship,
  RIZZ_RELATIONSHIP_PICKER_OPTIONS,
  relationshipPickQuip,
  type RizzPeerRelationship
} from './peerRelationship';

export type TelegramRelationshipPickerOptions = {
  peerId: PeerId,
  titleMode: 'person' | 'chat',
  listenerSetter: ListenerSetter,
  /** Cancel / back — does not save. */
  onCancel: () => void,
  /** After a choice is saved (or Done confirms). */
  onComplete: () => void,
  /** Optional: e.g. hub only — skip tagging but continue the flow. */
  onSkip?: () => void,
  /** Delay after showing the quip before auto-applying (ms). 0 = manual Done only. */
  autoAdvanceMs: number
};

/**
 * Telegram-style relationship list (emoji row + checkmarks + Cancel/Done).
 * Caller appends the returned root to the hub body or popup body.
 */
export function createTelegramRelationshipPicker(options: TelegramRelationshipPickerOptions): HTMLElement {
  const {peerId, titleMode, listenerSetter, onCancel, onComplete, onSkip, autoAdvanceMs} = options;

  let selected: RizzPeerRelationship | null = null;
  const initial = getPeerRelationship(peerId);
  if(initial !== 'unset') {
    selected = initial;
  }

  let advanceTimer: number | null = null;

  const root = document.createElement('div');
  root.className = 'rizz-rel-picker-native';

  const title = document.createElement('h2');
  title.className = 'rizz-rel-picker-native__title';
  title.textContent = titleMode === 'chat' ?
    'What\'s your relationship with this chat?' :
    'What\'s your relationship with this person?';

  const hint = document.createElement('p');
  hint.className = 'rizz-rel-picker-native__hint';
  hint.textContent = autoAdvanceMs > 0 ?
    'Stored only on this device.' :
    'Stored only on this device. Tap Done when you\'re ready to continue.';

  const quip = document.createElement('div');
  quip.className = 'rizz-rel-picker-native__quip hide';
  quip.setAttribute('role', 'status');

  const list = document.createElement('div');
  list.className = 'rizz-rel-picker-native__list';

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'btn btn-link rizz-rel-picker-native__footer-btn rizz-rel-picker-native__footer-btn--primary';
  doneBtn.textContent = 'Done';

  const rowByValue = new Map<RizzPeerRelationship, HTMLElement>();

  function clearTimer() {
    if(advanceTimer !== null) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
  }

  function applyChoice() {
    if(!selected) return;
    clearTimer();
    setPeerRelationship(peerId, selected);
    onComplete();
  }

  function refreshRows() {
    for(const [v, row] of rowByValue) {
      const on = selected === v;
      row.classList.toggle('rizz-rel-picker-native__row--selected', on);
      const mark = row.querySelector('.rizz-rel-picker-native__check');
      if(mark) {
        mark.classList.toggle('rizz-rel-picker-native__check--on', on);
      }
    }
    doneBtn.disabled = selected === null;
  }

  function onRowPick(value: RizzPeerRelationship) {
    const changed = selected !== value;
    selected = value;
    refreshRows();
    if(!changed) return;
    quip.textContent = relationshipPickQuip(value);
    quip.classList.remove('hide');
    clearTimer();
    if(autoAdvanceMs > 0) {
      advanceTimer = window.setTimeout(() => {
        advanceTimer = null;
        applyChoice();
      }, autoAdvanceMs);
    }
  }

  for(const opt of RIZZ_RELATIONSHIP_PICKER_OPTIONS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'rizz-rel-picker-native__row';
    row.dataset.value = opt.value;

    const emoji = document.createElement('span');
    emoji.className = 'rizz-rel-picker-native__emoji';
    emoji.textContent = opt.emoji;
    emoji.setAttribute('aria-hidden', 'true');

    const lab = document.createElement('span');
    lab.className = 'rizz-rel-picker-native__label';
    lab.textContent = opt.label;

    const check = document.createElement('span');
    check.className = 'rizz-rel-picker-native__check';
    check.setAttribute('aria-hidden', 'true');

    row.append(emoji, lab, check);
    ripple(row);
    attachClickEvent(row, () => {
      onRowPick(opt.value);
    }, {listenerSetter});

    rowByValue.set(opt.value, row);
    list.append(row);
  }

  const footer = document.createElement('div');
  footer.className = 'rizz-rel-picker-native__footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-link rizz-rel-picker-native__footer-btn';
  cancelBtn.textContent = 'Cancel';
  attachClickEvent(cancelBtn, () => {
    clearTimer();
    onCancel();
  }, {listenerSetter});

  attachClickEvent(doneBtn, () => {
    if(!selected) return;
    applyChoice();
  }, {listenerSetter});

  footer.append(cancelBtn, doneBtn);

  root.append(title, hint, quip, list);

  if(onSkip) {
    const skipRow = document.createElement('div');
    skipRow.className = 'rizz-rel-picker-native__skip-wrap';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn btn-link rizz-rel-picker-native__skip';
    skipBtn.textContent = 'Not sure yet — continue without tagging';
    attachClickEvent(skipBtn, () => {
      clearTimer();
      onSkip();
    }, {listenerSetter});
    skipRow.append(skipBtn);
    root.append(skipRow);
  }

  root.append(footer);

  refreshRows();

  return root;
}

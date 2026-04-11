import PopupElement from '@components/popups';
import {MOUNT_CLASS_TO} from '@config/debug';
import {getRizzController} from './rizzChatIntegration';
import {
  getStoredOpenRouterKey,
  setOpenRouterKey,
  getStoredModel,
  getStoredSuggestModel,
  RIZZ_DEFAULT_MODEL,
  setModels,
  getSuggestionsEnabled,
  getGradesEnabled,
  getEvalBarEnabled,
  getPracticeModeEnabled,
  setSuggestionsEnabled,
  setGradesEnabled,
  setEvalBarEnabled,
  setPracticeModeEnabled
} from './settings';

class PopupRizzSettings extends PopupElement {
  constructor() {
    const title = document.createElement('div');
    title.textContent = 'Rizz settings';

    super('popup-rizz-settings', {
      title,
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      buttons: [
        {
          langKey: 'Cancel',
          isCancel: true
        },
        {
          text: document.createTextNode('Save'),
          callback: () => {
            setOpenRouterKey(this.keyInput.value.trim());
            setModels(this.modelMain.value.trim(), this.modelSuggest.value.trim());
            setSuggestionsEnabled(this.sugEl.checked);
            setGradesEnabled(this.grEl.checked);
            setEvalBarEnabled(this.evEl.checked);
            setPracticeModeEnabled(this.prEl.checked);
            const chat = MOUNT_CLASS_TO.appImManager?.chat;
            if(chat) {
              queueMicrotask(() => getRizzController(chat)?.refreshEvalAndSummary());
            }
          }
        }
      ]
    });

    const wrap = document.createElement('div');
    wrap.className = 'rizz-settings-form';

    const warn = document.createElement('p');
    warn.className = 'rizz-settings-warn';
    warn.textContent = 'The app ships with a built-in key and free model; optional overrides are stored in this browser only. Do not share your screen while typing a private key.';

    this.keyInput = document.createElement('input');
    this.keyInput.type = 'password';
    this.keyInput.className = 'input-field-input';
    this.keyInput.placeholder = 'Optional override — leave blank for built-in default';
    this.keyInput.value = getStoredOpenRouterKey();

    this.modelMain = document.createElement('input');
    this.modelMain.className = 'input-field-input';
    this.modelMain.placeholder = `Classify / casual (default ${RIZZ_DEFAULT_MODEL})`;
    this.modelMain.value = getStoredModel();

    this.modelSuggest = document.createElement('input');
    this.modelSuggest.className = 'input-field-input';
    this.modelSuggest.placeholder = `Ghost / practice (default ${RIZZ_DEFAULT_MODEL})`;
    this.modelSuggest.value = getStoredSuggestModel();

    this.sugEl = document.createElement('input');
    this.sugEl.type = 'checkbox';
    this.sugEl.checked = getSuggestionsEnabled();
    const sugLabel = document.createElement('label');
    sugLabel.append(this.sugEl, document.createTextNode(' Suggestions (chips + ghost)'));

    this.grEl = document.createElement('input');
    this.grEl.type = 'checkbox';
    this.grEl.checked = getGradesEnabled();
    const grLabel = document.createElement('label');
    grLabel.append(this.grEl, document.createTextNode(' Grades (badges + classify)'));

    this.evEl = document.createElement('input');
    this.evEl.type = 'checkbox';
    this.evEl.checked = getEvalBarEnabled();
    const evLabel = document.createElement('label');
    evLabel.append(this.evEl, document.createTextNode(' Eval bar + summary'));

    this.prEl = document.createElement('input');
    this.prEl.type = 'checkbox';
    this.prEl.checked = getPracticeModeEnabled();
    const prLabel = document.createElement('label');
    prLabel.append(this.prEl, document.createTextNode(' Practice mode (Rizz Practice chat)'));

    wrap.append(
      warn,
      this.keyInput,
      this.modelMain,
      this.modelSuggest,
      sugLabel,
      grLabel,
      evLabel,
      prLabel
    );
    this.body!.append(wrap);
  }

  private keyInput: HTMLInputElement;
  private modelMain: HTMLInputElement;
  private modelSuggest: HTMLInputElement;
  private sugEl: HTMLInputElement;
  private grEl: HTMLInputElement;
  private evEl: HTMLInputElement;
  private prEl: HTMLInputElement;
}

export function showRizzSettingsPopup() {
  PopupElement.createPopup(PopupRizzSettings).show();
}

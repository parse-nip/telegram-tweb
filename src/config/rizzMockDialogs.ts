/*
 * Seeds fake private chats for ?mockAuth=1 so the sidebar and Rizz flows are usable offline.
 */
import type {Dialog, Message, Peer, User} from '@layer';
import {FOLDER_ID_ALL} from '@appManagers/constants';
import {GLOBAL_FOLDER_ID} from '@lib/storages/dialogs';
import type {AppManagers} from '@lib/managers';
import rootScope from '@lib/rootScope';
import tsNow from '@helpers/tsNow';
import {isRizzMockAuthEnabled, RIZZ_MOCK_SELF_USER_ID} from '@config/rizzMockAuth';

type MockContact = {
  userId: number,
  firstName: string,
  lastName: string,
  username: string,
  lastMessage: string
};

const MOCK_CONTACTS: MockContact[] = [
  {userId: 999888001, firstName: 'Alex', lastName: 'River', username: 'alex_river', lastMessage: 'Want to grab coffee later?'},
  {userId: 999888002, firstName: 'Jordan', lastName: 'Lee', username: 'jordan_lee', lastMessage: 'That meme you sent was perfect 😂'},
  {userId: 999888003, firstName: 'Sam', lastName: 'Quinn', username: 'sam_quinn', lastMessage: 'See you at 7 — don\'t be late!'},
  {userId: 999888004, firstName: 'Riley', lastName: 'Fox', username: 'riley_fox', lastMessage: 'Can you send the doc again?'},
  {userId: 999888005, firstName: 'Casey', lastName: 'Brooks', username: 'casey_brooks', lastMessage: 'Haha fair enough. Rain check?'},
  {userId: 999888006, firstName: 'Morgan', lastName: 'Vale', username: 'morgan_vale', lastMessage: 'Good luck with the interview 🤞'},
  {userId: 999888007, firstName: 'Taylor', lastName: 'Reed', username: 'taylor_reed', lastMessage: 'I\'ll call you in five.'},
  {userId: 999888008, firstName: 'Jamie', lastName: 'Nova', username: 'jamie_nova', lastMessage: 'This playlist is *chef kiss*'}
];

/** Inclusive range [MOCK_MSG_ID_MIN, MOCK_MSG_ID_MAX] per peer — enough for Rizz analysis + heatmap without MTProto. */
const MOCK_MSG_ID_MIN = 100;
const MOCK_MSG_ID_MAX = 149;

const THEM_LINES = [
  'Hey!',
  'How was your day?',
  'Haha fair enough',
  'Same here honestly',
  'That sounds fun',
  'I might be free Friday',
  'Send me the link?',
  'No worries at all',
  'You always make me laugh',
  'Let me know tomorrow',
  'Good luck with that thing',
  'I was just thinking of you',
  'That playlist slaps',
  'Rain check?',
  'See you soon',
  'Miss talking to you',
  'What are you up to?',
  'That meme was perfect',
  'Can you send that again?',
  'I owe you one',
  'Deal',
  'Text me when you land',
  'Sleep well',
  'You got this',
  'Talk later'
];

const YOU_LINES = [
  'Hey',
  'Pretty good — you?',
  'Want to grab coffee later?',
  'That meme you sent was perfect',
  'See you at 7',
  'Can you send the doc again?',
  'Haha fair enough. Rain check?',
  'Good luck with the interview',
  'I\'ll call you in five.',
  'This playlist is chef\'s kiss',
  'Busy but hanging in',
  'Let\'s do brunch Sunday?',
  'You\'re the best',
  'On my way',
  'Sent',
  'Perfect',
  'Love that for us',
  'Facts',
  'Say less',
  'Bet',
  'I\'m down',
  'Sounds like a plan',
  'Appreciate you',
  'Anytime',
  'Miss you too'
];

function buildMockUser(c: MockContact): User.user {
  const now = Math.floor(Date.now() / 1000);
  return {
    _: 'user',
    pFlags: {},
    id: c.userId,
    first_name: c.firstName,
    last_name: c.lastName,
    username: c.username,
    phone: `99966${String(100000 + c.userId % 100000).slice(-5)}`,
    status: {
      _: 'userStatusOnline',
      expires: now + 3600
    }
  };
}

/**
 * Inserts users, last messages, and dialogs into local storage (no API).
 */
export async function seedRizzMockDialogs(managers: AppManagers): Promise<void> {
  if(!isRizzMockAuthEnabled()) {
    return;
  }

  const {appUsersManager, appMessagesManager, appPeersManager, dialogsStorage, timeManager} = managers;
  const timeOffset = await timeManager.getServerTimeOffset();
  const baseServerDate = tsNow(true) + timeOffset;

  const updated = new Map<PeerId, {dialog: Dialog.dialog}>();

  for(let i = 0; i < MOCK_CONTACTS.length; ++i) {
    const c = MOCK_CONTACTS[i];
    if(c.userId === RIZZ_MOCK_SELF_USER_ID) {
      continue;
    }

    const user = buildMockUser(c);
    await appUsersManager.saveApiUser(user, true);

    const peerId = c.userId.toPeerId(false);

    const outputPeer = await appPeersManager.getOutputPeer(peerId);
    const selfFrom: Peer.peerUser = { _: 'peerUser', user_id: RIZZ_MOCK_SELF_USER_ID };
    const themFrom: Peer.peerUser = { _: 'peerUser', user_id: c.userId };

    const batch: Message.message[] = [];
    for(let j = MOCK_MSG_ID_MIN; j <= MOCK_MSG_ID_MAX; ++j) {
      const idx = j - MOCK_MSG_ID_MIN;
      const out = idx % 2 === 1;
      const date = baseServerDate - (MOCK_MSG_ID_MAX - j) * 1400 - i * 60 - (idx % 9) * 7200;
      const text = out ? YOU_LINES[idx % YOU_LINES.length] : THEM_LINES[idx % THEM_LINES.length];

      const msg: Message.message = {
        _: 'message',
        id: j,
        date,
        message: text,
        peer_id: outputPeer,
        from_id: out ? selfFrom : themFrom,
        pFlags: out ? { out: true } : {}
      };
      batch.push(msg);
    }

    await appMessagesManager.saveMessages(batch);

    const dialog: Dialog.dialog = {
      _: 'dialog',
      pFlags: {},
      peer: outputPeer,
      top_message: MOCK_MSG_ID_MAX,
      read_inbox_max_id: MOCK_MSG_ID_MAX,
      read_outbox_max_id: 0,
      unread_count: 0,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      notify_settings: {
        _: 'peerNotifySettings'
      },
      folder_id: FOLDER_ID_ALL
    };

    await dialogsStorage.saveDialog({
      dialog,
      ignoreOffsetDate: true,
      saveGlobalOffset: true
    });

    const saved = await dialogsStorage.getDialogOnly(peerId) as Dialog.dialog | undefined;
    if(saved) {
      updated.set(peerId, {dialog: saved});
    }
  }

  // * Must mark both “all” and “archive” (or use GLOBAL_FOLDER_ID), otherwise once
  // * dialogsOffsetDate[0] is set, getDialogs() uses realFolderId === GLOBAL_FOLDER_ID and
  // * isDialogsLoaded(undefined) stays false → getTopMessages (API) never finishes → skeleton list.
  await dialogsStorage.setDialogsLoaded(GLOBAL_FOLDER_ID, true);

  if(updated.size) {
    rootScope.dispatchEvent('dialogs_multiupdate', updated);
  }

  console.warn('[Rizz mockAuth] Seeded', updated.size, 'mock private chats for local UI.');
}

/**
 * If the main folder is still empty (e.g. first paint raced before seed), seed again so the list can exit loading.
 */
export async function ensureRizzMockDialogsIfNeeded(managers: AppManagers): Promise<void> {
  if(!isRizzMockAuthEnabled()) {
    return;
  }

  const dialogs = await managers.dialogsStorage.getFolderDialogs(FOLDER_ID_ALL, true);
  if(dialogs.length) {
    return;
  }

  await seedRizzMockDialogs(managers);
}

/*
 * Seeds fake private chats for ?mockAuth=1 so the sidebar and Rizz flows are usable offline.
 */
import type {Dialog, Message, User} from '@layer';
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

const TOP_MSG_ID = 100;

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
    const serverDate = baseServerDate - i * 90;

    const outputPeer = await appPeersManager.getOutputPeer(peerId);

    const msg: Message.message = {
      _: 'message',
      id: TOP_MSG_ID,
      date: serverDate,
      message: c.lastMessage,
      peer_id: outputPeer,
      from_id: outputPeer,
      pFlags: {}
    };

    await appMessagesManager.saveMessages([msg]);

    const dialog: Dialog.dialog = {
      _: 'dialog',
      pFlags: {},
      peer: outputPeer,
      top_message: TOP_MSG_ID,
      read_inbox_max_id: TOP_MSG_ID,
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

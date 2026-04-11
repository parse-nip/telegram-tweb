/*
 * Rizz / local dev: optional auth bypass when opening with ?mockAuth=1
 * Does not replace real MTProto session; chat sync will fail until real login.
 */
import type {User} from '@layer';
import rootScope from '@lib/rootScope';
import Modes from '@config/modes';
import {getEnvironment} from '@environment/utils';

const MOCK_USER_ID = 999888777;

/** Same id as the fake signed-in user for ?mockAuth=1 */
export const RIZZ_MOCK_SELF_USER_ID = MOCK_USER_ID;

export function isRizzMockAuthEnabled(): boolean {
  if(Modes.mockAuth) {
    return true;
  }

  try {
    return !!(getEnvironment() as {rizzMockAuth?: boolean} | undefined)?.rizzMockAuth;
  } catch {
    return false;
  }
}

export function createRizzMockSelfUser(): User.user {
  const now = Math.floor(Date.now() / 1000);
  return {
    _: 'user',
    pFlags: {
      self: true
    },
    id: MOCK_USER_ID,
    first_name: 'Rizz',
    last_name: 'Mock',
    username: 'rizz_mock_user',
    phone: '99966000000',
    status: {
      _: 'userStatusOnline',
      expires: now + 86400
    }
  };
}

export async function applyRizzMockAuth(): Promise<void> {
  if(!isRizzMockAuthEnabled()) {
    return;
  }

  const user = createRizzMockSelfUser();
  await rootScope.managers.apiManager.setUser(user);
  await rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateSignedIn'});

  console.warn(
    '[Rizz mockAuth] Logged in as fake user id',
    MOCK_USER_ID,
    '— MTProto calls will fail until you use real auth. Open without mockAuth for production login.'
  );

  const {seedRizzMockDialogs} = await import('./rizzMockDialogs');
  await seedRizzMockDialogs(rootScope.managers);
}

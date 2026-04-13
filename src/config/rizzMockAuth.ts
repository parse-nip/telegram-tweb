/*
 * Rizz / local dev: optional auth bypass when opening with ?mockAuth=1
 * Does not replace real MTProto session; chat sync will fail until real login.
 */
import type {User} from '@layer';
import rootScope from '@lib/rootScope';
import Modes from '@config/modes';
import {getEnvironment} from '@environment/utils';

const MOCK_USER_ID = 999888777;

let unhandledRejectionFilterInstalled = false;

/**
 * Many UI paths still invoke MTProto without a real session key. Under ?mockAuth=1 those reject with
 * AUTH_KEY_UNREGISTERED / 401 — expected noise, not actionable bugs. Suppress default console reporting.
 */
function installRizzMockUnhandledRejectionFilter() {
  if(typeof window === 'undefined' || unhandledRejectionFilterInstalled) {
    return;
  }

  unhandledRejectionFilterInstalled = true;

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const r = event.reason;
    if(!r || typeof r !== 'object') {
      return;
    }

    const err = r as {type?: string, code?: number, message?: string};
    if(err.type === 'AUTH_KEY_UNREGISTERED' || err.code === 401) {
      event.preventDefault();
      return;
    }

    if(typeof err.message === 'string' && err.message.includes('AUTH_KEY_UNREGISTERED')) {
      event.preventDefault();
    }
  });
}

/** Same id as the fake signed-in user for ?mockAuth=1 */
export const RIZZ_MOCK_SELF_USER_ID = MOCK_USER_ID;

export function isRizzMockAuthEnabled(): boolean {
  if(Modes.mockAuth) {
    return true;
  }

  try {
    return !!(getEnvironment() as {rizzMockAuth?: boolean} | undefined)?.rizzMockAuth;
  }catch{
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

  installRizzMockUnhandledRejectionFilter();

  const user = createRizzMockSelfUser();
  await rootScope.managers.apiManager.setUser(user);
  await rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateSignedIn'});

  console.warn(
    '[Rizz mockAuth] Logged in as fake user id',
    MOCK_USER_ID,
    '— no real MTProto session: expected 401s are suppressed in console. Open without mockAuth for production login.'
  );

  const {seedRizzMockDialogs} = await import('./rizzMockDialogs');
  await seedRizzMockDialogs(rootScope.managers);
}

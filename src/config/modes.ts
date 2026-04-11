/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {TransportType} from '@lib/mtproto/dcConfigurator';

function urlParamFlag(name: string, value: string, allowAtSuffix = false): boolean {
  const matchValue = (actual: string | null) => {
    if(actual === value) {
      return true;
    }
    return allowAtSuffix && !!actual && actual.startsWith(`${value}@`);
  };

  const match = (params: URLSearchParams) => matchValue(params.get(name));
  if(match(new URLSearchParams(location.search))) {
    return true;
  }
  const hash = location.hash;
  const q = hash.indexOf('?');
  if(q !== -1) {
    return match(new URLSearchParams(hash.slice(q + 1)));
  }
  return false;
}

const Modes = {
  test: urlParamFlag('test', '1'),
  /** Dev-only: skip Telegram login, inject a fake self user (Rizz UI work without real auth). */
  mockAuth: urlParamFlag('mockAuth', '1', true),
  debug: urlParamFlag('debug', '1'),
  http: false,
  ssl: true, // location.search.indexOf('ssl=1') > 0 || location.protocol === 'https:' && location.search.indexOf('ssl=0') === -1,
  asServiceWorker: !!import.meta.env.VITE_MTPROTO_SW,
  transport: 'websocket' as TransportType,
  noSharedWorker: urlParamFlag('noSharedWorker', '1'),
  noServiceWorker: urlParamFlag('noServiceWorker', '1'),
  multipleTransports: !!(import.meta.env.VITE_MTPROTO_AUTO && import.meta.env.VITE_MTPROTO_HAS_HTTP && import.meta.env.VITE_MTPROTO_HAS_WS) && !urlParamFlag('noMultipleTransports', '1'),
  noPfs: true || urlParamFlag('noPfs', '1')
};

if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
  const httpOnly = Modes.http = urlParamFlag('http', '1');
  if(httpOnly) {
    Modes.multipleTransports = false;
  }
}

// * start with HTTP first
if(Modes.multipleTransports) {
  Modes.http = true;
}

if(Modes.http) {
  Modes.transport = 'https';
}

export default Modes;

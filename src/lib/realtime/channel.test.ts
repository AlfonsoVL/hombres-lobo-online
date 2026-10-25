import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (msg: { payload?: unknown; key?: string }) => void;
const handlers = new Map<string, Handler>();
const sent: { event: string; payload: unknown }[] = [];

const fakeChannel = {
  on(type: string, filter: { event: string }, cb: Handler) {
    handlers.set(`${type}:${filter.event}`, cb);
    return fakeChannel;
  },
  subscribe: () => fakeChannel,
  send: (msg: { event: string; payload: unknown }) => {
    sent.push({ event: msg.event, payload: msg.payload });
    return Promise.resolve('ok');
  },
  track: () => Promise.resolve('ok'),
  presenceState: () => ({}),
};

vi.mock('./client', () => ({
  getSupabase: () => ({ channel: () => fakeChannel, removeChannel: () => Promise.resolve('ok') }),
}));

const { joinRoomChannel } = await import('./channel');
const PHOTO = 'data:image/jpeg;base64,AAAA';

describe('fotos al reconectar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handlers.clear();
    sent.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  const join = () =>
    joinRoomChannel('ABCDEF', 'yo', {
      onEvent: () => undefined,
      onPresence: () => undefined,
      getPhoto: (id) => (id === 'otro' ? PHOTO : undefined),
    });

  it('devuelve su foto a quien vuelve a entrar', () => {
    join();
    handlers.get('presence:join')!({ key: 'otro' });
    vi.advanceTimersByTime(5000);
    expect(sent).toEqual([{ event: 'foto', payload: { id: 'otro', data: PHOTO } }]);
  });

  it('no la repite si otro móvil ya la ha devuelto', () => {
    join();
    handlers.get('presence:join')!({ key: 'otro' });
    handlers.get('broadcast:foto')!({ payload: { id: 'otro', data: PHOTO } });
    vi.advanceTimersByTime(5000);
    expect(sent).toEqual([]);
  });
});

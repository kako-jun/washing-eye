// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameStart } from './game-start';
import { LookController } from './input/look';
import { showStartScreen } from './ui/start';

/** iOS のように requestPermission を持つ DeviceOrientationEvent を差し込む */
function stubPermission(result: Promise<'granted' | 'denied'>) {
  const requestPermission = vi.fn(() => result);
  class WithPermission extends Event {
    static requestPermission = requestPermission;
  }
  vi.stubGlobal('DeviceOrientationEvent', WithPermission);
  return requestPermission;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('開始処理', () => {
  it('タッチ端末では、呼んだその場で（await より前に）音を開始し requestPermission を呼ぶ', () => {
    const requestPermission = stubPermission(new Promise(() => {}));
    const order: string[] = [];
    const sound = { start: vi.fn(() => order.push('sound')) };
    requestPermission.mockImplementation(() => {
      order.push('permission');
      return new Promise(() => {});
    });
    const start = createGameStart({
      sound,
      look: new LookController(),
      isTouch: true,
      onTiltActive: () => {},
      onStarted: () => {},
    });
    void start();
    expect(order).toEqual(['sound', 'permission']);
  });

  it('スタート画面の「はじめる」のクリックの中で、同期的に requestPermission が呼ばれる', () => {
    const requestPermission = stubPermission(new Promise(() => {}));
    const root = document.createElement('div');
    document.body.appendChild(root);
    showStartScreen(
      root,
      true,
      createGameStart({
        sound: { start: () => {} },
        look: new LookController(),
        isTouch: true,
        onTiltActive: () => {},
        onStarted: () => {},
      }),
    );
    root.querySelector<HTMLButtonElement>('.start__button')!.click();
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('許可が済むと onStarted が呼ばれる。許可を待つ間は呼ばれない', async () => {
    let grant!: (v: 'granted') => void;
    stubPermission(new Promise((r) => (grant = r)));
    const onStarted = vi.fn();
    const done = createGameStart({
      sound: { start: () => {} },
      look: new LookController(),
      isTouch: true,
      onTiltActive: () => {},
      onStarted,
    })();
    await Promise.resolve();
    expect(onStarted).not.toHaveBeenCalled();
    grant('granted');
    await done;
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it('マウス端末では傾きの許可を求めず、音を開始して onStarted を呼ぶ', async () => {
    const requestPermission = stubPermission(Promise.resolve('granted'));
    const sound = { start: vi.fn() };
    const onStarted = vi.fn();
    await createGameStart({
      sound,
      look: new LookController(),
      isTouch: false,
      onTiltActive: () => {},
      onStarted,
    })();
    expect(sound.start).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(onStarted).toHaveBeenCalledTimes(1);
  });
});

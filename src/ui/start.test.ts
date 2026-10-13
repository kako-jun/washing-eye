// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { START_TIMEOUT_MS, showStartScreen } from './start';

let root: HTMLDivElement;

const screen = () => root.querySelector<HTMLElement>('.start')!;
const button = () => root.querySelector<HTMLButtonElement>('.start__button')!;
const error = () => root.querySelector<HTMLElement>('.start__error')!;
const isLeaving = () => screen().classList.contains('is-leaving');
/** disabled のボタンにも届くようにイベントを直接投げる */
const click = () => button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
/** 開始処理の Promise の連鎖を進める */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('スタート画面', () => {
  it('タッチ端末なら傾きの許可について、マウスならマウス操作について注意書きを出す', () => {
    showStartScreen(root, true, async () => {});
    expect(root.querySelector('.start__note')!.textContent).toContain('傾きの使用許可');
    root.innerHTML = '';
    showStartScreen(root, false, async () => {});
    expect(root.querySelector('.start__note')!.textContent).toContain('マウスで操作します');
  });

  it('二重クリックしても開始処理は 1 回だけ走り、押した時点でボタンが無効になる', async () => {
    const onStart = vi.fn(() => new Promise<void>(() => {}));
    showStartScreen(root, false, onStart);
    click();
    expect(button().disabled).toBe(true);
    click();
    await flush();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('開始処理が成功すると画面が閉じ始める（is-leaving）', async () => {
    showStartScreen(root, false, async () => {});
    click();
    await flush();
    expect(isLeaving()).toBe(true);
  });

  it('開始処理が reject されたら閉じずに、ボタンを押し直せる状態に戻してエラー文言を出す', async () => {
    showStartScreen(root, false, () => Promise.reject(new Error('denied')));
    click();
    await flush();
    expect(isLeaving()).toBe(false);
    expect(button().disabled).toBe(false);
    expect(error().hidden).toBe(false);
    expect(error().getAttribute('role')).toBe('alert');
  });

  it('開始処理が同期的に throw しても、閉じずに押し直せる状態に戻す', async () => {
    showStartScreen(root, false, () => {
      throw new Error('boom');
    });
    click();
    await flush();
    expect(isLeaving()).toBe(false);
    expect(button().disabled).toBe(false);
    expect(error().hidden).toBe(false);
  });

  it('開始処理が返らないとき、START_TIMEOUT_MS の 1ms 手前では戻らず、時間切れで押し直せる状態に戻る', async () => {
    vi.useFakeTimers();
    showStartScreen(root, false, () => new Promise<void>(() => {}));
    click();
    await vi.advanceTimersByTimeAsync(START_TIMEOUT_MS - 1);
    expect(button().disabled).toBe(true);
    expect(error().hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(button().disabled).toBe(false);
    expect(error().hidden).toBe(false);
    expect(isLeaving()).toBe(false);
  });

  it('時間切れの後に開始処理が遅れて成功したら画面を閉じ、押し直した分が後で成功しても閉じるのは 1 回だけ', async () => {
    vi.useFakeTimers();
    const addListener = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const first = deferred();
    const second = deferred();
    const onStart = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    showStartScreen(root, false, onStart);
    click();
    await vi.advanceTimersByTimeAsync(START_TIMEOUT_MS);
    click(); // 押し直し
    await flush();
    expect(onStart).toHaveBeenCalledTimes(2);
    first.resolve();
    await flush();
    expect(isLeaving()).toBe(true);
    second.resolve();
    await flush();
    const transitionListeners = addListener.mock.calls.filter(([type]) => type === 'transitionend');
    expect(transitionListeners).toHaveLength(1);
  });

  it('閉じた後にボタンへクリックが届いても、開始処理は走らない', async () => {
    const onStart = vi.fn(async () => {});
    showStartScreen(root, false, onStart);
    click();
    await flush();
    expect(isLeaving()).toBe(true);
    click();
    await flush();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('失敗した後に押し直すと、開始処理がもう一度走る', async () => {
    const onStart = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    showStartScreen(root, false, onStart);
    click();
    await flush();
    click();
    await flush();
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(isLeaving()).toBe(true);
  });
});

describe('スタート画面を取り除く', () => {
  /** 画面の要素から transitionend を投げる（jsdom に TransitionEvent が無い場合に備えて propertyName を足す） */
  const transitionEnd = (target: Element, propertyName: string) => {
    const e = new Event('transitionend', { bubbles: true });
    Object.defineProperty(e, 'propertyName', { value: propertyName });
    target.dispatchEvent(e);
  };
  const attached = () => root.querySelector('.start') !== null;

  async function startAndClose() {
    showStartScreen(root, false, async () => {});
    click();
    await flush();
    expect(isLeaving()).toBe(true);
  }

  it('子要素（ボタン等）の transitionend では取り除かない', async () => {
    await startAndClose();
    transitionEnd(button(), 'opacity');
    expect(attached()).toBe(true);
  });

  it('画面自体の transitionend でも、opacity 以外（visibility 等）では取り除かない', async () => {
    await startAndClose();
    transitionEnd(screen(), 'visibility');
    expect(attached()).toBe(true);
  });

  it('画面自体の opacity の transitionend で取り除く', async () => {
    await startAndClose();
    transitionEnd(screen(), 'opacity');
    expect(attached()).toBe(false);
  });

  it('transition が無い（reduced-motion 等で transitionend が来ない）ときも、少し待てば取り除く', async () => {
    vi.useFakeTimers();
    await startAndClose();
    await vi.advanceTimersByTimeAsync(200);
    expect(attached()).toBe(false);
  });

  it('transition があるときは、その時間が過ぎるまで取り除かず、transitionend が来なくても過ぎたら取り除く', async () => {
    vi.useFakeTimers();
    const style = document.createElement('style');
    style.textContent = '.start { transition-duration: 0.6s, 600ms; transition-delay: 0s; }';
    document.head.appendChild(style);
    try {
      await startAndClose();
      await vi.advanceTimersByTimeAsync(600);
      expect(attached()).toBe(true);
      await vi.advanceTimersByTimeAsync(200);
      expect(attached()).toBe(false);
    } finally {
      style.remove();
    }
  });
});

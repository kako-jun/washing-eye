import { describe, expect, it, vi } from 'vitest';
import { watchPixelRatio } from './stage';

/** matchMedia の代わり。作ったメディアクエリを記録し、change を投げられるようにする */
function fakeWindow(dpr: number) {
  const queries: (EventTarget & { media: string })[] = [];
  const win = {
    devicePixelRatio: dpr,
    matchMedia: (media: string) => {
      const mq = Object.assign(new EventTarget(), { media });
      queries.push(mq);
      return mq as unknown as MediaQueryList;
    },
  };
  return { win, queries };
}

describe('watchPixelRatio', () => {
  it('今の倍率に一致する resolution のメディアクエリを見張る', () => {
    const { win, queries } = fakeWindow(2);
    watchPixelRatio(win, () => {});
    expect(queries.map((q) => q.media)).toEqual(['(resolution: 2dppx)']);
  });

  it('倍率が変わると知らせ、新しい倍率で見張り直す（続けて変わっても毎回知らせる）', () => {
    const { win, queries } = fakeWindow(2);
    const onChange = vi.fn();
    watchPixelRatio(win, onChange);
    win.devicePixelRatio = 1;
    queries[0].dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(queries[1].media).toBe('(resolution: 1dppx)');
    win.devicePixelRatio = 1.5;
    queries[1].dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(queries[2].media).toBe('(resolution: 1.5dppx)');
    // 古いクエリはもう見ない
    queries[0].dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('見張りをやめた後は知らせない', () => {
    const { win, queries } = fakeWindow(2);
    const onChange = vi.fn();
    const stop = watchPixelRatio(win, onChange);
    stop();
    queries[0].dispatchEvent(new Event('change'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

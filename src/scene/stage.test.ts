import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EYE_POSITION, createFirstPersonCamera, watchPixelRatio } from './stage';
import { MIRROR_LAYER, VIEW_ONLY_LAYER } from './layers';
import { Steam } from '../fx/steam';

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

describe('一人称カメラ', () => {
  it('目の位置に置かれる', () => {
    expect(createFirstPersonCamera().position.equals(EYE_POSITION)).toBe(true);
  });

  it('一人称だけの効果（湯気・水しぶき）を描き、鏡だけのもの（頭）は描かない', () => {
    const camera = createFirstPersonCamera();
    expect(camera.layers.isEnabled(0)).toBe(true);
    expect(camera.layers.isEnabled(VIEW_ONLY_LAYER)).toBe(true);
    expect(camera.layers.isEnabled(MIRROR_LAYER)).toBe(false);
    // 実際に湯気が見える
    expect(new Steam(2).points.layers.test(camera.layers)).toBe(true);
  });

  it('PerspectiveCamera を返す', () => {
    expect(createFirstPersonCamera()).toBeInstanceOf(THREE.PerspectiveCamera);
  });
});

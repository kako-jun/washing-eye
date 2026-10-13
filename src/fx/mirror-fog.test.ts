import { describe, expect, it } from 'vitest';
import { CLEAR_RATE, FogMask, REFOG_SECONDS, createUpdateThrottle, mirrorUv } from './mirror-fog';

describe('鏡の曇りマスク', () => {
  it('最初は全体が曇っている', () => {
    const fog = new FogMask(16, 12);
    expect(fog.coverage()).toBe(1);
  });

  it('水が当たった中心は取れ、縁はやわらかく（中心ほど晴れ、半径の外は曇ったまま）', () => {
    const fog = new FogMask(40, 40, 1);
    fog.clear(0.5, 0.5, 0.2, 1);
    expect(fog.sample(0.5, 0.5)).toBe(0);
    const edge = fog.sample(0.5 + 0.16, 0.5); // 半径の 8 割
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(fog.sample(0.5 + 0.3, 0.5)).toBe(1);
    expect(fog.sample(0.5, 0.5 + 0.3)).toBe(1);
  });

  it('少しずつ当てると少しずつ取れる（量に比例し、0 未満にはならない）', () => {
    const fog = new FogMask(20, 20, 1);
    fog.clear(0.5, 0.5, 0.2, 0.25);
    expect(fog.sample(0.5, 0.5)).toBeCloseTo(0.75, 6);
    for (let i = 0; i < 10; i++) fog.clear(0.5, 0.5, 0.2, 0.25);
    expect(fog.sample(0.5, 0.5)).toBe(0);
  });

  it('縦横比を考えて、当たった範囲は鏡の上で円になる', () => {
    // 幅 2・高さ 1 の鏡（aspect 0.5）で半径 0.1（幅基準）: 横は uv で 0.1、縦は uv で 0.2 まで届く
    const fog = new FogMask(80, 40, 0.5);
    fog.clear(0.5, 0.5, 0.1, 1);
    expect(fog.sample(0.5, 0.5 + 0.15)).toBeLessThan(1);
    expect(fog.sample(0.5 + 0.15, 0.5)).toBe(1);
  });

  it('半径・量が 0 以下なら何も変えない', () => {
    const fog = new FogMask(8, 8);
    expect(fog.clear(0.5, 0.5, 0, 1)).toBe(false);
    expect(fog.clear(0.5, 0.5, 0.3, 0)).toBe(false);
    expect(fog.coverage()).toBe(1);
  });

  it('取れた所は時間をかけて再び曇る（REFOG_SECONDS で完全に戻る、数十秒）', () => {
    expect(REFOG_SECONDS).toBeGreaterThanOrEqual(20);
    const fog = new FogMask(20, 20, 1);
    fog.clear(0.5, 0.5, 0.3, 1);
    fog.update(REFOG_SECONDS / 2);
    expect(fog.sample(0.5, 0.5)).toBeCloseTo(0.5, 6);
    fog.update(REFOG_SECONDS / 2);
    expect(fog.sample(0.5, 0.5)).toBeCloseTo(1, 6);
    expect(fog.update(1)).toBe(false); // 曇りきったら変化なし
  });

  it('全開の水なら 1 秒もかからず中心が晴れる（CLEAR_RATE。再び曇る分を差し引いても）', () => {
    const fog = new FogMask(20, 20, 1);
    const dt = 1 / 60;
    let t = 0;
    while (fog.sample(0.5, 0.5) > 0.01 && t < 2) {
      fog.clear(0.5, 0.5, 0.2, CLEAR_RATE * 1 * dt);
      fog.update(dt);
      t += dt;
    }
    expect(t).toBeLessThan(1);
  });

  it('画素列へは上の行から書く（下端の格子が最後の行になる）', () => {
    const fog = new FogMask(2, 2, 1);
    fog.clear(0.25, 0.25, 0.3, 1); // 左下を晴らす
    const px = new Uint8ClampedArray(2 * 2 * 4);
    fog.writeTo(px);
    const g = (x: number, y: number) => px[(y * 2 + x) * 4 + 1];
    expect(g(0, 1)).toBeLessThan(255); // 画素の左下
    expect(g(1, 0)).toBe(255); // 画素の右上は曇ったまま
    expect(px[3]).toBe(255);
  });
});

describe('鏡の上の点の uv', () => {
  const mirror = { center: { x: 0, y: 1 }, width: 0.8, height: 0.6 };

  it('中心は (0.5, 0.5)、左下の角は (0, 0)、右上の角は (1, 1)', () => {
    expect(mirrorUv({ x: 0, y: 1 }, mirror)).toEqual({ u: 0.5, v: 0.5 });
    expect(mirrorUv({ x: -0.4, y: 0.7 }, mirror)).toEqual({ u: 0, v: 0 });
    const tr = mirrorUv({ x: 0.4, y: 1.3 }, mirror)!;
    expect(tr.u).toBeCloseTo(1, 9);
    expect(tr.v).toBeCloseTo(1, 9);
  });

  it('鏡の外なら null', () => {
    expect(mirrorUv({ x: 0.5, y: 1 }, mirror)).toBeNull();
    expect(mirrorUv({ x: 0, y: 0.5 }, mirror)).toBeNull();
  });
});

describe('反射の描き直しの間引き', () => {
  it('every=2 なら 1 フレームおき', () => {
    const due = createUpdateThrottle(2);
    expect([due(), due(), due(), due()]).toEqual([true, false, true, false]);
  });

  it('every=1 以下なら毎フレーム', () => {
    const due = createUpdateThrottle(1);
    expect([due(), due(), due()]).toEqual([true, true, true]);
    const due0 = createUpdateThrottle(0);
    expect([due0(), due0()]).toEqual([true, true]);
  });
});

import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Steam, activeShare, steamWind } from './steam';

const seedAttr = (s: Steam) => s.points.geometry.getAttribute('aSeed') as THREE.BufferAttribute;

describe('湯気', () => {
  it('粒が入れ替わったフレームでは、大きさの種（aSeed）を GPU に送り直す', () => {
    const steam = new Steam(4);
    const before = seedAttr(steam).version;
    steam.update(20); // 寿命を超えて全部入れ替わる
    expect(seedAttr(steam).version).toBeGreaterThan(before);
  });

  it('入れ替わりの無いフレームでは、aSeed は送り直さない', () => {
    const steam = new Steam(4);
    steam.update(20); // 全部入れ替えて寿命を 0 からにそろえる
    const before = seedAttr(steam).version;
    steam.update(0.001);
    expect(seedAttr(steam).version).toBe(before);
  });
});

describe('湯気の漂い方', () => {
  const alphaSum = (s: Steam) => {
    const a = s.points.geometry.getAttribute('aAlpha').array as Float32Array;
    return a.reduce((m, v) => m + v, 0);
  };
  const meanPos = (s: Steam, axis: number) => {
    const p = s.points.geometry.getAttribute('position').array as Float32Array;
    let sum = 0;
    for (let i = axis; i < p.length; i += 3) sum += p[i];
    return sum / (p.length / 3);
  };

  it('ふだんの風はごく弱く、ゆっくり向きを変える（穏やか）', () => {
    for (let t = 0; t < 120; t += 7) {
      const w = steamWind(t, 0);
      expect(Math.hypot(w.x, w.z)).toBeLessThan(0.04);
    }
    const a = steamWind(0, 0);
    const b = steamWind(30, 0);
    expect(a).not.toEqual(b);
  });

  it('水が出ているときは、シャワーから離れる向き（左手前: x が負、z が正）へ少し強く流れる', () => {
    let x = 0;
    let z = 0;
    for (let t = 0; t < 120; t += 1) {
      const w = steamWind(t, 1);
      x += w.x;
      z += w.z;
    }
    expect(x / 120).toBeLessThan(-0.03);
    expect(z / 120).toBeGreaterThan(0.02);
    expect(Math.hypot(steamWind(0, 1).x, steamWind(0, 1).z)).toBeLessThan(0.15);
  });

  it('見えている粒の割合は水が出ているほど増える（範囲外の値は 0〜1 に収める）', () => {
    expect(activeShare(0)).toBeLessThan(activeShare(0.5));
    expect(activeShare(0.5)).toBeLessThan(activeShare(1));
    expect(activeShare(1)).toBe(1);
    expect(activeShare(-1)).toBe(activeShare(0));
    expect(activeShare(2)).toBe(1);
  });

  it('水が出ていると、しばらくして湯気が濃くなり、左手前へ流れる', () => {
    const calm = new Steam(60);
    const flowing = new Steam(60);
    // 粒の並びをそろえるため、同じ初期状態から比べる
    (flowing as any).pos.set((calm as any).pos);
    (flowing as any).life.set((calm as any).life);
    (flowing as any).speed.set((calm as any).speed);
    (flowing as any).seed.set((calm as any).seed);
    // 2 秒の間に入れ替わり（乱数で位置が変わる）が起きないよう、寿命の始めにそろえる
    (calm as any).life.fill(0.2);
    (flowing as any).life.fill(0.2);
    flowing.setFlow(1);
    for (let i = 0; i < 120; i++) {
      calm.update(1 / 60);
      flowing.update(1 / 60);
    }
    expect(alphaSum(flowing)).toBeGreaterThan(alphaSum(calm));
    expect(meanPos(flowing, 0)).toBeLessThan(meanPos(calm, 0));
    expect(meanPos(flowing, 2)).toBeGreaterThan(meanPos(calm, 2));
  });
});

describe('湯気の量と立ちのぼり方（水の出方による違い）', () => {
  /** 粒の状態をそろえた湯気（入れ替わりが起きないよう寿命の途中、速さ・種も一定） */
  function steady(flow: number, count = 20) {
    const s = new Steam(count);
    const any = s as any;
    any.life.fill(0.5);
    any.speed.fill(0.1);
    any.seed.fill(0);
    any.pos.fill(0);
    s.setFlow(flow);
    return s;
  }
  const life = (s: Steam, i = 0) => (s as any).life[i] as number;
  const y = (s: Steam, i = 0) => (s as any).pos[i * 3 + 1] as number;
  const alpha = (s: Steam, i: number) => (s.points.geometry.getAttribute('aAlpha').array as Float32Array)[i];

  it('水が出ていると寿命が 1.5 倍の速さで進む（入れ替わりが早い）', () => {
    const calm = steady(0);
    const flowing = steady(1);
    calm.update(0.1);
    flowing.update(0.1);
    expect(life(calm) - 0.5).toBeCloseTo(0.1 * 0.1, 6);
    expect(life(flowing) - 0.5).toBeCloseTo(0.1 * 0.1 * 1.5, 6);
  });

  it('水が出ていると 1.8 倍の速さで立ちのぼる', () => {
    const calm = steady(0);
    const flowing = steady(1);
    calm.update(0.1);
    flowing.update(0.1);
    expect(y(calm)).toBeCloseTo(0.06 * 0.1, 6);
    expect(y(flowing)).toBeCloseTo(0.06 * 1.8 * 0.1, 6);
  });

  it('ふだんは後ろの粒（全体の 45%）が見えず、水が出るとふわっと見えてくる', () => {
    const n = 20;
    const s = steady(0, n);
    s.update(1 / 60);
    expect(alpha(s, n - 1)).toBe(0);
    expect(alpha(s, 0)).toBeGreaterThan(0);
    s.setFlow(1);
    s.update(1 / 60);
    const early = alpha(s, n - 1);
    expect(early).toBeGreaterThan(0);
    for (let i = 0; i < 180; i++) s.update(1 / 60);
    expect(alpha(s, n - 1)).toBeGreaterThan(early * 5); // 急に出ず、時間をかけて濃くなる
  });

  it('水が止まると、増えた粒はふわっと消えていく', () => {
    const n = 20;
    const s = steady(1, n);
    for (let i = 0; i < 300; i++) s.update(1 / 60);
    (s as any).life.fill(0.5);
    s.setFlow(0);
    s.update(1 / 60);
    const justAfter = alpha(s, n - 1);
    expect(justAfter).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) {
      (s as any).life.fill(0.5);
      s.update(1 / 60);
    }
    expect(alpha(s, n - 1)).toBeLessThan(justAfter * 0.1);
  });
});

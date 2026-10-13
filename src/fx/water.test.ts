import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HandShowerAim, RINSE_MIN_FLOW, rinseTargets, waterLevel } from './water';

const hit = (x: number) => ({ point: new THREE.Vector3(x, 0, 0), normal: new THREE.Vector3(0, 0, 1) });

describe('手持ちシャワーの水の落ちる点', () => {
  it('水を出している間は当て先に追従する', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0.1), true);
    expect(aim.point.x).toBeCloseTo(0.1, 9);
    expect(aim.onBody).toBe(true);
    aim.track(hit(0.3), true);
    expect(aim.point.x).toBeCloseTo(0.3, 9);
  });

  it('ホバー（水を出していない）では動かない（止めたあと水が引く間に、ホバーで流す位置が付いてこない）', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0.1), true);
    aim.track(hit(0.5), false);
    aim.track(null, false);
    expect(aim.point.x).toBeCloseTo(0.1, 9);
    expect(aim.onBody).toBe(true);
  });

  it('水を出したまま体から外れると、最後の点を保ち、体には当たっていない扱いになる', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0.2), true);
    aim.track(null, true);
    expect(aim.point.x).toBeCloseTo(0.2, 9);
    expect(aim.onBody).toBe(false);
  });

  it('ヘッドは当て先から体の外側（法線方向）と目の側に離れた位置', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0), true);
    const head = aim.headFrom(new THREE.Vector3(0, 0, 1), new THREE.Vector3());
    expect(head.z).toBeCloseTo(0.24, 9);
    expect(head.x).toBeCloseTo(0, 9);
  });
});

describe('泡を流す中心と水の量', () => {
  const p1 = new THREE.Vector3(1, 0, 0);
  const p2 = new THREE.Vector3(2, 0, 0);

  it('泡は水の落ちる点を中心に流す（固定は視線の中心、手持ちは当て先。両方出ていれば両方）', () => {
    const r = rinseTargets([
      { flow: 0.8, point: p1 },
      { flow: 0.6, point: p2 },
    ]);
    expect(r).toEqual([
      { point: p1, flow: 0.8 },
      { point: p2, flow: 0.6 },
    ]);
  });

  it('体に当たっていない水・出始めのわずかな水では流さない', () => {
    expect(rinseTargets([{ flow: 1, point: null }])).toEqual([]);
    expect(rinseTargets([{ flow: RINSE_MIN_FLOW, point: p1 }])).toEqual([]);
    expect(rinseTargets([{ flow: RINSE_MIN_FLOW + 0.01, point: p1 }])).toHaveLength(1);
  });

  it('水音・湯気の水の量は強い方に合わせる（当たっていない水も数える）', () => {
    expect(waterLevel([{ flow: 0.3, point: p1 }, { flow: 0.7, point: null }])).toBe(0.7);
    expect(waterLevel([{ flow: 0, point: null }, { flow: 0, point: null }])).toBe(0);
  });
});

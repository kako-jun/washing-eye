import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HandShowerAim, RINSE_MIN_FLOW, mirrorTargets, rinseTargets, waterLevel, waterSources } from './water';

const hit = (x: number) => ({ point: new THREE.Vector3(x, 0, 0), normal: new THREE.Vector3(0, 0, 1) });

describe('手持ちシャワーの水の落ちる点', () => {
  it('水を出している間は当て先に追従する', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0.1), true);
    expect(aim.point.x).toBeCloseTo(0.1, 9);
    expect(aim.surface).toBe('body');
    aim.track(hit(0.3), true);
    expect(aim.point.x).toBeCloseTo(0.3, 9);
  });

  it('ホバー（水を出していない）では動かない（止めたあと水が引く間に、ホバーで流す位置が付いてこない）', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0.1), true);
    aim.track(hit(0.5), false);
    aim.track(null, false);
    expect(aim.point.x).toBeCloseTo(0.1, 9);
    expect(aim.surface).toBe('body');
  });

  it('水を出したまま体から外れると、最後の点を保ち、体には当たっていない扱いになる', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0.2), true);
    aim.track(null, true);
    expect(aim.point.x).toBeCloseTo(0.2, 9);
    expect(aim.surface).toBeNull();
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

describe('2 つのシャワーの水をまとめる（main と同じ組み立て）', () => {
  it('固定シャワーは視線の中心が体に当たっていればその点、手持ちシャワーは水が体に当たっていれば落ちる点', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0.4), true);
    const center = new THREE.Vector3(0, 0.5, 0);
    const water = waterSources({ flow: 0.9, hit: { point: center, normal: new THREE.Vector3(0, 0, 1) } }, { flow: 0.5, aim });
    expect(water).toEqual([
      { flow: 0.9, point: center, kind: 'body' },
      { flow: 0.5, point: aim.point, kind: 'body' },
    ]);
    expect(rinseTargets(water).map((r) => r.point)).toEqual([center, aim.point]);
    expect(waterLevel(water)).toBe(0.9);
  });

  it('視線の中心が体から外れている・手持ちの水が体から外れていれば、その水では泡を流さない（水の量には数える）', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0.4), true);
    aim.track(null, true);
    const water = waterSources({ flow: 0.9, hit: null }, { flow: 0.95, aim });
    expect(rinseTargets(water)).toEqual([]);
    expect(waterLevel(water)).toBe(0.95);
  });

  it('手持ちの水を止めたあと（水が引く間）にホバーが動いても、流す点は止めた位置のまま', () => {
    const aim = new HandShowerAim();
    aim.track(hit(0.2), true);
    aim.track(hit(0.7), false); // ホバー
    const [, hand] = waterSources({ flow: 0, hit: null }, { flow: 0.5, aim });
    expect(hand.point!.x).toBeCloseTo(0.2, 9);
  });
});

describe('鏡に当たる水', () => {
  const mirrorHit = (x: number) => ({
    point: new THREE.Vector3(x, 1, -1.1),
    normal: new THREE.Vector3(0, 0, 1),
    kind: 'mirror' as const,
  });

  it('手持ちシャワーの水が鏡に当たると、鏡に当たっている扱いになり、体には当たっていない', () => {
    const aim = new HandShowerAim();
    aim.track(mirrorHit(0.1), true);
    expect(aim.surface).toBe('mirror');
  });

  it('鏡に当てているときのヘッドは、鏡の手前で宙に浮かず、手を前に伸ばした位置（目の前やや下、体の近く）', () => {
    const aim = new HandShowerAim();
    aim.track(mirrorHit(0), true);
    const eye = new THREE.Vector3(0, 0.8, -0.03);
    const head = aim.headFrom(eye, new THREE.Vector3());
    expect(head.distanceTo(eye)).toBeLessThan(0.5);
    expect(head.y).toBeLessThan(eye.y);
    expect(head.z).toBeLessThan(eye.z); // 前（鏡の側）に伸ばす
    expect(head.distanceTo(aim.point)).toBeGreaterThan(0.5); // 鏡からは離れている
  });

  it('固定シャワーの視線の中心が鏡に当たれば、その点で鏡の曇りを取り、泡は流さない', () => {
    const aim = new HandShowerAim();
    const hit = mirrorHit(0);
    const water = waterSources({ flow: 0.8, hit }, { flow: 0, aim });
    expect(mirrorTargets(water)).toEqual([{ point: hit.point, flow: 0.8 }]);
    expect(rinseTargets(water)).toEqual([]);
  });

  it('手持ちシャワーの当て先が鏡なら、その点で鏡の曇りを取る（固定シャワーが体に当たっていれば、そちらは泡を流す）', () => {
    const aim = new HandShowerAim();
    aim.track(mirrorHit(0.2), true);
    const body = { point: new THREE.Vector3(0, 0.4, 0), normal: new THREE.Vector3(0, 1, 0) };
    const water = waterSources({ flow: 0.7, hit: body }, { flow: 0.6, aim });
    expect(mirrorTargets(water)).toEqual([{ point: aim.point, flow: 0.6 }]);
    expect(rinseTargets(water)).toEqual([{ point: body.point, flow: 0.7 }]);
  });

  it('出始めのわずかな水では鏡の曇りは取れない', () => {
    const water = waterSources({ flow: RINSE_MIN_FLOW, hit: mirrorHit(0) }, { flow: 0, aim: new HandShowerAim() });
    expect(mirrorTargets(water)).toEqual([]);
  });
});

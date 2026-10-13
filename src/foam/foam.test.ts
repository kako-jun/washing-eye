import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Foam } from './foam';

const UP = new THREE.Vector3(0, 1, 0);
const EPS = 1e-6;
/**
 * update の dt。時計が π/2.2 の倍数になり、揺れ（sin(clock*2.2+phase)、phase=π 固定）が 0 になる。
 * 1 回で補間もほぼ収束する（1-exp(-dt*10)）ので、行列のスケールから半径を読める。
 */
const SETTLE_DT = Math.PI / 2.2;

const v = (x: number, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** 行列から位置とスケール（x 成分）を読む */
function readInstance(foam: Foam, i: number) {
  const m = new THREE.Matrix4();
  foam.mesh.getMatrixAt(i, m);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return { pos, scale, m };
}

function targetOf(foam: Foam, i: number): number {
  return (foam as any).target[i] as number;
}

function settle(foam: Foam, times = 2) {
  for (let k = 0; k < times; k++) foam.update(SETTLE_DT);
}

beforeEach(() => {
  // target = radius * (0.75 + 0.5*0.5) = radius、phase = π に固定
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Foam.add', () => {
  it('空の状態で足すと泡が 1 つになり、update 後に描画数も 1 になる', () => {
    const foam = new Foam(8);
    foam.add(v(0), UP, 0.1);
    expect(foam.active).toBe(1);
    expect(foam.mesh.count).toBe(0);
    foam.update(0.016);
    expect(foam.mesh.count).toBe(1);
  });

  it('既存の泡から 0.9r 未満の点に足すと、新しい泡を作らずに既存の泡が膨らむ', () => {
    const r = 0.1;
    const foam = new Foam(8);
    foam.add(v(0), UP, r);
    const before = targetOf(foam, 0);
    foam.add(v(r * 0.9 - EPS), UP, r);
    expect(foam.active).toBe(1);
    expect(targetOf(foam, 0)).toBeGreaterThan(before);
  });

  it('既存の泡からちょうど 0.9r の点に足すと、新しい泡になる（結合は距離 < 0.9r のみ）', () => {
    const r = 0.1;
    const foam = new Foam(8);
    foam.add(v(0), UP, r);
    foam.add(v(r * 0.9), UP, r);
    expect(foam.active).toBe(2);
  });

  it('既存の泡から 0.9r を超える点に足すと、新しい泡になる', () => {
    const r = 0.1;
    const foam = new Foam(8);
    foam.add(v(0), UP, r);
    foam.add(v(r * 0.9 + EPS), UP, r);
    expect(foam.active).toBe(2);
  });

  it('同じ点に何度足しても、泡の大きさは 1.6r で頭打ちになる', () => {
    const r = 0.1;
    const foam = new Foam(8);
    for (let k = 0; k < 20; k++) foam.add(v(0), UP, r);
    expect(foam.active).toBe(1);
    settle(foam);
    // 行列のスケール x は 半径 × 揺れ（ここでは揺れ 1）
    expect(readInstance(foam, 0).scale.x).toBeCloseTo(r * 1.6, 5);
  });

  it('上限まで 1 つ空きがあるときに足すと、泡が増える', () => {
    const foam = new Foam(4);
    for (let k = 0; k < 3; k++) foam.add(v(k), UP, 0.1);
    foam.add(v(3), UP, 0.1);
    expect(foam.active).toBe(4);
  });

  it('上限ちょうどの状態で足しても、泡の数は上限のまま', () => {
    const foam = new Foam(4);
    for (let k = 0; k < 4; k++) foam.add(v(k), UP, 0.1);
    foam.add(v(10), UP, 0.1);
    expect(foam.active).toBe(4);
  });

  it('上限に達した後に足すと、いちばん古く生まれた泡（index 0 とは限らない）を上書きする', () => {
    const foam = new Foam(4);
    foam.add(v(0), UP, 0.1); // A idx0 born0
    foam.update(1);
    foam.add(v(1), UP, 0.1); // B idx1 born1
    foam.update(1);
    foam.add(v(2), UP, 0.1); // C idx2 born2
    foam.update(1);
    foam.add(v(3), UP, 0.1); // D idx3 born3
    // A を流して消す → D が idx0 に詰められる
    foam.rinse(v(0), 0.2, 100, 1);
    foam.update(1);
    expect(foam.active).toBe(3);
    foam.add(v(4), UP, 0.1); // E idx3 born4
    expect(foam.active).toBe(4);
    // 満杯。最古は B（idx1）
    foam.add(v(5), UP, 0.1);
    foam.update(SETTLE_DT);
    expect(readInstance(foam, 0).pos.x).toBeCloseTo(3); // D は残る
    expect(readInstance(foam, 1).pos.x).toBeCloseTo(5); // B が新しい泡に置き換わる
    expect(readInstance(foam, 2).pos.x).toBeCloseTo(2);
    expect(readInstance(foam, 3).pos.x).toBeCloseTo(4);
  });

  it('上限時の上書き先は、生まれた時刻が同じなら index の小さい方', () => {
    const foam = new Foam(4);
    foam.add(v(0), UP, 0.1); // A idx0 born0
    foam.add(v(1), UP, 0.1); // B idx1 born0
    foam.add(v(2), UP, 0.1); // C idx2 born0
    foam.update(1);
    foam.add(v(3), UP, 0.1); // D idx3 born1
    foam.rinse(v(0), 0.2, 100, 1);
    foam.update(1); // A を消す → D が idx0（born1）
    foam.add(v(4), UP, 0.1); // E idx3 born2
    // B（idx1）と C（idx2）が同じ born0 で最古
    foam.add(v(5), UP, 0.1);
    foam.update(SETTLE_DT);
    expect(readInstance(foam, 1).pos.x).toBeCloseTo(5);
    expect(readInstance(foam, 2).pos.x).toBeCloseTo(2);
  });

  it('消えて空きができた後に足すと、最古の上書きではなく末尾に追加する', () => {
    const foam = new Foam(3);
    foam.add(v(0), UP, 0.1); // A born0
    foam.update(1);
    foam.add(v(1), UP, 0.1); // B born1
    foam.update(1);
    foam.add(v(2), UP, 0.1); // C born2
    foam.rinse(v(1), 0.2, 100, 1);
    foam.update(1); // B を消す → C が idx1
    expect(foam.active).toBe(2);
    foam.add(v(7), UP, 0.1);
    foam.update(SETTLE_DT);
    expect(foam.active).toBe(3);
    expect(readInstance(foam, 0).pos.x).toBeCloseTo(0); // 最古の A は上書きされない
    expect(readInstance(foam, 2).pos.x).toBeCloseTo(7);
  });
});

describe('Foam.rinse', () => {
  it('流す範囲の半径より内側の泡は縮み、touched に数えられる', () => {
    const r = 0.5;
    const foam = new Foam(8);
    foam.add(v(0), UP, 0.1);
    const before = targetOf(foam, 0);
    expect(foam.rinse(v(r - EPS), r, 2, 0.1)).toBe(1);
    expect(targetOf(foam, 0)).toBeLessThan(before);
  });

  it('流す範囲の半径ちょうどの距離にある泡は縮まない（範囲は距離 < 半径）', () => {
    const r = 0.5;
    const foam = new Foam(8);
    foam.add(v(0), UP, 0.1);
    const before = targetOf(foam, 0);
    expect(foam.rinse(v(r), r, 2, 0.1)).toBe(0);
    expect(targetOf(foam, 0)).toBe(before);
  });

  it('流す範囲の半径より外側の泡は縮まない', () => {
    const r = 0.5;
    const foam = new Foam(8);
    foam.add(v(0), UP, 0.1);
    const before = targetOf(foam, 0);
    expect(foam.rinse(v(r + EPS), r, 2, 0.1)).toBe(0);
    expect(targetOf(foam, 0)).toBe(before);
  });

  it('流す範囲の中心にある泡は、縁に近い泡より速く縮む', () => {
    const foam = new Foam(8);
    foam.add(v(0), UP, 0.01); // 中心
    foam.add(v(0.9), UP, 0.01); // 縁の近く
    const before0 = targetOf(foam, 0);
    const before1 = targetOf(foam, 1);
    expect(foam.rinse(v(0), 1, 2, 0.1)).toBe(2);
    const ratioCenter = targetOf(foam, 0) / before0;
    const ratioEdge = targetOf(foam, 1) / before1;
    expect(ratioCenter).toBeLessThan(ratioEdge);
  });

  it('泡が 1 つもないときの rinse は 0 を返し、update も例外を出さない', () => {
    const foam = new Foam(8);
    expect(foam.rinse(v(0), 1, 2, 0.1)).toBe(0);
    expect(() => foam.update(0.016)).not.toThrow();
    expect(foam.mesh.count).toBe(0);
  });
});

describe('Foam.update', () => {
  it('目標の大きさが 0.0015 未満の泡は消え、ちょうど 0.0015 の泡は残る', () => {
    const foam = new Foam(8);
    foam.add(v(0), UP, 0.1);
    foam.add(v(1), UP, 0.1);
    // 内部は Float32 だが、0.0015 の Float32 表現（0.00150000001…）は 0.0015 以上なので残る
    (foam as any).target[0] = 0.0015;
    (foam as any).target[1] = 0.00149;
    foam.update(0.016);
    expect(foam.active).toBe(1);
    foam.update(SETTLE_DT);
    expect(readInstance(foam, 0).pos.x).toBeCloseTo(0);
  });

  it('間の泡が消えて詰め直された後も、残った泡の位置と大きさは消える前と同じ', () => {
    const foam = new Foam(8);
    foam.add(v(0), UP, 0.1); // A idx0
    foam.add(v(1), UP, 0.2); // B idx1
    foam.add(v(2), UP, 0.3); // C idx2
    settle(foam);
    const a = readInstance(foam, 0);
    const c = readInstance(foam, 2);
    foam.rinse(v(1), 0.2, 100, 1);
    settle(foam);
    expect(foam.active).toBe(2);
    const a2 = readInstance(foam, 0);
    const c2 = readInstance(foam, 1); // C は idx1 に詰められる
    expect(a2.pos.distanceTo(a.pos)).toBeLessThan(1e-5);
    expect(a2.scale.x).toBeCloseTo(a.scale.x, 5);
    expect(c2.pos.distanceTo(c.pos)).toBeLessThan(1e-5);
    expect(c2.scale.x).toBeCloseTo(c.scale.x, 5);
  });

  it('全部消えた後に足すと index 0 から使い直し、描画数が 0 から 1 になる', () => {
    const foam = new Foam(4);
    for (let k = 0; k < 4; k++) foam.add(v(k * 0.1), UP, 0.05);
    foam.update(0.016);
    foam.rinse(v(0.15), 5, 100, 1);
    foam.update(0.016);
    expect(foam.active).toBe(0);
    expect(foam.mesh.count).toBe(0);
    foam.add(v(3), UP, 0.1);
    foam.update(SETTLE_DT);
    expect(foam.active).toBe(1);
    expect(foam.mesh.count).toBe(1);
    expect(readInstance(foam, 0).pos.x).toBeCloseTo(3);
  });

  it('足す・流す・進めるを繰り返した後も、すべてのインスタンス行列が有限値', () => {
    vi.restoreAllMocks();
    // 再現できる擬似乱数
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    vi.spyOn(Math, 'random').mockImplementation(rand);
    const foam = new Foam(64);
    const n = new THREE.Vector3();
    for (let step = 0; step < 300; step++) {
      for (let k = 0; k < 5; k++) {
        n.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
        foam.add(v(rand() - 0.5, rand() - 0.5, rand() - 0.5), n, 0.02 + rand() * 0.05);
      }
      if (step % 3 === 0) foam.rinse(v(rand() - 0.5, rand() - 0.5, rand() - 0.5), 0.3, 3, 0.016);
      foam.update(0.016);
    }
    expect(foam.mesh.count).toBe(foam.active);
    const m = new THREE.Matrix4();
    for (let i = 0; i < foam.mesh.count; i++) {
      foam.mesh.getMatrixAt(i, m);
      for (const e of m.elements) expect(Number.isFinite(e)).toBe(true);
    }
  });
});

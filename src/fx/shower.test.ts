import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Shower } from './shower';

/** 水筋（線分）の端点のうち、まだ水が出ている粒の位置 */
function streakPoints(shower: Shower): THREE.Vector3[] {
  const lines = shower.group.children[0] as THREE.LineSegments;
  const arr = lines.geometry.getAttribute('position').array as Float32Array;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < arr.length; i += 6) pts.push(new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2]));
  return pts;
}

describe('シャワーの水', () => {
  it('ヘッドの位置と狙い点を外から変えると、水はその間を流れる（固定ヘッドから離れる）', () => {
    const shower = new Shower(new THREE.Vector3(5, 5, 5), 40);
    const head = new THREE.Vector3(0, 0.6, -0.3);
    const target = new THREE.Vector3(0, 0.4, -0.1);
    shower.setHead(head);
    shower.aim(target);
    shower.setOn(true);
    // 古い水滴が入れ替わるまで回す
    for (let i = 0; i < 240; i++) shower.update(1 / 60, null);
    const box = new THREE.Box3().setFromPoints([head, target]).expandByScalar(0.12);
    for (const p of streakPoints(shower)) expect(box.containsPoint(p)).toBe(true);
  });

  it('止めると水の出方（flowLevel）が 0 に向かって下がる', () => {
    const shower = new Shower(new THREE.Vector3(0, 1, 0), 20);
    shower.aim(new THREE.Vector3(0, 0, 0));
    shower.setOn(true);
    for (let i = 0; i < 60; i++) shower.update(1 / 60, null);
    const on = shower.flowLevel;
    expect(on).toBeGreaterThan(0.9);
    shower.setOn(false);
    for (let i = 0; i < 120; i++) shower.update(1 / 60, null);
    expect(shower.flowLevel).toBeLessThan(0.01);
    expect(shower.group.visible).toBe(false);
  });

  it('止まっていた水を出し直すと、最初のフレームから今のヘッドと狙い点の間を流れる（前の位置の水滴が残らない）', () => {
    const shower = new Shower(new THREE.Vector3(0, 1.5, -1), 40);
    shower.aim(new THREE.Vector3(0, 0, 0));
    shower.setOn(true);
    for (let i = 0; i < 60; i++) shower.update(1 / 60, null);
    shower.setOn(false);
    for (let i = 0; i < 120; i++) shower.update(1 / 60, null);
    // 別の場所で出し直す
    const head = new THREE.Vector3(0.5, 0.6, 0.3);
    const target = new THREE.Vector3(0.5, 0.4, 0.4);
    shower.setHead(head);
    shower.aim(target);
    shower.setOn(true);
    for (let i = 0; i < 3; i++) shower.update(1 / 60, null);
    const box = new THREE.Box3().setFromPoints([head, target]).expandByScalar(0.12);
    for (const p of streakPoints(shower)) expect(box.containsPoint(p)).toBe(true);
  });
});

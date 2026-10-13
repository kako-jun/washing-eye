import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AimMarker } from './aim-marker';

const hit = (x: number) => ({ point: new THREE.Vector3(x, 0, 0), normal: new THREE.Vector3(0, 0, 1) });
const run = (m: AimMarker, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) m.update(1 / 60);
};

describe('当て先の目印', () => {
  it('最初は見えない', () => {
    const m = new AimMarker();
    m.update(1 / 60);
    expect(m.mesh.visible).toBe(false);
  });

  it('当て先を与えると、その点（法線方向に少し浮かせた位置）に現れる', () => {
    const m = new AimMarker();
    m.setTarget(hit(0.3), false);
    run(m, 0.5);
    expect(m.mesh.visible).toBe(true);
    expect(m.mesh.position.x).toBeCloseTo(0.3, 3);
    expect(m.mesh.position.z).toBeGreaterThan(0);
  });

  it('水を出している間は、ホバー中より明るい', () => {
    const m = new AimMarker();
    m.setTarget(hit(0), false);
    run(m, 1);
    const hover = m.opacity;
    m.setTarget(hit(0), true);
    run(m, 1);
    expect(m.opacity).toBeGreaterThan(hover);
  });

  it('当て先が null になると消える', () => {
    const m = new AimMarker();
    m.setTarget(hit(0), true);
    run(m, 1);
    m.setTarget(null, false);
    run(m, 1);
    expect(m.mesh.visible).toBe(false);
  });

  it('当て先が動くと追従する', () => {
    const m = new AimMarker();
    m.setTarget(hit(0), false);
    run(m, 0.5);
    m.setTarget(hit(0.2), false);
    run(m, 0.5);
    expect(m.mesh.position.x).toBeCloseTo(0.2, 3);
  });
});

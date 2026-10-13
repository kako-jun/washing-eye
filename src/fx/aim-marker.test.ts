import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AIM_MARKER_COLOR, AimMarker } from './aim-marker';
import { WATER_STREAK_COLOR } from './shower';
import { WALL_COLOR } from '../scene/stage';
import { MIRROR_FOG_COLOR } from '../scene/mirror';
import { DEFAULT_BODY } from '../body/params';

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

  it('水を出している間は、ホバー中より濃く（不透明に）示す', () => {
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

describe('目印の色', () => {
  const lum = (c: THREE.ColorRepresentation) => {
    const col = new THREE.Color(c);
    return 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
  };

  it('明るい壁・曇った鏡・肌の上でも紛れないよう、それらよりはっきり暗い', () => {
    for (const bg of [WALL_COLOR, MIRROR_FOG_COLOR, DEFAULT_BODY.skinColor]) {
      expect(lum(bg) - lum(AIM_MARKER_COLOR)).toBeGreaterThan(0.3);
    }
  });

  it('水筋と同じ水色の系統で、水筋より濃い', () => {
    const marker = new THREE.Color(AIM_MARKER_COLOR).getHSL({ h: 0, s: 0, l: 0 });
    const water = new THREE.Color(WATER_STREAK_COLOR).getHSL({ h: 0, s: 0, l: 0 });
    expect(Math.abs(marker.h - water.h)).toBeLessThan(0.05);
    expect(lum(AIM_MARKER_COLOR)).toBeLessThan(lum(WATER_STREAK_COLOR));
  });

  it('目印のマテリアルはこの色を使う', () => {
    const m = new AimMarker();
    expect((m.mesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(new THREE.Color(AIM_MARKER_COLOR).getHex());
  });
});

// @vitest-environment jsdom
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MIRROR_LAYER, Mirror } from './mirror';
import { VIEW_ONLY_LAYER, setupFirstPersonLayers } from './layers';
import { MIRROR_SURFACE } from '../input/pointer';
import { REFOG_SECONDS } from '../fx/mirror-fog';
import { createMirrorHead } from '../body/head';
import { DEFAULT_BODY } from '../body/params';

// jsdom はキャンバスの描画を持たないので、getContext は null を返す（曇りの見た目の更新だけ飛ばされる）
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

function mirror() {
  return new Mirror({
    center: new THREE.Vector3(0, 1, -1.1),
    width: 0.8,
    height: 0.6,
    textureSize: 256,
    updateEvery: 2,
    multisample: 0,
  });
}

describe('鏡', () => {
  it('鏡の面は当たり判定の対象で、鏡の印が付いている', () => {
    const m = mirror();
    expect(m.surface.userData.surface).toBe(MIRROR_SURFACE);
    // 面の対角線（三角形の境目）を避けた点を狙う
    const ray = new THREE.Raycaster(new THREE.Vector3(0.1, 1.05, 0), new THREE.Vector3(0, 0, -1));
    m.group.updateMatrixWorld(true);
    const hits = ray.intersectObjects(m.group.children, false);
    // 当たるのは鏡の面だけ（曇りの面・枠は当たり判定から外す）
    expect(hits.map((h) => h.object)).toEqual([m.surface]);
  });

  it('最初は曇っていて、水が当たった所だけ曇りが取れる（鏡の外の点では変わらない）', () => {
    const m = mirror();
    expect(m.fog.coverage()).toBe(1);
    m.clearAt(new THREE.Vector3(5, 1, -1.1), 0.12, 1, 1 / 60);
    expect(m.fog.coverage()).toBe(1);
    for (let i = 0; i < 30; i++) m.clearAt(new THREE.Vector3(0, 1, -1.1), 0.12, 1, 1 / 60);
    expect(m.fog.sample(0.5, 0.5)).toBe(0);
    expect(m.fog.sample(0.05, 0.05)).toBe(1);
  });

  it('水の出方が弱いほど、取れ方もゆっくり', () => {
    const strong = mirror();
    const weak = mirror();
    const p = new THREE.Vector3(0, 1, -1.1);
    strong.clearAt(p, 0.12, 1, 0.1);
    weak.clearAt(p, 0.12, 0.3, 0.1);
    expect(weak.fog.sample(0.5, 0.5)).toBeGreaterThan(strong.fog.sample(0.5, 0.5));
  });

  it('取れた曇りは update で時間をかけて戻る', () => {
    const m = mirror();
    for (let i = 0; i < 60; i++) m.clearAt(new THREE.Vector3(0, 1, -1.1), 0.12, 1, 1 / 60);
    m.update(REFOG_SECONDS);
    expect(m.fog.sample(0.5, 0.5)).toBeCloseTo(1, 6);
  });

  it('鏡の反射用のカメラは鏡用のレイヤーを描き、一人称だけの効果（湯気・しぶき）は描かない', () => {
    const m = mirror();
    const camera = new THREE.PerspectiveCamera();
    setupFirstPersonLayers(camera);
    const reflection = m.surface.getReflectionCamera(camera);
    expect(reflection.layers.isEnabled(MIRROR_LAYER)).toBe(true);
    expect(reflection.layers.isEnabled(VIEW_ONLY_LAYER)).toBe(false);
    expect(camera.layers.isEnabled(MIRROR_LAYER)).toBe(false);
    expect(camera.layers.isEnabled(VIEW_ONLY_LAYER)).toBe(true);
  });
});

describe('鏡に映る頭', () => {
  it('鏡用のレイヤーにだけ置かれ、一人称カメラ（既定のレイヤー）には映らない', () => {
    const head = createMirrorHead(DEFAULT_BODY, MIRROR_LAYER);
    const camera = new THREE.PerspectiveCamera();
    const meshes: THREE.Object3D[] = [];
    head.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
    });
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      expect(m.layers.test(camera.layers)).toBe(false);
      expect(m.layers.isEnabled(MIRROR_LAYER)).toBe(true);
    }
  });

  it('顔の造作は持たない（丸い形と輪郭線だけ）', () => {
    const head = createMirrorHead(DEFAULT_BODY, MIRROR_LAYER);
    const meshes = head.children.filter((o) => (o as THREE.Mesh).isMesh);
    expect(meshes).toHaveLength(2);
  });

  it('当たり判定の対象にならない（シャワーやスポンジが頭に当たらない）', () => {
    const head = createMirrorHead(DEFAULT_BODY, MIRROR_LAYER);
    head.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0.86, 1), new THREE.Vector3(0, 0, -1));
    ray.layers.enableAll();
    expect(ray.intersectObject(head, true)).toEqual([]);
  });
});

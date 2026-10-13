import * as THREE from 'three';
import type { BodyParams } from './params';
import { createToonMaterial } from '../scene/toon';
import { createOutlineMaterial, createOutlineMesh } from '../scene/outline';

/**
 * 鏡にだけ映る抽象的な頭。顔の造作は持たない、少し縦長の丸い形。
 * 一人称カメラは頭の中にあるので、この頭は layer（鏡用）にだけ置き、一人称カメラには映さない。
 */
export function createMirrorHead(params: BodyParams, layer: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mirror-head';
  const geo = new THREE.SphereGeometry(1, 24, 16).scale(0.095, 0.115, 0.1);
  const head = new THREE.Mesh(
    geo,
    createToonMaterial({ color: params.skinColor, rimColor: 0xd6ecff, rimStrength: 0.32 }),
  );
  head.position.set(0, 0.86, 0.0);
  head.raycast = () => {};
  const outline = createOutlineMesh(head, createOutlineMaterial(params.outlineColor, 0.0035));
  outline.raycast = () => {};
  group.add(head, outline);
  group.traverse((o) => o.layers.set(layer));
  return group;
}

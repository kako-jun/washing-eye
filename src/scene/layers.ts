import type * as THREE from 'three';

/**
 * 描き分けのレイヤー。
 * - 0（既定）: 一人称カメラにも鏡の反射にも描く
 * - MIRROR_LAYER: 鏡の反射にだけ描く（鏡に映る抽象的な頭）
 * - VIEW_ONLY_LAYER: 一人称カメラにだけ描く（湯気・水しぶき）。
 *   粒の大きさが画面の高さを基準にしているため、小さな描画先に描く反射では大きく膨らんで白く飛ぶので、反射からは外す
 */
export const MIRROR_LAYER = 1;
export const VIEW_ONLY_LAYER = 2;

/** 一人称カメラのレイヤーを整える（一人称だけの効果を描き、鏡だけのものは描かない） */
export function setupFirstPersonLayers(camera: THREE.Camera): void {
  camera.layers.enable(VIEW_ONLY_LAYER);
  camera.layers.disable(MIRROR_LAYER);
}

/** 鏡の反射用カメラのレイヤーを整える（鏡だけのものを描き、一人称だけの効果は描かない） */
export function setupReflectionLayers(camera: THREE.Camera): void {
  camera.layers.enable(MIRROR_LAYER);
  camera.layers.disable(VIEW_ONLY_LAYER);
}

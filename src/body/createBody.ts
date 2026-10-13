import * as THREE from 'three';
import type { BodyParams } from './params';
import { createToonMaterial } from '../scene/toon';
import { createOutlineMaterial, createOutlineMesh } from '../scene/outline';

export interface Body {
  group: THREE.Group;
  /** レイキャスト対象（輪郭線は含まない） */
  surfaces: THREE.Mesh[];
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * BodyParams から腰掛けた姿勢のマネキン体を生成する。
 * 座標系: 腰掛けの座面中央が原点、正面は -Z、上は +Y。
 * 頭は作らない（カメラが頭の中にあるため）。顔・胸部・股間の造形は持たない。
 */
export function createBody(params: BodyParams): Body {
  const group = new THREE.Group();
  group.name = 'body';
  const surfaces: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const skin = createToonMaterial({
    color: params.skinColor,
    rimColor: 0xd6ecff,
    rimStrength: 0.32,
  });
  const outline = createOutlineMaterial(params.outlineColor, 0.0035);

  const add = (mesh: THREE.Mesh) => {
    geometries.push(mesh.geometry);
    group.add(mesh);
    group.add(createOutlineMesh(mesh, outline));
    surfaces.push(mesh);
  };

  /** a→b を結ぶカプセル（手足） */
  const limb = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const geo = new THREE.CapsuleGeometry(radius, Math.max(len - radius * 0.2, 0.001), 6, 16);
    const mesh = new THREE.Mesh(geo, skin);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    add(mesh);
  };

  /** 楕円体（関節・胴・手足先） */
  const blob = (pos: THREE.Vector3, scale: THREE.Vector3) => {
    // 輪郭線の太さを揃えるため、スケールはジオメトリに焼き込む
    const geo = new THREE.SphereGeometry(1, 24, 16).scale(scale.x, scale.y, scale.z);
    const mesh = new THREE.Mesh(geo, skin);
    mesh.position.copy(pos);
    add(mesh);
  };

  const sw = params.shoulderWidth;
  const tg = params.torsoGirth;
  const lg = params.limbGirth;
  const ll = params.limbLength;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // 胴: 腰の塊 + 胴のカプセル + 首（単純な形状だけ）
  blob(v(0, 0.12, 0.01), v(0.17 * tg, 0.12, 0.13 * tg));
  {
    const geo = new THREE.CapsuleGeometry(0.15, 0.32, 8, 20).scale(1.15 * tg * sw, 1, 0.78 * tg);
    const torso = new THREE.Mesh(geo, skin);
    torso.position.set(0, 0.42, 0.03);
    torso.rotation.x = -0.06;
    add(torso);
  }
  limb(v(0, 0.62, 0.03), v(0, 0.72, 0.02), 0.05);

  for (const side of [-1, 1]) {
    const shoulder = v(side * 0.2 * sw, 0.62, 0.03);
    const elbow = v(side * 0.25 * sw, 0.62 - 0.27 * ll, -0.05);
    const wrist = v(side * 0.16 * sw, 0.31, -0.06 - 0.27 * ll);
    const hip = v(side * 0.095 * tg, 0.12, -0.01);
    const knee = v(side * 0.12 * tg, 0.15, -0.02 - 0.42 * ll);
    const ankle = v(side * 0.13 * tg, 0.15 - 0.43 * ll, -0.06 - 0.42 * ll);

    blob(shoulder, v(0.062 * lg, 0.062 * lg, 0.062 * lg));
    limb(shoulder, elbow, 0.048 * lg);
    blob(elbow, v(0.042 * lg, 0.042 * lg, 0.042 * lg));
    limb(elbow, wrist, 0.04 * lg);
    // 手: 指は作らず、平たい楕円体
    blob(
      wrist.clone().add(v(-side * 0.01, -0.01, -0.06)),
      v(0.038 * lg, 0.02 * lg, 0.062 * lg),
    );

    limb(hip, knee, 0.075 * lg);
    blob(knee, v(0.06 * lg, 0.06 * lg, 0.06 * lg));
    limb(knee, ankle, 0.052 * lg);
    // 足: 平たい楕円体
    blob(
      ankle.clone().add(v(0, -0.035, -0.06)),
      v(0.045 * lg, 0.03 * lg, 0.1 * lg),
    );
  }

  return {
    group,
    surfaces,
    dispose() {
      geometries.forEach((g) => g.dispose());
      skin.dispose();
      outline.dispose();
    },
  };
}

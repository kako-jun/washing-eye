import * as THREE from 'three';
import { createToonMaterial } from '../scene/toon';
import { createOutlineMaterial, createOutlineMesh } from '../scene/outline';
import type { SurfaceHit } from './pointer';

/**
 * スポンジの見た目。体表の当たり位置に沿わせて表示し、こすっている間は少し押しつぶす。
 */
export class Sponge {
  readonly group = new THREE.Group();
  private readonly target = new THREE.Vector3();
  private readonly targetQ = new THREE.Quaternion();
  private visible = 0;
  private wantVisible = false;
  private press = 0;
  private wantPress = false;
  private readonly body: THREE.Mesh;
  private readonly outline: THREE.Mesh;

  constructor() {
    const geo = new THREE.CapsuleGeometry(0.03, 0.04, 6, 14);
    geo.rotateZ(Math.PI / 2);
    geo.scale(1, 0.55, 0.8);
    this.body = new THREE.Mesh(
      geo,
      createToonMaterial({ color: 0xf3c97a, rimColor: 0xfff1cf, rimStrength: 0.3 }),
    );
    this.body.raycast = () => {};
    this.outline = createOutlineMesh(this.body, createOutlineMaterial(0x8a6a3a, 0.003));
    this.group.add(this.body, this.outline);
    this.group.visible = false;
  }

  setHit(hit: SurfaceHit | null, pressing: boolean): void {
    this.wantVisible = !!hit;
    this.wantPress = pressing && !!hit;
    if (!hit) return;
    // 体表の少し外側に、法線に沿わせて置く
    this.target.copy(hit.point).addScaledVector(hit.normal, 0.012);
    this.targetQ.setFromUnitVectors(UP, hit.normal);
    if (this.visible < 0.05) {
      this.group.position.copy(this.target);
      this.group.quaternion.copy(this.targetQ);
    }
  }

  update(dt: number, t: number): void {
    const k = 1 - Math.exp(-dt * 12);
    this.visible += ((this.wantVisible ? 1 : 0) - this.visible) * k;
    this.press += ((this.wantPress ? 1 : 0) - this.press) * (1 - Math.exp(-dt * 20));
    this.group.visible = this.visible > 0.02;
    if (!this.group.visible) return;
    this.group.position.lerp(this.target, 1 - Math.exp(-dt * 30));
    this.group.quaternion.slerp(this.targetQ, 1 - Math.exp(-dt * 18));
    const squash = 1 - this.press * (0.25 + Math.sin(t * 30) * 0.05);
    const s = this.visible;
    this.group.scale.set(s * (1 + this.press * 0.08), s * squash, s * (1 + this.press * 0.08));
  }
}

const UP = new THREE.Vector3(0, 1, 0);

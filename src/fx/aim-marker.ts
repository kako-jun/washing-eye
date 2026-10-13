import * as THREE from 'three';
import type { SurfaceHit } from '../input/pointer';

/** 輪の面の向き（RingGeometry は XY 平面で +Z を向く） */
const FACING = new THREE.Vector3(0, 0, 1);

/**
 * 手持ちシャワーの当て先の目印。体表に沿った細い輪で、ホバー中は控えめに、水を出している間は明るく示す。
 */
export class AimMarker {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly target = new THREE.Vector3();
  private readonly targetQ = new THREE.Quaternion();
  private show = 0;
  private wantShow = false;
  private bright = 0;
  private wantBright = false;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: 0xc6ecf7,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.032, 40), this.material);
    this.mesh.raycast = () => {};
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  /** 当て先。null なら消す */
  setTarget(hit: SurfaceHit | null, spraying: boolean): void {
    this.wantShow = !!hit;
    this.wantBright = spraying;
    if (!hit) return;
    // 体表に埋もれないよう、法線方向に少し浮かせて沿わせる
    this.target.copy(hit.point).addScaledVector(hit.normal, 0.004);
    this.targetQ.setFromUnitVectors(FACING, hit.normal);
    if (this.show < 0.05) {
      this.mesh.position.copy(this.target);
      this.mesh.quaternion.copy(this.targetQ);
    }
  }

  /** 今の不透明度（0〜1） */
  get opacity(): number {
    return this.material.opacity;
  }

  update(dt: number): void {
    this.show += ((this.wantShow ? 1 : 0) - this.show) * (1 - Math.exp(-dt * 14));
    this.bright += ((this.wantBright ? 1 : 0) - this.bright) * (1 - Math.exp(-dt * 10));
    this.material.opacity = this.show * (0.45 + 0.4 * this.bright);
    this.mesh.visible = this.show > 0.02;
    if (!this.mesh.visible) return;
    this.mesh.position.lerp(this.target, 1 - Math.exp(-dt * 30));
    this.mesh.quaternion.slerp(this.targetQ, 1 - Math.exp(-dt * 18));
  }
}

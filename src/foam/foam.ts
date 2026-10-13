import * as THREE from 'three';
import { createToonMaterial } from '../scene/toon';

/**
 * 泡。白い球のインスタンスを体表に置く。
 * - スポンジの当たり位置の近傍に追加し、近くに既存の泡があればそれを膨らませる
 * - シャワーの当たる範囲の泡は縮んで消える
 * - 上限数を超えたら古い泡から再利用してスマホでも軽く保つ
 */
export class Foam {
  readonly mesh: THREE.InstancedMesh;
  private readonly max: number;
  private count = 0;
  private readonly pos: Float32Array;
  private readonly normal: Float32Array;
  /** 現在の半径 */
  private readonly size: Float32Array;
  /** 目標の半径（膨らむ途中の補間先） */
  private readonly target: Float32Array;
  private readonly phase: Float32Array;
  /** 生成順（上限時の再利用で最古を選ぶ） */
  private readonly born: Float32Array;
  private clock = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Vector3();

  constructor(max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.normal = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.target = new Float32Array(max);
    this.phase = new Float32Array(max);
    this.born = new Float32Array(max);

    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = createToonMaterial({
      color: 0xf4fbff,
      rimColor: 0xffffff,
      rimStrength: 0.45,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
  }

  get active(): number {
    return this.count;
  }

  /** 体表の点 p（法線 n）に泡を足す */
  add(p: THREE.Vector3, n: THREE.Vector3, radius: number): void {
    // 近くに泡があれば膨らませるだけにする（密度の上がりすぎを防ぐ）
    const merge = radius * 0.9;
    const merge2 = merge * merge;
    for (let i = 0; i < this.count; i++) {
      const dx = this.pos[i * 3] - p.x;
      const dy = this.pos[i * 3 + 1] - p.y;
      const dz = this.pos[i * 3 + 2] - p.z;
      if (dx * dx + dy * dy + dz * dz < merge2) {
        this.target[i] = Math.min(this.target[i] + radius * 0.25, radius * 1.6);
        return;
      }
    }

    let i: number;
    if (this.count < this.max) {
      i = this.count++;
    } else {
      i = 0;
      for (let k = 1; k < this.max; k++) if (this.born[k] < this.born[i]) i = k;
    }
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.normal.set([n.x, n.y, n.z], i * 3);
    this.size[i] = radius * 0.2;
    this.target[i] = radius * (0.75 + Math.random() * 0.5);
    this.phase[i] = Math.random() * Math.PI * 2;
    this.born[i] = this.clock;
  }

  /** center から radius 以内の泡を、rate（1 秒あたりの縮小率）で縮める */
  rinse(center: THREE.Vector3, radius: number, rate: number, dt: number): number {
    const r2 = radius * radius;
    const k = Math.exp(-rate * dt);
    let touched = 0;
    for (let i = 0; i < this.count; i++) {
      const dx = this.pos[i * 3] - center.x;
      const dy = this.pos[i * 3 + 1] - center.y;
      const dz = this.pos[i * 3 + 2] - center.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r2) {
        // 中心ほど早く流れる
        const falloff = 1 - Math.sqrt(d2) / radius;
        const kk = Math.pow(k, 0.4 + falloff);
        this.target[i] *= kk;
        this.size[i] *= kk;
        // 流れに沿って少し下へずれる
        this.pos[i * 3 + 1] -= 0.02 * dt * (0.5 + falloff);
        touched++;
      }
    }
    return touched;
  }

  update(dt: number): void {
    this.clock += dt;
    // 消えた泡を末尾と入れ替えて詰める
    for (let i = 0; i < this.count; ) {
      if (this.target[i] < 0.0015) {
        this.removeAt(i);
      } else {
        i++;
      }
    }

    const lerp = 1 - Math.exp(-dt * 10);
    for (let i = 0; i < this.count; i++) {
      this.size[i] += (this.target[i] - this.size[i]) * lerp;
      const wobble = 1 + Math.sin(this.clock * 2.2 + this.phase[i]) * 0.05;
      const s = this.size[i] * wobble;
      // 体表に半分ほど埋めて、法線方向へ少しつぶれた形にする
      this.tmp.set(this.normal[i * 3], this.normal[i * 3 + 1], this.normal[i * 3 + 2]);
      this.dummy.position.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.dummy.position.addScaledVector(this.tmp, s * 0.25);
      this.dummy.quaternion.setFromUnitVectors(UP, this.tmp);
      this.dummy.scale.set(s, s * 0.8, s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private removeAt(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.normal.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.size[i] = this.size[last];
    this.target[i] = this.target[last];
    this.phase[i] = this.phase[last];
    this.born[i] = this.born[last];
  }
}

const UP = new THREE.Vector3(0, 1, 0);

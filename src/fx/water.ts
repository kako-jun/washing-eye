import * as THREE from 'three';
import type { SurfaceHit } from '../input/pointer';

/** 泡を流し始める水の出方の下限 */
export const RINSE_MIN_FLOW = 0.2;

/**
 * 手持ちシャワーの水が落ちる点。水を出している間だけ当て先に追従し、止めたあと（水が引いていく間）は動かさない。
 * ホバー中の当て先（目印）とは別に持つ。
 */
export class HandShowerAim {
  /** 水の落ちる点（体から外れている間は、最後に当たっていた点を保つ） */
  readonly point = new THREE.Vector3();
  readonly normal = new THREE.Vector3(0, 1, 0);
  /** 水が体に当たっているか（外れていれば泡は流さない） */
  onBody = false;

  /** PointerInput の onAim から呼ぶ。spraying が false（ホバー）のときは水の落ちる点を動かさない */
  track(hit: SurfaceHit | null, spraying: boolean): void {
    if (!spraying) return;
    this.onBody = !!hit;
    if (hit) {
      this.point.copy(hit.point);
      this.normal.copy(hit.normal);
    }
  }

  /** ヘッドの位置: 当て先から体の外側（法線方向）に 0.14、目の側に 0.1 離す */
  headFrom(eye: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const toEye = new THREE.Vector3().subVectors(eye, this.point).normalize();
    return out.copy(this.point).addScaledVector(this.normal, 0.14).addScaledVector(toEye, 0.1);
  }
}

export interface WaterSource {
  /** 水の出方（0〜1） */
  flow: number;
  /** 水の落ちる点。体に当たっていなければ null */
  point: THREE.Vector3 | null;
}

/** 泡を流す中心と強さ。水の落ちる点を中心に、ある程度出ている水だけ */
export function rinseTargets(sources: WaterSource[]): { point: THREE.Vector3; flow: number }[] {
  return sources
    .filter((s): s is { flow: number; point: THREE.Vector3 } => s.flow > RINSE_MIN_FLOW && !!s.point)
    .map((s) => ({ point: s.point, flow: s.flow }));
}

/** 水音・湯気に使う水の量。強い方に合わせる */
export function waterLevel(sources: WaterSource[]): number {
  return sources.reduce((m, s) => Math.max(m, s.flow), 0);
}

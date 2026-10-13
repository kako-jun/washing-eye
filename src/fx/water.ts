import * as THREE from 'three';
import type { SurfaceHit, SurfaceKind } from '../input/pointer';

/** 鏡に当てるとき、目からヘッドまでの距離（手を前に伸ばした長さ） */
const MIRROR_REACH = 0.35;
/** 鏡に当てるとき、ヘッドを目の高さから下げる量（手は胸の前） */
const HAND_DROP = new THREE.Vector3(0, -0.22, 0);

/** 泡を流し始める水の出方の下限 */
export const RINSE_MIN_FLOW = 0.2;

/**
 * 手持ちシャワーの水が落ちる点。水を出している間だけ当て先に追従し、止めたあと（水が引いていく間）は動かさない。
 * ホバー中の当て先（目印）とは別に持つ。
 */
export class HandShowerAim {
  /** 水の落ちる点（当て先から外れている間は、最後に当たっていた点を保つ） */
  readonly point = new THREE.Vector3();
  readonly normal = new THREE.Vector3(0, 1, 0);
  /** 水が当たっている面（体・鏡）。どちらからも外れていれば null */
  surface: SurfaceKind | null = null;

  /** PointerInput の onAim から呼ぶ。spraying が false（ホバー）のときは水の落ちる点を動かさない */
  track(hit: SurfaceHit | null, spraying: boolean): void {
    if (!spraying) return;
    this.surface = hit ? (hit.kind ?? 'body') : null;
    if (hit) {
      this.point.copy(hit.point);
      this.normal.copy(hit.normal);
    }
  }

  /**
   * ヘッドの位置。
   * - 体に当てているとき: 当て先から体の外側（法線方向）に 0.14、目の側に 0.1 離す（体のすぐ近くで持つ）
   * - 鏡に当てているとき: 手を前に伸ばした位置（目から当て先へ 0.35 進み、0.22 下げる）。
   *   鏡の手前で宙に浮かないよう、ヘッドは体の近くに置き、水を鏡まで飛ばす
   */
  headFrom(eye: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    if (this.surface === 'mirror') {
      const toTarget = new THREE.Vector3().subVectors(this.point, eye).normalize();
      return out.copy(eye).addScaledVector(toTarget, MIRROR_REACH).add(HAND_DROP);
    }
    const toEye = new THREE.Vector3().subVectors(eye, this.point).normalize();
    return out.copy(this.point).addScaledVector(this.normal, 0.14).addScaledVector(toEye, 0.1);
  }
}

export interface WaterSource {
  /** 水の出方（0〜1） */
  flow: number;
  /** 水の落ちる点。体にも鏡にも当たっていなければ null */
  point: THREE.Vector3 | null;
  /** 水が当たっている面。省略時は体 */
  kind?: SurfaceKind;
}

/**
 * 2 つのシャワーの水の出方と落ちる点をまとめる（main とテストで同じ組み立てを使う）。
 * - 固定シャワー: 視線の中心のレイが体・鏡に当たった点（当たらなければ null）
 * - 手持ちシャワー: 水の落ちる点（体・鏡に当たっていなければ null）
 */
export function waterSources(
  fixed: { flow: number; hit: SurfaceHit | null },
  hand: { flow: number; aim: Pick<HandShowerAim, 'point' | 'surface'> },
): WaterSource[] {
  return [
    { flow: fixed.flow, point: fixed.hit?.point ?? null, kind: fixed.hit?.kind ?? 'body' },
    { flow: hand.flow, point: hand.aim.surface ? hand.aim.point : null, kind: hand.aim.surface ?? 'body' },
  ];
}

/** ある程度出ていて、指定の面に落ちている水 */
function landingOn(sources: WaterSource[], kind: SurfaceKind): { point: THREE.Vector3; flow: number }[] {
  return sources
    .filter(
      (s): s is WaterSource & { point: THREE.Vector3 } =>
        s.flow > RINSE_MIN_FLOW && !!s.point && (s.kind ?? 'body') === kind,
    )
    .map((s) => ({ point: s.point, flow: s.flow }));
}

/** 泡を流す中心と強さ。体に落ちている水の、落ちる点を中心にする */
export function rinseTargets(sources: WaterSource[]): { point: THREE.Vector3; flow: number }[] {
  return landingOn(sources, 'body');
}

/** 鏡の曇りを取る中心と強さ。鏡に落ちている水の、落ちる点を中心にする */
export function mirrorTargets(sources: WaterSource[]): { point: THREE.Vector3; flow: number }[] {
  return landingOn(sources, 'mirror');
}

/** 水音・湯気に使う水の量。強い方に合わせる */
export function waterLevel(sources: WaterSource[]): number {
  return sources.reduce((m, s) => Math.max(m, s.flow), 0);
}

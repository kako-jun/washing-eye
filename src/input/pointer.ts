import * as THREE from 'three';
import type { LookController } from './look';
import type { Tool } from './tool';

/** 当たった面の種類。体はこする・流す対象、鏡は水を当てて曇りを取る対象 */
export type SurfaceKind = 'body' | 'mirror';

/** 鏡として扱う面に付ける印（mesh.userData.surface） */
export const MIRROR_SURFACE = 'mirror';

export interface SurfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** 当たった面の種類。省略時は体 */
  kind?: SurfaceKind;
}

/** 体に当たったときだけ、その当たりを返す（鏡は null） */
export function bodyHit(hit: SurfaceHit | null): SurfaceHit | null {
  return hit && (hit.kind ?? 'body') === 'body' ? hit : null;
}

export interface PointerCallbacks {
  /** 体をこすっている間、当たり位置ごとに呼ばれる（前回位置との補間込み） */
  onScrub(hit: SurfaceHit, speed: number): void;
  /** こすり終わり */
  onScrubEnd(): void;
  /** ホバー（スポンジの表示位置）。体に当たらなければ null */
  onHover(hit: SurfaceHit | null, scrubbing: boolean): void;
  /**
   * 手持ちシャワーの当て先（目印の位置）。ホバー中と、押して水を出している間に呼ばれる。
   * 当て先は体と鏡。どちらにも当たらなければ null（水を出している間は、外れても水は止めない）
   */
  onAim?(hit: SurfaceHit | null, spraying: boolean): void;
  /** 手持ちシャワーの水を出す・止める */
  onSpray?(on: boolean): void;
}

type Mode = 'idle' | 'scrub' | 'spray' | 'look';

/**
 * 画面のポインター操作。持っている道具で、体の上を押したときの動きが変わる。
 * - スポンジ: 体の上で押す → こする（鏡はこすれないので、鏡の上は体の外と同じ扱い）
 * - 手持ちシャワー: 体・鏡の上で押す → 押している間、ポインターの指す点に水を当てる（マウスはホバーでも当て先を示す）
 * - どちらでも: 当て先の外で押す／右・中ボタン → 視線を回す（傾きモード中は視線は傾きに任せる）
 * 当たり判定の対象（surfaces）には体と鏡を渡す。鏡は userData.surface に MIRROR_SURFACE を付けて見分ける。
 */
export class PointerInput {
  private mode: Mode = 'idle';
  private pointerId = -1;
  /** マウスが画面の上にあるときの最後の位置（持ち替え直後に目印を出し直すため）。外に出たら null */
  private mouseAt: { x: number; y: number } | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastHit: THREE.Vector3 | null = null;
  private lastTime = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly normalMatrix = new THREE.Matrix3();

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: THREE.Camera,
    private readonly surfaces: THREE.Object3D[],
    private readonly look: LookController,
    private readonly cb: PointerCallbacks,
    /** 持っている道具（正本は ToolState。ここでは読むだけ） */
    private readonly getTool: () => Tool,
  ) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.end);
    el.addEventListener('pointercancel', this.end);
    // up/cancel が届かずにキャプチャが外れた場合も、同じ後始末をして操作が固まらないようにする
    el.addEventListener('lostpointercapture', this.end);
    el.addEventListener('pointerleave', this.leave);
    el.addEventListener('contextmenu', this.preventContextMenu);
  }

  /** リスナーをすべて外す */
  dispose(): void {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.end);
    this.el.removeEventListener('pointercancel', this.end);
    this.el.removeEventListener('lostpointercapture', this.end);
    this.el.removeEventListener('pointerleave', this.leave);
    this.el.removeEventListener('contextmenu', this.preventContextMenu);
  }

  /**
   * 道具が持ち替えられたあとに呼ぶ（prev は前の道具）。こすっている・水を出している途中なら、その動作を止める
   * （視線操作は続ける）。前の道具の目印を消し、マウスが体の上にあれば新しい道具の目印をその場に出す。
   */
  toolChanged(prev: Tool): void {
    if (prev === this.getTool()) return;
    if (this.mode === 'scrub' || this.mode === 'spray') this.stop();
    this.clearHover(prev);
    if (this.mode === 'idle' && this.mouseAt) this.hover(this.mouseAt.x, this.mouseAt.y);
  }

  /** 進行中の操作をやめ、目印も消す（ウィンドウのフォーカスが外れた・タブが隠れたとき） */
  cancel(): void {
    if (this.mode !== 'idle') this.stop();
    this.clearHover();
  }

  /** 画面座標から体表へのレイキャスト */
  hitAt(clientX: number, clientY: number): SurfaceHit | null {
    const rect = this.el.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.cast();
  }

  /** 任意のレイで体表に当てる */
  hitRay(origin: THREE.Vector3, dir: THREE.Vector3, far = Infinity): SurfaceHit | null {
    this.raycaster.set(origin, dir);
    this.raycaster.far = far;
    const hit = this.cast();
    this.raycaster.far = Infinity;
    return hit;
  }

  private cast(): SurfaceHit | null {
    const hits = this.raycaster.intersectObjects(this.surfaces, false);
    const h = hits[0];
    if (!h || !h.face) return null;
    this.normalMatrix.getNormalMatrix(h.object.matrixWorld);
    const normal = h.face.normal.clone().applyMatrix3(this.normalMatrix).normalize();
    const kind: SurfaceKind = h.object.userData.surface === MIRROR_SURFACE ? 'mirror' : 'body';
    return { point: h.point.clone(), normal, kind };
  }

  private down = (e: PointerEvent) => {
    if (this.mode !== 'idle') return;
    const target = e.button === 0 ? this.hitAt(e.clientX, e.clientY) : null;
    const hand = this.getTool() === 'handShower';
    // スポンジでこすれるのは体だけ。手持ちシャワーは体にも鏡にも当てられる
    const hit = hand ? target : bodyHit(target);
    if (hit && hand) {
      this.mode = 'spray';
      this.cb.onAim?.(hit, true);
      this.cb.onSpray?.(true);
    } else if (hit) {
      this.mode = 'scrub';
      this.lastHit = hit.point.clone();
      this.lastTime = performance.now();
      this.cb.onScrub(hit, 0);
      this.cb.onHover(hit, true);
    } else if (!this.look.usingTilt) {
      this.mode = 'look';
    } else {
      return;
    }
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // キャプチャできなくても操作は続ける（離したときの up は届く）
    }
    this.el.classList.toggle('is-looking', this.mode === 'look');
  };

  private move = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.mouseAt = { x: e.clientX, y: e.clientY };
    if (this.mode === 'idle') {
      if (e.pointerType === 'mouse') this.hover(e.clientX, e.clientY);
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    // こする・当て先の追従は update() で毎フレーム行う（傾きで視線が動いても当たり位置が追従する）
    if (this.mode === 'look') this.look.drag(dx, dy, this.el.clientHeight);
  };

  /** 毎フレーム呼ぶ。こすっている間はポインター位置の体表に泡を足し、水を出している間は当て先を追従させる */
  update(): void {
    if (this.mode === 'spray') {
      this.cb.onAim?.(this.hitAt(this.lastX, this.lastY), true);
      return;
    }
    if (this.mode !== 'scrub') return;
    const hit = bodyHit(this.hitAt(this.lastX, this.lastY));
    this.cb.onHover(hit, true);
    if (!hit) {
      this.lastHit = null;
      return;
    }
    const now = performance.now();
    const dt = Math.max((now - this.lastTime) / 1000, 1 / 240);
    this.lastTime = now;
    if (!this.lastHit) {
      this.lastHit = hit.point.clone();
      this.cb.onScrub(hit, 0);
      return;
    }
    const dist = hit.point.distanceTo(this.lastHit);
    const speed = dist / dt;
    // 速く動かしても泡が途切れないよう、一定間隔で補間して体表に当て直す
    const step = 0.012;
    const n = Math.min(Math.floor(dist / step), 12);
    for (let i = 1; i < n; i++) {
      const p = this.lastHit.clone().lerp(hit.point, i / n);
      const back = this.hitRay(
        p.addScaledVector(hit.normal, 0.06),
        hit.normal.clone().negate(),
        0.12,
      );
      if (back) this.cb.onScrub(back, speed);
    }
    this.cb.onScrub(hit, speed);
    this.lastHit.copy(hit.point);
  }

  /** pointerup / pointercancel / lostpointercapture の共通の後始末（同じポインターで 2 回目以降は何もしない） */
  private end = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const wasSpraying = this.mode === 'spray';
    this.stop();
    if (e.pointerType !== 'mouse') {
      // タッチ・ペンは指が離れたら目印を消す
      this.clearHover();
    } else if (wasSpraying) {
      // マウスはホバーが続くので、当て先の目印を「水を出していない」控えめな表示に戻す。
      // 位置は最後に動かした位置を使う（lostpointercapture などは座標が 0,0 で届くことがあるため）
      this.cb.onAim?.(this.hitAt(this.lastX, this.lastY), false);
    }
  };

  /** 待機中のマウスの位置に、今の道具の目印を出す */
  private hover(x: number, y: number): void {
    const target = this.hitAt(x, y);
    const hit = this.getTool() === 'handShower' ? target : bodyHit(target);
    if (this.getTool() === 'handShower') this.cb.onAim?.(hit, false);
    else this.cb.onHover(hit, false);
    this.el.classList.toggle('is-over-body', !!hit);
  }

  /** 進行中の操作（こする・水を出す・見回す）を終えて待機に戻す */
  private stop(): void {
    if (this.mode === 'scrub') this.cb.onScrubEnd();
    if (this.mode === 'spray') this.cb.onSpray?.(false);
    const id = this.pointerId;
    this.mode = 'idle';
    this.pointerId = -1;
    this.lastHit = null;
    this.el.classList.remove('is-looking');
    // 自分で終えた場合はキャプチャも外す（後から届く lostpointercapture は pointerId が合わないので無視される）
    try {
      if (id !== -1 && this.el.hasPointerCapture?.(id)) this.el.releasePointerCapture(id);
    } catch {
      // 外せなくても状態は戻っている
    }
  }

  /** 道具（既定は今の道具）の目印（スポンジ・当て先）を消す */
  private clearHover(tool: Tool = this.getTool()): void {
    if (tool === 'handShower') this.cb.onAim?.(null, false);
    else this.cb.onHover(null, false);
  }

  private preventContextMenu = (e: Event) => e.preventDefault();

  private leave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.mouseAt = null;
    if (this.mode === 'idle' && e.pointerType === 'mouse') {
      this.clearHover();
      this.el.classList.remove('is-over-body');
    }
  };
}

import * as THREE from 'three';

const PITCH_MIN = THREE.MathUtils.degToRad(-82);
const PITCH_MAX = THREE.MathUtils.degToRad(25);
const YAW_LIMIT = THREE.MathUtils.degToRad(110);
/**
 * 傾きモードで真下近くを向くと、端末姿勢から求めるヨーが不安定になり大きく振れる（ジンバルロック）。
 * 見下ろす角度がこの範囲に入るとヨーの更新を弱め、終わりでは止める。
 */
const YAW_FADE_START = THREE.MathUtils.degToRad(70);
const YAW_FADE_END = THREE.MathUtils.degToRad(88);
/**
 * 減衰中にヨーが本来の向きへ追いつく速さ（1/秒）。重み w に対し w/(1-w) 倍して使う。
 * 時間（秒）で効かせるので、端末の通知頻度が違っても同じ速さで追いつく。
 */
const YAW_FOLLOW_RATE = 40;
/** 通知の間隔として扱う上限（秒）。間が空いたときに一気に追いつきすぎないように */
const MAX_TILT_DT = 0.25;
/**
 * 正面を確定してよい重みの下限。約 79° より浅く見下ろしていれば確定する。
 * 足元を見たまま始めても視線が止まらず、真下付近（〜88°）の不安定なヨーは基準にしない。
 */
const ORIGIN_MIN_WEIGHT = 0.5;
/** 前の通知が無いときに仮定する間隔（秒） */
const DEFAULT_TILT_DT = 1 / 60;

/**
 * 視線の制御。
 * - 傾きモード: DeviceOrientation から視線を作る（ピッチは重力基準の絶対値、ヨーは開始時を正面とする相対値）
 * - ドラッグモード: ドラッグ量で視線を回す（PC と、傾きが使えない端末）
 */
export class LookController {
  yaw = 0;
  /** 初期は少し下を向き、自分の体が視界に入るようにする */
  pitch = THREE.MathUtils.degToRad(-60);
  private targetYaw = this.yaw;
  private targetPitch = this.pitch;
  private tiltActive = false;
  /** 傾きのヨーの基準（正面）。null の間は、真下付近（約 79° より深い）を向いていない通知が来たときに確定する */
  private yawOrigin: number | null = null;
  private lastTiltStamp: number | null = null;
  private readonly euler = new THREE.Euler();
  private readonly q = new THREE.Quaternion();
  private readonly qScreen = new THREE.Quaternion();
  private readonly qWorld = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  private readonly zee = new THREE.Vector3(0, 0, 1);
  private listener: ((e: DeviceOrientationEvent) => void) | null = null;
  private onTilt: (() => void) | null = null;

  get usingTilt(): boolean {
    return this.tiltActive;
  }

  /** ドラッグ量（ピクセル）で視線を回す */
  drag(dx: number, dy: number, viewportHeight: number): void {
    // 画面の高さが取れない（0・非有限）ときは動かさない。視線が NaN に汚染されるのを防ぐ
    if (!(viewportHeight > 0) || !Number.isFinite(viewportHeight)) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const k = 1.6 / viewportHeight;
    this.targetYaw = clampYaw(this.targetYaw + dx * k);
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * k, PITCH_MIN, PITCH_MAX);
  }

  /**
   * 傾き入力を有効にする。iOS の許可要求はユーザー操作の中から呼ぶこと。
   * 実際に値が届いた時点で傾きモードに切り替わり、onActive が呼ばれる。
   * 2 回以上呼んでもリスナーは 1 つだけ登録する（onActive は最後に渡したものに差し替わる）。
   */
  async enableTilt(onActive: () => void): Promise<boolean> {
    if (this.listener) {
      this.onTilt = onActive;
      return true;
    }
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    const ctor = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof ctor.requestPermission === 'function') {
      try {
        const result = await ctor.requestPermission();
        if (result !== 'granted') return false;
      } catch {
        return false;
      }
    }
    this.onTilt = onActive;
    // 許可要求を待つ間に別の呼び出しが登録を済ませていたら、そちらを使う
    if (this.listener) return true;
    this.listener = (e) => this.handleOrientation(e);
    window.addEventListener('deviceorientation', this.listener);
    return true;
  }

  /** 今向いている方向を正面にし直す */
  recenter(): void {
    this.yawOrigin = null;
  }

  update(camera: THREE.Camera, dt: number): void {
    const k = 1 - Math.exp(-dt * (this.tiltActive ? 14 : 18));
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private handleOrientation(e: DeviceOrientationEvent): void {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const d = THREE.MathUtils.DEG2RAD;
    const orient = ((screen.orientation?.angle ?? 0) as number) * d;
    // three.js の DeviceOrientationControls と同じ変換で端末姿勢を求める
    this.euler.set(e.beta * d, e.alpha * d, -e.gamma * d, 'YXZ');
    this.q.setFromEuler(this.euler);
    this.q.multiply(this.qWorld);
    this.q.multiply(this.qScreen.setFromAxisAngle(this.zee, -orient));
    this.euler.setFromQuaternion(this.q, 'YXZ');

    const stamp = e.timeStamp;
    const dt =
      this.lastTiltStamp === null || !Number.isFinite(stamp)
        ? DEFAULT_TILT_DT
        : THREE.MathUtils.clamp((stamp - this.lastTiltStamp) / 1000, 0, MAX_TILT_DT);
    if (Number.isFinite(stamp)) this.lastTiltStamp = stamp;

    // 深く見下ろしているほどヨーの更新を弱める（真下付近の振れを視線に出さない）
    const weight = 1 - THREE.MathUtils.smoothstep(-this.euler.x, YAW_FADE_START, YAW_FADE_END);
    // 正面の確定（開始時・正面に戻す）は、真下付近の不安定なヨーを基準にしないよう、ある程度浅くなるまで待つ
    if (this.yawOrigin === null && weight >= ORIGIN_MIN_WEIGHT) this.yawOrigin = this.euler.y;
    if (this.yawOrigin !== null) {
      const yaw = wrapAngle(this.euler.y - this.yawOrigin);
      this.targetYaw = clampYaw(this.targetYaw + yawFollow(weight, dt) * wrapAngle(yaw - this.targetYaw));
    }
    this.targetPitch = THREE.MathUtils.clamp(this.euler.x, PITCH_MIN, PITCH_MAX);

    if (!this.tiltActive) {
      this.tiltActive = true;
      this.onTilt?.();
    }
  }
}

/**
 * 1 回の通知でヨーを本来の向きへ寄せる割合。重み 1 ならそのまま、0 なら動かさない。
 * 間は 1 - exp(-k·dt) の形にして、通知の間隔を分割しても同じだけ寄るようにする。
 */
function yawFollow(weight: number, dt: number): number {
  if (weight >= 1) return 1;
  if (weight <= 0) return 0;
  return 1 - Math.exp(-YAW_FOLLOW_RATE * (weight / (1 - weight)) * dt);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function clampYaw(a: number): number {
  return THREE.MathUtils.clamp(a, -YAW_LIMIT, YAW_LIMIT);
}

import * as THREE from 'three';

const PITCH_MIN = THREE.MathUtils.degToRad(-82);
const PITCH_MAX = THREE.MathUtils.degToRad(25);
const YAW_LIMIT = THREE.MathUtils.degToRad(110);

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
  private yawOrigin: number | null = null;
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
    const k = 1.6 / viewportHeight;
    this.targetYaw = clampYaw(this.targetYaw + dx * k);
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * k, PITCH_MIN, PITCH_MAX);
  }

  /**
   * 傾き入力を有効にする。iOS の許可要求はユーザー操作の中から呼ぶこと。
   * 実際に値が届いた時点で傾きモードに切り替わり、onActive が呼ばれる。
   */
  async enableTilt(onActive: () => void): Promise<boolean> {
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

    if (this.yawOrigin === null) this.yawOrigin = this.euler.y;
    this.targetYaw = clampYaw(wrapAngle(this.euler.y - this.yawOrigin));
    this.targetPitch = THREE.MathUtils.clamp(this.euler.x, PITCH_MIN, PITCH_MAX);

    if (!this.tiltActive) {
      this.tiltActive = true;
      this.onTilt?.();
    }
  }
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function clampYaw(a: number): number {
  return THREE.MathUtils.clamp(a, -YAW_LIMIT, YAW_LIMIT);
}

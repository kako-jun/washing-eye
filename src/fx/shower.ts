import * as THREE from 'three';

/**
 * シャワーの水。シャワーヘッドから狙った点へ向かう細い水筋（線分）と、当たった所のしぶき。
 * ヘッドの位置と狙い点は外から与える（固定シャワーはヘッド固定・視線の先、手持ちシャワーはどちらも手の動きに追従）。
 */
export class Shower {
  readonly group = new THREE.Group();
  private readonly n: number;
  private readonly head: THREE.Vector3;
  private readonly target = new THREE.Vector3();
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  /** 水滴ごとの到達距離（ここを越えたら当たったとみなす） */
  private readonly reach: Float32Array;
  private readonly lines: Float32Array;
  private readonly lineGeo: THREE.BufferGeometry;
  private readonly lineMat: THREE.LineBasicMaterial;
  private readonly splash: THREE.Points;
  private readonly splashPos: Float32Array;
  private readonly splashVel: Float32Array;
  private readonly splashLife: Float32Array;
  private readonly splashMat: THREE.PointsMaterial;
  private on = false;
  private respawnPending = false;
  /** 0〜1。出始め・止め際をなめらかにする */
  private flow = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(head: THREE.Vector3, count = 260) {
    this.head = head.clone();
    this.n = count;
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.reach = new Float32Array(count);
    this.lines = new Float32Array(count * 6);
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.lines, 3));
    this.lineMat = new THREE.LineBasicMaterial({
      color: 0xbfe6f5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const streaks = new THREE.LineSegments(this.lineGeo, this.lineMat);
    streaks.frustumCulled = false;
    this.group.add(streaks);

    const sn = 120;
    this.splashPos = new Float32Array(sn * 3);
    this.splashVel = new Float32Array(sn * 3);
    this.splashLife = new Float32Array(sn);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.splashPos, 3));
    this.splashMat = new THREE.PointsMaterial({
      color: 0xe6f7ff,
      size: 0.012,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.splash = new THREE.Points(sg, this.splashMat);
    this.splash.frustumCulled = false;
    this.group.add(this.splash);

    for (let i = 0; i < count; i++) this.spawn(i, Math.random());
  }

  setOn(on: boolean): void {
    // 止まっていた状態から出すときは、前の位置へ向かっていた古い水滴を今のヘッド・狙い点から出し直す
    if (on && !this.on && this.flow < 0.05) this.respawnPending = true;
    this.on = on;
  }

  get flowLevel(): number {
    return this.flow;
  }

  /** 水の当たる点 */
  aim(point: THREE.Vector3): void {
    this.target.copy(point);
  }

  /** シャワーヘッドの位置（手持ちシャワーで、手の動きに合わせて動かす） */
  setHead(point: THREE.Vector3): void {
    this.head.copy(point);
  }

  update(dt: number, hitNormal: THREE.Vector3 | null): void {
    const k = 1 - Math.exp(-dt * (this.on ? 6 : 4));
    this.flow += ((this.on ? 1 : 0) - this.flow) * k;
    this.lineMat.opacity = 0.55 * this.flow;
    this.splashMat.opacity = 0.8 * this.flow;
    this.group.visible = this.flow > 0.01;
    if (!this.group.visible) return;
    if (this.respawnPending) {
      this.respawnPending = false;
      for (let i = 0; i < this.n; i++) this.spawn(i, Math.random());
    }

    const g = -4.5;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      this.v[o + 1] += g * dt;
      this.p[o] += this.v[o] * dt;
      this.p[o + 1] += this.v[o + 1] * dt;
      this.p[o + 2] += this.v[o + 2] * dt;
      // 狙い点を越えたら新しい水滴にする
      this.tmp.set(this.p[o], this.p[o + 1], this.p[o + 2]);
      if (this.tmp.distanceTo(this.head) > this.reach[i] || this.p[o + 1] < -0.42) {
        this.emitSplash(this.tmp, hitNormal);
        this.spawn(i, 0);
      }
      const l = i * 6;
      const len = 0.012;
      this.lines[l] = this.p[o];
      this.lines[l + 1] = this.p[o + 1];
      this.lines[l + 2] = this.p[o + 2];
      this.lines[l + 3] = this.p[o] - this.v[o] * len;
      this.lines[l + 4] = this.p[o + 1] - this.v[o + 1] * len;
      this.lines[l + 5] = this.p[o + 2] - this.v[o + 2] * len;
    }
    this.lineGeo.attributes.position.needsUpdate = true;

    for (let i = 0; i < this.splashLife.length; i++) {
      if (this.splashLife[i] <= 0) {
        this.splashPos[i * 3 + 1] = -100;
        continue;
      }
      this.splashLife[i] -= dt * 2.5;
      this.splashVel[i * 3 + 1] += g * dt;
      for (let a = 0; a < 3; a++) this.splashPos[i * 3 + a] += this.splashVel[i * 3 + a] * dt;
    }
    this.splash.geometry.attributes.position.needsUpdate = true;
  }

  private spawn(i: number, progress: number): void {
    // 散水板から少しずつ角度をばらして狙い点へ放つ
    const dir = this.tmp.subVectors(this.target, this.head);
    const dist = dir.length();
    dir.normalize();
    const spread = 0.09;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    const speed = 3.2 + Math.random() * 0.6;
    // 重力で落ちる分を少し上向きに補正する
    const tFlight = dist / speed;
    const o = i * 3;
    this.v[o] = dir.x * speed;
    this.v[o + 1] = dir.y * speed + 0.5 * 4.5 * tFlight;
    this.v[o + 2] = dir.z * speed;
    const t = progress * tFlight;
    this.p[o] = this.head.x + this.v[o] * t;
    this.p[o + 1] = this.head.y + this.v[o + 1] * t - 2.25 * t * t;
    this.p[o + 2] = this.head.z + this.v[o + 2] * t;
    this.reach[i] = dist * (0.97 + Math.random() * 0.06);
  }

  private splashCursor = 0;
  private emitSplash(at: THREE.Vector3, normal: THREE.Vector3 | null): void {
    if (Math.random() > 0.35 * this.flow) return;
    const i = this.splashCursor;
    this.splashCursor = (this.splashCursor + 1) % this.splashLife.length;
    this.splashPos.set([at.x, at.y, at.z], i * 3);
    const nx = normal?.x ?? 0;
    const ny = normal?.y ?? 1;
    const nz = normal?.z ?? 0;
    this.splashVel[i * 3] = nx * 0.5 + (Math.random() - 0.5) * 0.6;
    this.splashVel[i * 3 + 1] = ny * 0.5 + Math.random() * 0.5;
    this.splashVel[i * 3 + 2] = nz * 0.5 + (Math.random() - 0.5) * 0.6;
    this.splashLife[i] = 1;
  }
}

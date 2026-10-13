import * as THREE from 'three';
import { VIEW_ONLY_LAYER } from '../scene/layers';

/**
 * 湯気を流す風（m/s）。ふだんはごくゆっくり向きを変えながら漂い、
 * シャワーの水が出ているとき（flow 0〜1）は、シャワーから離れる向き（左手前）へ少し強く流れる。
 */
export function steamWind(t: number, flow: number): { x: number; z: number } {
  const f = Math.min(1, Math.max(0, flow));
  return {
    x: 0.025 * Math.sin(t * 0.11) - 0.06 * f,
    z: 0.02 * Math.cos(t * 0.07) + 0.05 * f,
  };
}

/** 見えている湯気の粒の割合。水が出ているほど増える */
export function activeShare(flow: number): number {
  return 0.55 + 0.45 * Math.min(1, Math.max(0, flow));
}

/**
 * 湯気。大きく柔らかい粒子がゆっくり立ちのぼり、風に流されて漂いながら、フェードして入れ替わる。
 * シャワーの水が出ているときは粒が増え、少し速く立ちのぼって流れる（動きは穏やかに）。
 */
export class Steam {
  readonly points: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly life: Float32Array;
  private readonly speed: Float32Array;
  private readonly seed: Float32Array;
  private readonly alpha: Float32Array;
  /** 粒ごとの見え方（0〜1）。見えている割合が変わったとき、ふわっと増減させる */
  private readonly vis: Float32Array;
  private flow = 0;
  private readonly geo: THREE.BufferGeometry;
  private t = 0;
  private readonly material: THREE.ShaderMaterial;

  constructor(count = 70) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.speed = new Float32Array(count);
    this.seed = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.vis = new Float32Array(count);
    const initial = Math.round(activeShare(0) * count);
    for (let i = 0; i < initial; i++) this.vis[i] = 1;
    for (let i = 0; i < count; i++) this.respawn(i, Math.random());

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uScale: { value: 1 },
        uIntensity: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute float aSeed;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = (0.35 + aSeed * 0.45) * uScale;
          gl_PointSize = size / -mv.z;
          // 近すぎる粒は視界を覆うので薄くする
          vAlpha = aAlpha * smoothstep(0.15, 0.6, -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          a *= a;
          gl_FragColor = vec4(uColor, a * vAlpha * uIntensity);
        }
      `,
    });

    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    // 粒の大きさは画面の高さ基準なので、小さな描画先の鏡の反射では膨らんで白く飛ぶ。一人称カメラにだけ描く
    this.points.layers.set(VIEW_ONLY_LAYER);
    this.points.renderOrder = 10;
  }

  /** 画面の高さ（ピクセル）に合わせて粒の大きさを決める */
  setViewportHeight(h: number, fovDeg: number): void {
    this.material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  /** シャワー中は湯気を少し濃くする */
  setIntensity(v: number): void {
    this.material.uniforms.uIntensity.value = v;
  }

  /** シャワーの水の出方（0〜1）。湯気の量と流れに効く */
  setFlow(flow: number): void {
    this.flow = Math.min(1, Math.max(0, flow));
  }

  update(dt: number): void {
    this.t += dt;
    let respawned = false;
    const wind = steamWind(this.t, this.flow);
    const rise = 1 + 0.8 * this.flow;
    const active = activeShare(this.flow) * this.n;
    const fade = 1 - Math.exp(-dt * 1.5);
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt * this.speed[i] * (1 + 0.5 * this.flow);
      if (this.life[i] >= 1) {
        this.respawn(i, 0);
        respawned = true;
      }
      const l = this.life[i];
      const s = this.seed[i];
      this.pos[i * 3] += (Math.sin(this.t * 0.4 + s * 20) * 0.03 + wind.x) * dt;
      this.pos[i * 3 + 1] += (0.06 + s * 0.05) * rise * dt;
      this.pos[i * 3 + 2] += (Math.cos(this.t * 0.3 + s * 13) * 0.02 + wind.z) * dt;
      this.vis[i] += ((i < active ? 1 : 0) - this.vis[i]) * fade;
      // ふわっと現れてふわっと消える
      this.alpha[i] = Math.sin(Math.PI * l) * 0.35 * this.vis[i];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    // 入れ替わった粒は大きさの種も変わるので、GPU に送り直す
    if (respawned) this.geo.attributes.aSeed.needsUpdate = true;
  }

  private respawn(i: number, life: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = 0.35 + Math.random() * 1.3;
    this.pos[i * 3] = Math.cos(a) * r;
    this.pos[i * 3 + 1] = -0.4 + Math.random() * 1.2 + life * 0.6;
    this.pos[i * 3 + 2] = Math.sin(a) * r - 0.3;
    this.life[i] = life;
    this.speed[i] = 0.06 + Math.random() * 0.06;
    this.seed[i] = Math.random();
  }
}

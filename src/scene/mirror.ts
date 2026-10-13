import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { MIRROR_SURFACE } from '../input/pointer';
import { CLEAR_RATE, FogMask, createUpdateThrottle, mirrorUv } from '../fx/mirror-fog';
import { createToonMaterial } from './toon';
import { setupReflectionLayers } from './layers';

export { MIRROR_LAYER } from './layers';

/** 曇りの見た目の更新間隔（秒）。マスクは小さいので、毎フレームでなくても滑らかに見える */
const FOG_UPLOAD_INTERVAL = 1 / 15;

export interface MirrorOptions {
  /** 鏡の中心（鏡は +Z を向く） */
  center: THREE.Vector3;
  width: number;
  height: number;
  /** 反射を描く解像度の長辺（px）。512 以下にする */
  textureSize: number;
  /** 反射を何フレームに 1 回描き直すか（重い端末で間引く） */
  updateEvery: number;
  /** 反射のアンチエイリアス（0 で無効） */
  multisample: number;
}

/**
 * 正面の壁の鏡。低解像度の反射の上に、曇りのマスク（FogMask）を重ねる。
 * 鏡の面（surface）は当たり判定の対象で、userData.surface に MIRROR_SURFACE が付いている。
 */
export class Mirror {
  readonly group = new THREE.Group();
  /** 反射する面。当たり判定（シャワーの当て先）の対象 */
  readonly surface: Reflector;
  readonly fog: FogMask;
  readonly width: number;
  readonly height: number;
  readonly center: THREE.Vector3;
  private readonly fogTexture: THREE.CanvasTexture | null;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly image: ImageData | null;
  private fogDirty = true;
  private sinceUpload = Infinity;

  constructor(opts: MirrorOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.center = opts.center.clone();
    const size = Math.min(512, opts.textureSize);
    const long = Math.max(opts.width, opts.height);
    this.surface = new Reflector(new THREE.PlaneGeometry(opts.width, opts.height), {
      textureWidth: Math.round((size * opts.width) / long),
      textureHeight: Math.round((size * opts.height) / long),
      color: 0xb8c4c8,
      clipBias: 0.003,
      multisample: opts.multisample,
    });
    // トゥーン調で HDR は要らないので、反射の描画先は端末の互換性が高い 8bit にする（既定は HalfFloat）。
    // 描画先の実体は最初に描くときに作られるので、ここで型を変えれば足りる
    this.surface.getRenderTarget().texture.type = THREE.UnsignedByteType;
    this.surface.userData.surface = MIRROR_SURFACE;
    this.surface.position.copy(this.center);
    this.group.add(this.surface);

    // 反射用のカメラは、鏡に映る抽象的な頭（MIRROR_LAYER）を描き、湯気・水しぶき（VIEW_ONLY_LAYER）は描かない
    const getReflectionCamera = this.surface.getReflectionCamera;
    this.surface.getReflectionCamera = (camera) => {
      const reflection = getReflectionCamera.call(this.surface, camera);
      setupReflectionLayers(reflection);
      return reflection;
    };

    // 重い端末では反射の描き直しを間引く（描かないフレームは前の反射をそのまま使う）
    const render = this.surface.onBeforeRender;
    const due = createUpdateThrottle(opts.updateEvery);
    this.surface.onBeforeRender = (...args) => {
      if (due()) render.apply(this.surface, args);
    };

    // 曇り: 小さなキャンバスに濃さを灰色で書き、鏡の手前の面の alphaMap にする（縁はテクスチャの補間でやわらかく）
    const cols = 64;
    const rows = Math.max(8, Math.round((cols * opts.height) / opts.width));
    this.fog = new FogMask(cols, rows, opts.height / opts.width);
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    this.ctx = canvas.getContext('2d');
    this.image = this.ctx ? this.ctx.createImageData(cols, rows) : null;
    this.fogTexture = this.ctx ? new THREE.CanvasTexture(canvas) : null;
    const fogMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(opts.width, opts.height),
      new THREE.MeshBasicMaterial({
        color: 0xf1f6f7,
        transparent: true,
        opacity: 0.9,
        alphaMap: this.fogTexture,
        depthWrite: false,
      }),
    );
    fogMesh.position.copy(this.center).add(new THREE.Vector3(0, 0, 0.002));
    fogMesh.raycast = () => {};
    this.group.add(fogMesh);

    // 細い枠
    const frameMat = createToonMaterial({ color: 0xdfe7ea, rimStrength: 0.15 });
    const t = 0.025;
    const bars: [number, number, number, number][] = [
      [0, opts.height / 2 + t / 2, opts.width + t * 2, t],
      [0, -opts.height / 2 - t / 2, opts.width + t * 2, t],
      [opts.width / 2 + t / 2, 0, t, opts.height],
      [-opts.width / 2 - t / 2, 0, t, opts.height],
    ];
    for (const [x, y, w, h] of bars) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), frameMat);
      bar.position.set(this.center.x + x, this.center.y + y, this.center.z + 0.004);
      bar.raycast = () => {};
      this.group.add(bar);
    }
    this.upload();
  }

  /**
   * 鏡の上の点（ワールド座標）に水が当たった。radius（m）の範囲の曇りを、水の出方と時間に応じて取る。
   * 鏡の外なら何もしない。
   */
  clearAt(point: THREE.Vector3, radius: number, flow: number, dt: number): void {
    const uv = mirrorUv(point, this);
    if (!uv) return;
    if (this.fog.clear(uv.u, uv.v, radius / this.width, CLEAR_RATE * flow * dt)) this.fogDirty = true;
  }

  /** 毎フレーム呼ぶ。時間で再び曇らせ、見た目を間隔をおいて更新する */
  update(dt: number): void {
    if (this.fog.update(dt)) this.fogDirty = true;
    this.sinceUpload += dt;
    if (this.fogDirty && this.sinceUpload >= FOG_UPLOAD_INTERVAL) this.upload();
  }

  /** 反射の描画先・曇りのテクスチャ・ジオメトリ・マテリアルを解放する */
  dispose(): void {
    this.surface.dispose(); // 反射の描画先と反射のマテリアル
    this.fogTexture?.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (mesh !== this.surface) (mesh.material as THREE.Material).dispose();
    });
  }

  private upload(): void {
    this.sinceUpload = 0;
    this.fogDirty = false;
    if (!this.ctx || !this.image || !this.fogTexture) return;
    this.fog.writeTo(this.image.data);
    this.ctx.putImageData(this.image, 0, 0);
    this.fogTexture.needsUpdate = true;
  }
}

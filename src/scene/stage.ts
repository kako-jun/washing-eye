import * as THREE from 'three';
import { createToonMaterial, getGradientMap } from './toon';

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** シャワーヘッドの位置（壁の前方上） */
  showerHead: THREE.Vector3;
  resize(): void;
}

/** 描画解像度の倍率の上限 */
export const MAX_PIXEL_RATIO = 2;

export const BACKGROUND = new THREE.Color(0x0d1820);
/** 一人称の目の位置（腰掛けた状態の頭の中） */
export const EYE_POSITION = new THREE.Vector3(0, 0.8, -0.03);

/** 浴室の床・壁・腰掛けと、柔らかいライト一式を組む */
export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = BACKGROUND;
  scene.fog = new THREE.Fog(BACKGROUND, 1.6, 5.5);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.03, 30);
  camera.position.copy(EYE_POSITION);

  // ライト: 上からの柔らかいキーライト + 青みの環境光 + 暖色の補助
  scene.add(new THREE.HemisphereLight(0x9cc7d9, 0x1a2228, 0.9));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.6);
  key.position.set(0.6, 2.4, -1.2);
  scene.add(key);
  const warm = new THREE.PointLight(0xffc89a, 0.8, 4, 1.5);
  warm.position.set(-0.8, 1.4, 0.4);
  scene.add(warm);

  // 床
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    createToonMaterial({ color: 0x1f3440, rimStrength: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.42;
  scene.add(floor);

  // 正面の壁（目地を入れたタイル）
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 4),
    new THREE.MeshToonMaterial({
      color: 0x2b4a57,
      map: createTileTexture(),
      gradientMap: getGradientMap(),
    }),
  );
  wall.position.set(0, 1.2, -1.15);
  scene.add(wall);

  // シャワーヘッドと配管
  const showerHead = new THREE.Vector3(0.32, 1.55, -1.0);
  const fixtureMat = createToonMaterial({ color: 0x9fb4bd, rimStrength: 0.25 });
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.05, 20), fixtureMat);
  head.position.copy(showerHead);
  head.rotation.x = Math.PI / 2.6;
  scene.add(head);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), fixtureMat);
  pipe.position.set(showerHead.x, showerHead.y + 0.04, showerHead.z - 0.08);
  pipe.rotation.x = Math.PI / 2;
  scene.add(pipe);

  // 腰掛け
  const stool = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.17, 0.4, 28),
    createToonMaterial({ color: 0x5f8f9c, rimStrength: 0.2 }),
  );
  stool.position.set(0, -0.22, 0.02);
  scene.add(stool);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 高密度画面（スマホ等）でも描画が重くなりすぎないよう 2 倍までに抑える。拡大率の変化にも追従する
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長画面では水平方向の視野が狭くなりすぎないよう広げる
    camera.fov = w < h ? 82 : 70;
    camera.updateProjectionMatrix();
  };
  resize();

  return { scene, camera, renderer, showerHead, resize };
}

function createTileTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = '#b9c7cc';
  g.lineWidth = 6;
  g.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 8);
  tex.anisotropy = 4;
  return tex;
}

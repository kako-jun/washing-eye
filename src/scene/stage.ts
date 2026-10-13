import * as THREE from 'three';
import { createToonMaterial, getGradientMap } from './toon';
import { setupFirstPersonLayers } from './layers';

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

/** 背景とフォグの色。明るい浴室の、湯気でかすんだ白 */
export const BACKGROUND = new THREE.Color(0xdde7ea);
/** 一人称の目の位置（腰掛けた状態の頭の中） */
export const EYE_POSITION = new THREE.Vector3(0, 0.8, -0.03);

/** 正面の壁の鏡の位置と大きさ（鏡は +Z を向く。目の高さで、少し見上げると自分が映る） */
export const MIRROR_PLACEMENT = {
  center: new THREE.Vector3(0, 0.95, -1.145),
  width: 0.8,
  height: 0.62,
};

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
  scene.fog = new THREE.Fog(BACKGROUND, 2.2, 7.5);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.03, 30);
  setupFirstPersonLayers(camera);
  camera.position.copy(EYE_POSITION);

  // ライト: 明るく柔らかい環境光 + 窓から差すような暖かい主光 + 暖色の補助
  scene.add(new THREE.HemisphereLight(0xf4fbff, 0xb7c7cd, 1.15));
  const key = new THREE.DirectionalLight(0xffe1b8, 1.7);
  key.position.set(-1.6, 2.2, -0.2);
  scene.add(key);
  const warm = new THREE.PointLight(0xffd2a8, 0.5, 4, 1.5);
  warm.position.set(0.8, 1.4, 0.4);
  scene.add(warm);

  // 床
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    createToonMaterial({ color: 0xc6d5da, rimStrength: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.42;
  scene.add(floor);

  // 正面の壁（目地を入れたタイル）
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 4),
    new THREE.MeshToonMaterial({
      color: 0xeef3f4,
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
    createToonMaterial({ color: 0x8fc3cf, rimStrength: 0.2 }),
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

/**
 * 画面の拡大率（devicePixelRatio）の変化を見張る。別の解像度のモニタへウィンドウを移したときなど、
 * resize が来ない変化にも追従するため、今の倍率に一致する resolution のメディアクエリが外れたら知らせる。
 * 戻り値は見張りをやめる関数。
 */
export function watchPixelRatio(
  win: Pick<Window, 'devicePixelRatio' | 'matchMedia'>,
  onChange: () => void,
): () => void {
  let mq: MediaQueryList | null = null;
  const listen = () => {
    mq = win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
    mq.addEventListener('change', handle, { once: true });
  };
  const handle = () => {
    onChange();
    listen(); // 新しい倍率で見張り直す
  };
  listen();
  return () => mq?.removeEventListener('change', handle);
}

function createTileTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = '#c3cfd3';
  g.lineWidth = 6;
  g.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 8);
  tex.anisotropy = 4;
  return tex;
}

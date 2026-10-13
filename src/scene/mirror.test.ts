// @vitest-environment jsdom
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MIRROR_FOG_COLOR, MIRROR_FRAME_COLOR, MIRROR_LAYER, Mirror } from './mirror';
import { WALL_COLOR } from './stage';
import { VIEW_ONLY_LAYER, setupFirstPersonLayers } from './layers';
import { MIRROR_SURFACE } from '../input/pointer';
import { REFOG_SECONDS } from '../fx/mirror-fog';
import { createMirrorHead } from '../body/head';
import { DEFAULT_BODY } from '../body/params';

// jsdom はキャンバスの描画を持たないので、getContext は null を返す（曇りの見た目の更新だけ飛ばされる）
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

/** 曇りの見た目の更新を確かめるための、2D コンテキストの代わり */
function fakeContext() {
  return {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: vi.fn(),
  };
}

function mirror() {
  return new Mirror({
    center: new THREE.Vector3(0, 1, -1.1),
    width: 0.8,
    height: 0.6,
    textureSize: 256,
    updateEvery: 2,
    multisample: 0,
  });
}

describe('鏡', () => {
  it('鏡の面は当たり判定の対象で、鏡の印が付いている', () => {
    const m = mirror();
    expect(m.surface.userData.surface).toBe(MIRROR_SURFACE);
    // 面の対角線（三角形の境目）を避けた点を狙う
    const ray = new THREE.Raycaster(new THREE.Vector3(0.1, 1.05, 0), new THREE.Vector3(0, 0, -1));
    m.group.updateMatrixWorld(true);
    const hits = ray.intersectObjects(m.group.children, false);
    // 当たるのは鏡の面だけ（曇りの面・枠は当たり判定から外す）
    expect(hits.map((h) => h.object)).toEqual([m.surface]);
  });

  it('最初は曇っていて、水が当たった所だけ曇りが取れる（鏡の外の点では変わらない）', () => {
    const m = mirror();
    expect(m.fog.coverage()).toBe(1);
    m.clearAt(new THREE.Vector3(5, 1, -1.1), 0.12, 1, 1 / 60);
    expect(m.fog.coverage()).toBe(1);
    for (let i = 0; i < 30; i++) m.clearAt(new THREE.Vector3(0, 1, -1.1), 0.12, 1, 1 / 60);
    expect(m.fog.sample(0.5, 0.5)).toBe(0);
    expect(m.fog.sample(0.05, 0.05)).toBe(1);
  });

  it('水の出方が弱いほど、取れ方もゆっくり', () => {
    const strong = mirror();
    const weak = mirror();
    const p = new THREE.Vector3(0, 1, -1.1);
    strong.clearAt(p, 0.12, 1, 0.1);
    weak.clearAt(p, 0.12, 0.3, 0.1);
    expect(weak.fog.sample(0.5, 0.5)).toBeGreaterThan(strong.fog.sample(0.5, 0.5));
  });

  it('取れた曇りは update で時間をかけて戻る', () => {
    const m = mirror();
    for (let i = 0; i < 60; i++) m.clearAt(new THREE.Vector3(0, 1, -1.1), 0.12, 1, 1 / 60);
    m.update(REFOG_SECONDS);
    expect(m.fog.sample(0.5, 0.5)).toBeCloseTo(1, 6);
  });

  it('鏡の反射用のカメラは鏡用のレイヤーを描き、一人称だけの効果（湯気・しぶき）は描かない', () => {
    const m = mirror();
    const camera = new THREE.PerspectiveCamera();
    setupFirstPersonLayers(camera);
    const reflection = m.surface.getReflectionCamera(camera);
    expect(reflection.layers.isEnabled(MIRROR_LAYER)).toBe(true);
    expect(reflection.layers.isEnabled(VIEW_ONLY_LAYER)).toBe(false);
    expect(camera.layers.isEnabled(MIRROR_LAYER)).toBe(false);
    expect(camera.layers.isEnabled(VIEW_ONLY_LAYER)).toBe(true);
  });
});

describe('鏡の見分けやすさ', () => {
  const lum = (hex: number) => {
    const c = new THREE.Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };

  it('枠は明るい壁よりはっきり暗く、曇りの面も壁とは違う色（鏡の場所が分かる）', () => {
    expect(lum(WALL_COLOR) - lum(MIRROR_FRAME_COLOR)).toBeGreaterThan(0.3);
    expect(MIRROR_FOG_COLOR).not.toBe(WALL_COLOR);
    expect(lum(MIRROR_FOG_COLOR)).toBeLessThan(lum(WALL_COLOR));
  });
});

describe('鏡の描画先と解放', () => {
  it('反射の描画先は 8bit（HalfFloat より端末の互換性が高い。トゥーン調で HDR は要らない）', () => {
    const m = mirror();
    expect(m.surface.getRenderTarget().texture.type).toBe(THREE.UnsignedByteType);
  });

  it('反射の描画先は長辺が指定の解像度（512px 以下）で、鏡の縦横比に合わせる', () => {
    const m = mirror();
    const rt = m.surface.getRenderTarget();
    expect(rt.width).toBe(256);
    expect(rt.height).toBe(192);
    const big = new Mirror({
      center: new THREE.Vector3(),
      width: 1,
      height: 1,
      textureSize: 2048,
      updateEvery: 1,
      multisample: 0,
    });
    expect(big.surface.getRenderTarget().width).toBe(512);
  });

  it('dispose で反射の描画先・曇りのテクスチャ・ジオメトリ・マテリアルを解放する', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(fakeContext() as any);
    const m = mirror();
    const rt = vi.spyOn(m.surface.getRenderTarget(), 'dispose');
    const fogTexture = (m as any).fogTexture as THREE.Texture;
    const tex = vi.spyOn(fogTexture, 'dispose');
    const geometries: ReturnType<typeof vi.spyOn>[] = [];
    m.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) geometries.push(vi.spyOn((o as THREE.Mesh).geometry, 'dispose'));
    });
    m.dispose();
    expect(rt).toHaveBeenCalled();
    expect(tex).toHaveBeenCalled();
    for (const g of geometries) expect(g).toHaveBeenCalled();
  });
});

describe('反射の描き直しの間引き（鏡に組み込んだ状態）', () => {
  /** three の Reflector が反射を描くときに使う分だけを持つ、描画器の代わり */
  function fakeRenderer() {
    return {
      render: vi.fn(),
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
      clear: vi.fn(),
      autoClear: true,
      xr: { enabled: false },
      shadowMap: { autoUpdate: true },
      state: { buffers: { depth: { setMask: vi.fn() } }, viewport: vi.fn() },
    };
  }

  function renderFrames(updateEvery: number, frames: number) {
    const m = new Mirror({
      center: new THREE.Vector3(0, 1, -1.1),
      width: 0.8,
      height: 0.6,
      textureSize: 128,
      updateEvery,
      multisample: 0,
    });
    m.group.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.03, 30);
    camera.position.set(0, 1, 0); // 鏡の正面から見る
    camera.updateMatrixWorld();
    const renderer = fakeRenderer();
    const scene = new THREE.Scene();
    for (let i = 0; i < frames; i++) {
      (m.surface.onBeforeRender as any)(renderer, scene, camera, m.surface.geometry, m.surface.material, null);
    }
    return renderer.render.mock.calls.length;
  }

  it('updateEvery=2（スマホ）なら、反射は 1 フレームおきにだけ描き直す', () => {
    expect(renderFrames(2, 6)).toBe(3);
  });

  it('updateEvery=1（PC）なら、毎フレーム描き直す', () => {
    expect(renderFrames(1, 6)).toBe(6);
  });
});

describe('曇りの見た目の更新', () => {
  function withContext() {
    const ctx = fakeContext();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(ctx as any);
    const m = mirror();
    const texture = (m as any).fogTexture as THREE.Texture;
    return { m, ctx, texture };
  }

  it('作った時点で一度、曇りを書き込む', () => {
    const { ctx } = withContext();
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
  });

  it('曇りが変わっても、更新は 1/15 秒おきにまとめる（毎フレームは書き込まない）', () => {
    const { m, ctx, texture } = withContext();
    const v0 = texture.version;
    m.clearAt(new THREE.Vector3(0, 1, -1.1), 0.12, 1, 1 / 60);
    m.update(1 / 60);
    m.update(1 / 60);
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    expect(texture.version).toBe(v0);
    m.update(1 / 60);
    m.update(1 / 60); // 4/60 秒 ≥ 1/15 秒
    expect(ctx.putImageData).toHaveBeenCalledTimes(2);
    expect(texture.version).toBe(v0 + 1); // needsUpdate で GPU に送り直す
  });

  it('書き込む画素は曇りの濃さ（晴れた所は暗い灰色）', () => {
    const { m, ctx } = withContext();
    for (let i = 0; i < 30; i++) m.clearAt(new THREE.Vector3(0, 1, -1.1), 0.12, 1, 1 / 60);
    m.update(0.1);
    const image = ctx.putImageData.mock.calls.at(-1)![0] as ImageData;
    const cols = m.fog.cols;
    const rows = m.fog.rows;
    const center = ((Math.floor(rows / 2)) * cols + Math.floor(cols / 2)) * 4;
    expect(image.data[center + 1]).toBeLessThan(40);
    expect(image.data[1]).toBe(255); // 左上の隅は曇ったまま
  });

  it('曇りきって変化がない間は書き込まない', () => {
    const { m, ctx } = withContext();
    m.update(1);
    m.update(1);
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
  });
});

describe('鏡に映る頭', () => {
  it('鏡用のレイヤーにだけ置かれ、一人称カメラ（既定のレイヤー）には映らない', () => {
    const head = createMirrorHead(DEFAULT_BODY, MIRROR_LAYER);
    const camera = new THREE.PerspectiveCamera();
    const meshes: THREE.Object3D[] = [];
    head.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
    });
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      expect(m.layers.test(camera.layers)).toBe(false);
      expect(m.layers.isEnabled(MIRROR_LAYER)).toBe(true);
    }
  });

  it('顔の造作は持たない（丸い形と輪郭線だけ）', () => {
    const head = createMirrorHead(DEFAULT_BODY, MIRROR_LAYER);
    const meshes = head.children.filter((o) => (o as THREE.Mesh).isMesh);
    expect(meshes).toHaveLength(2);
  });

  it('当たり判定の対象にならない（シャワーやスポンジが頭に当たらない）', () => {
    const head = createMirrorHead(DEFAULT_BODY, MIRROR_LAYER);
    head.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0.86, 1), new THREE.Vector3(0, 0, -1));
    ray.layers.enableAll();
    expect(ray.intersectObject(head, true)).toEqual([]);
  });
});

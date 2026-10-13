// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MIRROR_LAYER, VIEW_ONLY_LAYER } from './layers';

// createStage の配線（実際に使うカメラ）を確かめるため、WebGL を使う描画器だけ差し替える
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    outputColorSpace = '';
    setPixelRatio() {}
    setSize() {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

describe('浴室の組み立て（createStage）', () => {
  it('組み立てたカメラは一人称のレイヤー設定になっている（湯気・しぶきを描き、鏡だけの頭は描かない）', async () => {
    // タイルのテクスチャ用のキャンバスは、描く操作だけ持つ代わりにする
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: () => {},
      strokeRect: () => {},
    } as any);
    const { createStage, EYE_POSITION } = await import('./stage');
    const { camera } = createStage(document.createElement('canvas'));
    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(camera.layers.isEnabled(VIEW_ONLY_LAYER)).toBe(true);
    expect(camera.layers.isEnabled(MIRROR_LAYER)).toBe(false);
    expect(camera.position.equals(EYE_POSITION)).toBe(true);
  });
});

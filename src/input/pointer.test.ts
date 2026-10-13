// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { LookController } from './look';
import { PointerInput, type SurfaceHit } from './pointer';

/**
 * 画面 100x100px、正射影カメラで 1px = ワールド 0.02。
 * z=0 に 2x2 の平面（体の代わり）を置くので、画面の中央 ±50px が体の上になる。
 * 平面の外に出るように、平面は x,y ∈ [-0.5, 0.5]（画面 25〜75px）に縮める。
 */
const PX = 0.02;
const ON = 50; // 体の上
const OFF = 5; // 体の外

let el: HTMLDivElement;
let camera: THREE.OrthographicCamera;
let plane: THREE.Mesh;
let look: { usingTilt: boolean; drag: Mock };
let cb: { onScrub: Mock; onScrubEnd: Mock; onHover: Mock };
let input: PointerInput;
let capture: Mock;

function pointer(
  type: string,
  init: { id?: number; x?: number; y?: number; button?: number; pointerType?: string } = {},
): Event {
  const opts = {
    bubbles: true,
    cancelable: true,
    clientX: init.x ?? ON,
    clientY: init.y ?? ON,
    button: init.button ?? 0,
  };
  const props = { pointerId: init.id ?? 1, pointerType: init.pointerType ?? 'touch' };
  if (typeof PointerEvent !== 'undefined') {
    return new PointerEvent(type, { ...opts, ...props });
  }
  // jsdom に PointerEvent が無い場合の代替
  const e = new MouseEvent(type, opts);
  Object.defineProperty(e, 'pointerId', { value: props.pointerId });
  Object.defineProperty(e, 'pointerType', { value: props.pointerType });
  return e;
}

function fire(type: string, init?: Parameters<typeof pointer>[1]) {
  el.dispatchEvent(pointer(type, init));
}

/** 画面の x(px) に対応するワールドの x */
const worldX = (px: number) => (px / 100) * 2 - 1;

function setup(opts: { tilt?: boolean } = {}) {
  el?.remove();
  el = document.createElement('div');
  document.body.appendChild(el);
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0 }) as DOMRect;
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 300 });
  capture = vi.fn();
  el.setPointerCapture = capture;

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.updateMatrixWorld();

  plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  plane.updateMatrixWorld();

  look = { usingTilt: opts.tilt ?? false, drag: vi.fn() };
  cb = { onScrub: vi.fn(), onScrubEnd: vi.fn(), onHover: vi.fn() };
  input = new PointerInput(el, camera, [plane], look as unknown as LookController, cb);
}

const mode = () => (input as any).mode as string;

beforeEach(() => setup());

afterEach(() => {
  el.remove();
  vi.restoreAllMocks();
});

describe('PointerInput 押下（DT-1）', () => {
  it('左ボタンで体の上を押すと、こする操作が始まる', () => {
    fire('pointerdown', { x: ON, y: ON });
    expect(mode()).toBe('scrub');
    expect(cb.onScrub).toHaveBeenCalledTimes(1);
    const [hit, speed] = cb.onScrub.mock.calls[0] as [SurfaceHit, number];
    expect(hit.point.x).toBeCloseTo(0);
    expect(speed).toBe(0);
    expect(cb.onHover).toHaveBeenCalledWith(hit, true);
    expect(capture).toHaveBeenCalledWith(1);
    expect(el.classList.contains('is-looking')).toBe(false);
  });

  it('傾きモード中でも、体の上を押せばこする操作になる', () => {
    setup({ tilt: true });
    fire('pointerdown', { x: ON });
    expect(mode()).toBe('scrub');
    expect(cb.onScrub).toHaveBeenCalledTimes(1);
  });

  it('傾きモードでないとき、体の外を押すと視線操作が始まる', () => {
    fire('pointerdown', { x: OFF, y: OFF });
    expect(mode()).toBe('look');
    expect(cb.onScrub).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith(1);
    expect(el.classList.contains('is-looking')).toBe(true);
  });

  it('傾きモード中に体の外を押しても、何も始まらずキャプチャもしない', () => {
    setup({ tilt: true });
    fire('pointerdown', { x: OFF, y: OFF });
    expect(mode()).toBe('idle');
    expect(capture).not.toHaveBeenCalled();
    expect(el.classList.contains('is-looking')).toBe(false);
  });

  it('右ボタンで押すと、体の上でも視線操作になる', () => {
    fire('pointerdown', { x: ON, button: 2, pointerType: 'mouse' });
    expect(mode()).toBe('look');
    expect(cb.onScrub).not.toHaveBeenCalled();
    expect(el.classList.contains('is-looking')).toBe(true);
  });

  it('傾きモード中に右ボタンで押しても、何も始まらない', () => {
    setup({ tilt: true });
    fire('pointerdown', { x: ON, button: 2, pointerType: 'mouse' });
    expect(mode()).toBe('idle');
    expect(cb.onScrub).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('操作中に別の指で押しても無視する', () => {
    fire('pointerdown', { id: 1, x: ON });
    fire('pointerdown', { id: 2, x: OFF });
    expect(mode()).toBe('scrub');
    expect(cb.onScrub).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
    expect((input as any).pointerId).toBe(1);
  });
});

describe('PointerInput 離す・取り消し（DT-2）', () => {
  it('押した指と違う pointerId の up は無視する', () => {
    fire('pointerdown', { id: 1, x: ON });
    fire('pointerup', { id: 2 });
    expect(mode()).toBe('scrub');
    expect(cb.onScrubEnd).not.toHaveBeenCalled();
  });

  it('タッチでこすっている指を離すと、こすり終わりとスポンジ非表示を通知して待機に戻る', () => {
    fire('pointerdown', { id: 1, x: ON });
    cb.onHover.mockClear();
    fire('pointerup', { id: 1 });
    expect(cb.onScrubEnd).toHaveBeenCalledTimes(1);
    expect(cb.onHover).toHaveBeenCalledWith(null, false);
    expect(mode()).toBe('idle');
  });

  it('マウスでこすり終えたときは、こすり終わりだけ通知しスポンジは消さない', () => {
    fire('pointerdown', { id: 1, x: ON, pointerType: 'mouse' });
    cb.onHover.mockClear();
    fire('pointerup', { id: 1, pointerType: 'mouse' });
    expect(cb.onScrubEnd).toHaveBeenCalledTimes(1);
    expect(cb.onHover).not.toHaveBeenCalled();
  });

  it('タッチの視線操作を離すと、こすり終わりは通知せず、スポンジを消して is-looking を外す', () => {
    fire('pointerdown', { id: 1, x: OFF, y: OFF });
    fire('pointerup', { id: 1 });
    expect(cb.onScrubEnd).not.toHaveBeenCalled();
    expect(cb.onHover).toHaveBeenCalledWith(null, false);
    expect(el.classList.contains('is-looking')).toBe(false);
    expect(mode()).toBe('idle');
  });

  it('マウスの視線操作を離しても、こすり終わりは通知しない', () => {
    fire('pointerdown', { id: 1, x: OFF, y: OFF, pointerType: 'mouse' });
    fire('pointerup', { id: 1, pointerType: 'mouse' });
    expect(cb.onScrubEnd).not.toHaveBeenCalled();
    expect(cb.onHover).not.toHaveBeenCalled();
    expect(mode()).toBe('idle');
  });

  it('pointercancel でも up と同じ後始末をする', () => {
    fire('pointerdown', { id: 1, x: ON });
    fire('pointercancel', { id: 1 });
    expect(cb.onScrubEnd).toHaveBeenCalledTimes(1);
    expect(cb.onHover).toHaveBeenLastCalledWith(null, false);
    expect(mode()).toBe('idle');
  });

  it('up が届かずにキャプチャが外れた（lostpointercapture）ときも同じ後始末をする', () => {
    fire('pointerdown', { id: 1, x: ON });
    fire('lostpointercapture', { id: 1 });
    expect(cb.onScrubEnd).toHaveBeenCalledTimes(1);
    expect(cb.onHover).toHaveBeenLastCalledWith(null, false);
    expect(mode()).toBe('idle');
  });

  it('up のあとに lostpointercapture が来ても、こすり終わりは 2 回通知しない', () => {
    fire('pointerdown', { id: 1, x: ON });
    fire('pointerup', { id: 1 });
    fire('lostpointercapture', { id: 1 });
    expect(cb.onScrubEnd).toHaveBeenCalledTimes(1);
  });
});

describe('PointerInput 移動（DT-3）', () => {
  it('待機中にマウスを動かすと、当たり位置をホバー通知し、体の上かどうかでクラスを切り替える', () => {
    fire('pointermove', { x: ON, pointerType: 'mouse' });
    const [hit, scrubbing] = cb.onHover.mock.calls[0] as [SurfaceHit | null, boolean];
    expect(hit).not.toBeNull();
    expect(scrubbing).toBe(false);
    expect(el.classList.contains('is-over-body')).toBe(true);
    fire('pointermove', { x: OFF, y: OFF, pointerType: 'mouse' });
    expect(cb.onHover).toHaveBeenLastCalledWith(null, false);
    expect(el.classList.contains('is-over-body')).toBe(false);
  });

  it('待機中のタッチの移動では何もしない', () => {
    fire('pointermove', { x: ON, pointerType: 'touch' });
    expect(cb.onHover).not.toHaveBeenCalled();
    expect(el.classList.contains('is-over-body')).toBe(false);
  });

  it('視線操作中の移動は、移動量と画面の高さで look.drag を呼ぶ', () => {
    fire('pointerdown', { id: 1, x: 10, y: 10 });
    fire('pointermove', { id: 1, x: 17, y: 6 });
    expect(look.drag).toHaveBeenCalledWith(7, -4, 300);
  });

  it('こすっている間の移動は位置を覚えるだけで、こすりも視線も動かさない', () => {
    fire('pointerdown', { id: 1, x: ON, y: ON });
    cb.onScrub.mockClear();
    fire('pointermove', { id: 1, x: 60, y: 45 });
    expect((input as any).lastX).toBe(60);
    expect((input as any).lastY).toBe(45);
    expect(cb.onScrub).not.toHaveBeenCalled();
    expect(look.drag).not.toHaveBeenCalled();
  });

  it('操作中に違う指の移動は無視する', () => {
    fire('pointerdown', { id: 1, x: 10, y: 10 });
    fire('pointermove', { id: 2, x: 30, y: 30 });
    expect(look.drag).not.toHaveBeenCalled();
    expect((input as any).lastX).toBe(10);
  });
});

describe('PointerInput.update', () => {
  it('待機中の update では何も通知しない', () => {
    input.update();
    expect(cb.onScrub).not.toHaveBeenCalled();
    expect(cb.onHover).not.toHaveBeenCalled();
  });

  it('こすっている途中で体から外れると、スポンジを消す通知だけして泡は足さない', () => {
    fire('pointerdown', { id: 1, x: ON });
    cb.onScrub.mockClear();
    fire('pointermove', { id: 1, x: OFF, y: OFF });
    input.update();
    expect(cb.onHover).toHaveBeenLastCalledWith(null, true);
    expect(cb.onScrub).not.toHaveBeenCalled();
  });

  it('外れた後に体へ戻ると、補間せずに戻った点で 1 回だけこする', () => {
    fire('pointerdown', { id: 1, x: 30 });
    fire('pointermove', { id: 1, x: OFF, y: OFF });
    input.update();
    cb.onScrub.mockClear();
    fire('pointermove', { id: 1, x: 70, y: ON });
    input.update();
    expect(cb.onScrub).toHaveBeenCalledTimes(1);
    const [hit, speed] = cb.onScrub.mock.calls[0] as [SurfaceHit, number];
    expect(hit.point.x).toBeCloseTo(worldX(70));
    expect(speed).toBe(0);
  });

  describe('補間の境界（間隔 0.012）', () => {
    /** 体の上で押してから、ワールド距離 dist だけ横へ動かして update したときの onScrub 回数 */
    const scrubCount = (dist: number) => {
      setup();
      fire('pointerdown', { id: 1, x: 30, y: ON });
      cb.onScrub.mockClear();
      fire('pointermove', { id: 1, x: 30 + dist / PX, y: ON });
      input.update();
      return cb.onScrub.mock.calls.length;
    };
    const e = 1e-4;

    it('0.012 未満の移動では補間せず 1 回だけこする', () => {
      expect(scrubCount(0.012 - e)).toBe(1);
    });

    it('0.012 を少し超える移動（n=1）でも 1 回だけこする', () => {
      expect(scrubCount(0.012 + e)).toBe(1);
    });

    it('0.024 を少し超える移動（n=2）では、補間 1 回と終点で 2 回こする', () => {
      expect(scrubCount(0.024 + e)).toBe(2);
    });

    it('大きく動かしても、1 フレームでこする回数は最大 12 回', () => {
      expect(scrubCount(0.4)).toBe(12);
    });
  });

  it('平面をなぞると、こすった点の間隔はすべて 0.024 以下になる', () => {
    fire('pointerdown', { id: 1, x: 27, y: ON });
    const points: THREE.Vector3[] = [(cb.onScrub.mock.calls[0][0] as SurfaceHit).point];
    cb.onScrub.mockClear();
    for (let x = 27; x <= 73; x += 4.3) {
      fire('pointermove', { id: 1, x, y: ON });
      input.update();
    }
    for (const call of cb.onScrub.mock.calls) points.push((call[0] as SurfaceHit).point);
    expect(points.length).toBeGreaterThan(10);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].distanceTo(points[i - 1])).toBeLessThanOrEqual(0.024 + 1e-9);
    }
  });

  it('こする速さは 移動距離 / 経過時間 で、経過時間の下限は 1/240 秒', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    fire('pointerdown', { id: 1, x: 40, y: ON });
    // 0.1 秒で 0.01 移動
    now.mockReturnValue(1100);
    cb.onScrub.mockClear();
    fire('pointermove', { id: 1, x: 40.5, y: ON });
    input.update();
    expect(cb.onScrub.mock.calls.at(-1)![1]).toBeCloseTo(0.01 / 0.1, 6);
    // 同じ時刻（経過 0）でさらに 0.01 移動 → 経過時間は 1/240 とみなす
    cb.onScrub.mockClear();
    fire('pointermove', { id: 1, x: 41, y: ON });
    input.update();
    expect(cb.onScrub.mock.calls.at(-1)![1]).toBeCloseTo(0.01 * 240, 6);
  });

  it('far より遠い面には当たらない', () => {
    const origin = new THREE.Vector3(0, 0, 1);
    const dir = new THREE.Vector3(0, 0, -1);
    expect(input.hitRay(origin, dir, 0.5)).toBeNull();
    expect(input.hitRay(origin, dir, 2)).not.toBeNull();
  });

  it('当たり位置の法線はワールド座標で返す（回転したメッシュでも）', () => {
    plane.rotation.y = Math.PI / 2; // 面の向き +Z → +X
    plane.updateMatrixWorld();
    const hit = input.hitRay(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0));
    expect(hit).not.toBeNull();
    expect(hit!.normal.x).toBeCloseTo(1, 6);
    expect(hit!.normal.y).toBeCloseTo(0, 6);
    expect(hit!.normal.z).toBeCloseTo(0, 6);
  });

  it('1 本目の指でこすっている間に 2 本目を押す・動かす・離しても、状態は変わらない', () => {
    fire('pointerdown', { id: 1, x: ON, y: ON });
    fire('pointerdown', { id: 2, x: OFF, y: OFF });
    fire('pointermove', { id: 2, x: 20, y: 20 });
    fire('pointerup', { id: 2 });
    expect(mode()).toBe('scrub');
    expect((input as any).pointerId).toBe(1);
    expect((input as any).lastX).toBe(ON);
    expect(cb.onScrubEnd).not.toHaveBeenCalled();
    expect(look.drag).not.toHaveBeenCalled();
  });
});

describe('PointerInput のキャプチャ失敗と後始末', () => {
  it('setPointerCapture が例外を投げても、こする操作は始まり、離せば待機に戻る', () => {
    capture.mockImplementation(() => {
      throw new DOMException('not active', 'InvalidStateError');
    });
    expect(() => fire('pointerdown', { id: 1, x: ON, y: ON })).not.toThrow();
    expect(mode()).toBe('scrub');
    fire('pointerup', { id: 1 });
    expect(mode()).toBe('idle');
    expect(cb.onScrubEnd).toHaveBeenCalledTimes(1);
  });

  it('dispose 後は押す・動かす・離す・右クリックメニューのどれにも反応しない', () => {
    input.dispose();
    fire('pointerdown', { id: 1, x: ON, y: ON });
    fire('pointermove', { id: 1, x: 20, y: 20, pointerType: 'mouse' });
    fire('pointerup', { id: 1 });
    expect(mode()).toBe('idle');
    expect(cb.onScrub).not.toHaveBeenCalled();
    expect(cb.onHover).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
  });

  it('dispose 前は右クリックメニューを出さない', () => {
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });
});

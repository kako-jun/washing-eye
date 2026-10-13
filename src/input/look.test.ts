// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LookController } from './look';

const deg = THREE.MathUtils.degToRad;
const PITCH_MIN = deg(-82);
const PITCH_MAX = deg(25);
const YAW_LIMIT = deg(110);
const EPS = 1e-6;

/** viewportHeight を 1.6 にすると、ドラッグ 1px = 1rad になる */
const H = 1.6;

function targets(look: LookController) {
  const l = look as any;
  return { yaw: l.targetYaw as number, pitch: l.targetPitch as number };
}

function orientationEvent(
  alpha: number | null,
  beta: number | null,
  gamma: number | null,
  timeStamp?: number,
): Event {
  const e = new Event('deviceorientation');
  Object.defineProperty(e, 'alpha', { value: alpha });
  Object.defineProperty(e, 'beta', { value: beta });
  Object.defineProperty(e, 'gamma', { value: gamma });
  if (timeStamp !== undefined) Object.defineProperty(e, 'timeStamp', { value: timeStamp });
  return e;
}

/** timeStamp（ミリ秒）を渡すと、その時刻に届いた通知として扱う */
function tilt(alpha: number | null, beta: number | null, gamma: number | null, timeStamp?: number) {
  window.dispatchEvent(orientationEvent(alpha, beta, gamma, timeStamp));
}

/** requestPermission を持たない DeviceOrientationEvent（Android 等） */
class PlainOrientationEvent extends Event {}

function stubPermission(impl: () => Promise<'granted' | 'denied'>) {
  class WithPermission extends Event {
    static requestPermission = impl;
  }
  vi.stubGlobal('DeviceOrientationEvent', WithPermission);
}

/** 傾きを有効にしたコントローラ */
async function tiltLook(onActive = () => {}) {
  vi.stubGlobal('DeviceOrientationEvent', PlainOrientationEvent);
  const look = new LookController();
  await look.enableTilt(onActive);
  return look;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LookController ドラッグ', () => {
  it('右へドラッグすると目標の yaw が増え、update で yaw が目標へ近づく', () => {
    const look = new LookController();
    look.drag(10, 0, 300);
    expect(targets(look).yaw).toBeGreaterThan(0);
    const cam = new THREE.PerspectiveCamera();
    look.update(cam, 0.016);
    expect(look.yaw).toBeGreaterThan(0);
    expect(look.yaw).toBeLessThan(targets(look).yaw);
  });

  it('pitch は上限 25° の手前では止まらず、ちょうどで上限、超えても上限で止まる', () => {
    const before = new LookController();
    before.drag(0, PITCH_MAX - targets(before).pitch - EPS, H);
    expect(targets(before).pitch).toBeLessThan(PITCH_MAX);
    expect(targets(before).pitch).toBeCloseTo(PITCH_MAX - EPS, 9);

    const exact = new LookController();
    exact.drag(0, PITCH_MAX - targets(exact).pitch, H);
    expect(targets(exact).pitch).toBeCloseTo(PITCH_MAX, 12);

    const over = new LookController();
    over.drag(0, 10, H);
    expect(targets(over).pitch).toBe(PITCH_MAX);
  });

  it('pitch は下限 -82° の手前では止まらず、ちょうどで下限、超えても下限で止まる', () => {
    const before = new LookController();
    before.drag(0, PITCH_MIN - targets(before).pitch + EPS, H);
    expect(targets(before).pitch).toBeGreaterThan(PITCH_MIN);
    expect(targets(before).pitch).toBeCloseTo(PITCH_MIN + EPS, 9);

    const exact = new LookController();
    exact.drag(0, PITCH_MIN - targets(exact).pitch, H);
    expect(targets(exact).pitch).toBeCloseTo(PITCH_MIN, 12);

    const over = new LookController();
    over.drag(0, -10, H);
    expect(targets(over).pitch).toBe(PITCH_MIN);
  });

  it('yaw は ±110° の手前では止まらず、ちょうどで上限、超えても上限で止まる', () => {
    for (const sign of [1, -1]) {
      const before = new LookController();
      before.drag(sign * (YAW_LIMIT - EPS), 0, H);
      expect(Math.abs(targets(before).yaw)).toBeLessThan(YAW_LIMIT);

      const exact = new LookController();
      exact.drag(sign * YAW_LIMIT, 0, H);
      expect(targets(exact).yaw).toBe(sign * YAW_LIMIT);

      const over = new LookController();
      over.drag(sign * 10, 0, H);
      expect(targets(over).yaw).toBe(sign * YAW_LIMIT);
    }
  });

  it('画面の高さが 0 のドラッグでは視線が NaN にならず、動きもしない', () => {
    const look = new LookController();
    const before = targets(look);
    look.drag(30, 30, 0);
    expect(targets(look)).toEqual(before);
    const cam = new THREE.PerspectiveCamera();
    look.update(cam, 0.016);
    expect(Number.isFinite(cam.rotation.x)).toBe(true);
    expect(Number.isFinite(cam.rotation.y)).toBe(true);
  });
});

describe('LookController ドラッグの異常値', () => {
  const finiteAfterUpdate = (look: LookController) => {
    const cam = new THREE.PerspectiveCamera();
    look.update(cam, 0.016);
    return Number.isFinite(cam.rotation.x) && Number.isFinite(cam.rotation.y);
  };

  for (const [label, h] of [
    ['負', -300],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const) {
    it(`画面の高さが ${label} のドラッグでは視線が動かず、NaN にもならない`, () => {
      const look = new LookController();
      const before = targets(look);
      look.drag(30, 30, h);
      expect(targets(look)).toEqual(before);
      expect(finiteAfterUpdate(look)).toBe(true);
    });
  }

  for (const [label, dx, dy] of [
    ['dx が NaN', Number.NaN, 0],
    ['dy が NaN', 0, Number.NaN],
    ['dx が Infinity', Number.POSITIVE_INFINITY, 0],
    ['dy が -Infinity', 0, Number.NEGATIVE_INFINITY],
  ] as const) {
    it(`${label} のドラッグでは視線が動かず、NaN にもならない`, () => {
      const look = new LookController();
      const before = targets(look);
      look.drag(dx, dy, 300);
      expect(targets(look)).toEqual(before);
      expect(finiteAfterUpdate(look)).toBe(true);
    });
  }

  it('異常値のドラッグの後も、正常なドラッグは普通に効く', () => {
    const look = new LookController();
    look.drag(Number.NaN, 0, 300);
    look.drag(10, 0, 0);
    look.drag(10, 0, 300);
    expect(targets(look).yaw).toBeCloseTo((10 * 1.6) / 300, 9);
  });
});

describe('LookController.enableTilt', () => {
  it('DeviceOrientationEvent が無い環境では false を返す', async () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    await expect(new LookController().enableTilt(() => {})).resolves.toBe(false);
  });

  it('許可要求が denied なら false を返し、リスナーを登録しない', async () => {
    stubPermission(() => Promise.resolve('denied'));
    const spy = vi.spyOn(window, 'addEventListener');
    await expect(new LookController().enableTilt(() => {})).resolves.toBe(false);
    expect(spy.mock.calls.filter(([type]) => type === 'deviceorientation')).toHaveLength(0);
  });

  it('許可要求が reject されたら false を返す', async () => {
    stubPermission(() => Promise.reject(new Error('no')));
    await expect(new LookController().enableTilt(() => {})).resolves.toBe(false);
  });

  it('許可要求が granted なら true を返す', async () => {
    stubPermission(() => Promise.resolve('granted'));
    await expect(new LookController().enableTilt(() => {})).resolves.toBe(true);
  });

  it('許可要求が無い環境では true を返すが、値が届くまでは傾きモードにならない', async () => {
    vi.stubGlobal('DeviceOrientationEvent', PlainOrientationEvent);
    const look = new LookController();
    await expect(look.enableTilt(() => {})).resolves.toBe(true);
    expect(look.usingTilt).toBe(false);
  });

  it('2 回呼んでもリスナーは 1 つだけで、onActive は後から渡したものに差し替わる', async () => {
    vi.stubGlobal('DeviceOrientationEvent', PlainOrientationEvent);
    const spy = vi.spyOn(window, 'addEventListener');
    const look = new LookController();
    const first = vi.fn();
    const second = vi.fn();
    await look.enableTilt(first);
    await expect(look.enableTilt(second)).resolves.toBe(true);
    expect(spy.mock.calls.filter(([type]) => type === 'deviceorientation')).toHaveLength(1);
    tilt(0, 90, 0);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('許可要求を待つ間に 2 回目が呼ばれても、リスナーは 1 つだけ登録される', async () => {
    const resolvers: ((v: 'granted') => void)[] = [];
    stubPermission(() => new Promise((r) => resolvers.push(r)));
    const spy = vi.spyOn(window, 'addEventListener');
    const look = new LookController();
    const p1 = look.enableTilt(() => {});
    const p2 = look.enableTilt(() => {});
    resolvers.forEach((r) => r('granted'));
    await expect(Promise.all([p1, p2])).resolves.toEqual([true, true]);
    expect(spy.mock.calls.filter(([type]) => type === 'deviceorientation')).toHaveLength(1);
  });
});

describe('LookController 傾き入力', () => {
  it('alpha が null のイベントでは傾きモードにならない', async () => {
    const look = await tiltLook();
    tilt(null, 90, 0);
    expect(look.usingTilt).toBe(false);
  });

  it('beta が null のイベントでは傾きモードにならない', async () => {
    const look = await tiltLook();
    tilt(0, null, 0);
    expect(look.usingTilt).toBe(false);
  });

  it('gamma が null のイベントでは傾きモードにならない', async () => {
    const look = await tiltLook();
    tilt(0, 90, null);
    expect(look.usingTilt).toBe(false);
  });

  it('有効なイベント 1 回で傾きモードになり onActive が 1 回だけ呼ばれ、以降は呼ばれない', async () => {
    const onActive = vi.fn();
    const look = await tiltLook(onActive);
    tilt(0, 90, 0);
    expect(look.usingTilt).toBe(true);
    expect(onActive).toHaveBeenCalledTimes(1);
    tilt(10, 80, 0);
    tilt(20, 70, 0);
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('端末を立てた姿勢（beta=90）では pitch が水平（≈0）になる', async () => {
    const look = await tiltLook();
    tilt(0, 90, 0);
    expect(targets(look).pitch).toBeCloseTo(0, 6);
  });

  it('端末を水平に寝かせた姿勢（beta=0）では pitch が下限で止まる', async () => {
    const look = await tiltLook();
    tilt(0, 0, 0);
    expect(targets(look).pitch).toBeCloseTo(PITCH_MIN, 9);
  });

  it('最初の向きが正面（yaw 0）になり、alpha を回すと yaw が同じ向き（+）に変わる', async () => {
    const look = await tiltLook();
    tilt(40, 90, 0);
    expect(targets(look).yaw).toBeCloseTo(0, 9);
    tilt(70, 90, 0);
    expect(targets(look).yaw).toBeCloseTo(deg(30), 6);
  });

  it('±180° をまたいで回しても、差は近い側（170°→-170° は 20°）で測る', async () => {
    const look = await tiltLook();
    tilt(170, 90, 0);
    tilt(-170, 90, 0);
    expect(targets(look).yaw).toBeCloseTo(deg(20), 6);
  });

  it('recenter 後の最初のイベントの向きが新しい正面（yaw 0）になる', async () => {
    const look = await tiltLook();
    tilt(0, 90, 0);
    tilt(50, 90, 0);
    expect(targets(look).yaw).toBeCloseTo(deg(50), 6);
    look.recenter();
    tilt(50, 90, 0);
    expect(targets(look).yaw).toBeCloseTo(0, 9);
  });

  it('recenter 後も yaw の上限 ±110° が効く', async () => {
    const look = await tiltLook();
    tilt(0, 90, 0);
    look.recenter();
    tilt(20, 90, 0);
    tilt(170, 90, 0);
    expect(targets(look).yaw).toBe(YAW_LIMIT);
  });

  it('画面が横向き（orientation.angle=90）でも、視線の向き（yaw/pitch）は縦向きと同じ（補正はロール成分だけに効く）', async () => {
    // 同じ端末姿勢を、縦向き・横向きで比べる
    const run = async (angle: number) => {
      vi.stubGlobal('screen', { orientation: { angle } });
      const look = await tiltLook();
      tilt(10, 70, 25);
      tilt(40, 60, 35);
      return targets(look);
    };
    const portrait = await run(0);
    const landscape = await run(90);
    expect(landscape.yaw).toBeCloseTo(portrait.yaw, 9);
    expect(landscape.pitch).toBeCloseTo(portrait.pitch, 9);
  });
});

describe('LookController 傾き入力 真下付近のヨー', () => {
  it('ほぼ真下を向いた状態で端末の向き（alpha・gamma）が大きく揺れても、yaw はほとんど動かない', async () => {
    const look = await tiltLook();
    tilt(0, 90, 0); // 正面を決める
    tilt(0, 2, 0); // ほぼ真下を向く
    const start = targets(look).yaw;
    for (const [a, g] of [
      [90, 1],
      [-90, -1],
      [180, 2],
      [45, -2],
    ]) {
      tilt(a, 1, g);
      expect(Math.abs(targets(look).yaw - start)).toBeLessThan(deg(2));
      expect(Number.isFinite(targets(look).yaw)).toBe(true);
    }
  });

  it('普通に見下ろす角度（45°）では、alpha を 30° 回すと yaw も 30° 変わる（減衰しない）', async () => {
    const look = await tiltLook();
    tilt(0, 45, 0);
    tilt(30, 45, 0);
    expect(targets(look).yaw).toBeCloseTo(deg(30), 6);
  });

  it('深めに見下ろす角度（約 80°）では、yaw は回した分の途中までしか変わらない', async () => {
    const look = await tiltLook();
    tilt(0, 90, 0, 0); // 正面を決める
    tilt(0, 10, 0, 16);
    tilt(30, 10, 0, 32);
    const yaw = targets(look).yaw;
    expect(yaw).toBeGreaterThan(0);
    expect(yaw).toBeLessThan(deg(30) - deg(1));
  });

  it('減衰中の追いつき方は通知の頻度によらない（20Hz で 1 回と 120Hz で 6 回、50ms 後の yaw が同じ）', async () => {
    const run = async (hz: number) => {
      const look = await tiltLook();
      tilt(0, 90, 0, 0);
      tilt(0, 10, 0, 0);
      const steps = Math.round((50 * hz) / 1000);
      for (let i = 1; i <= steps; i++) tilt(30, 10, 0, (i * 1000) / hz);
      return targets(look).yaw;
    };
    const slow = await run(20);
    const fast = await run(120);
    // まだ追いつききっていない途中で比べる（通知ごとに同じ割合で寄せる作りだと 6 回分の差が出る）
    expect(slow).toBeGreaterThan(deg(1));
    expect(slow).toBeLessThan(deg(29));
    expect(fast).toBeCloseTo(slow, 6);
  });

  it('timeStamp が 0 のまま進まない環境では、既定の間隔（60Hz 相当）で追いつく', async () => {
    const run = async (stamp: (i: number) => number) => {
      const look = await tiltLook();
      tilt(0, 90, 0, stamp(0));
      tilt(0, 10, 0, stamp(1));
      for (let i = 2; i < 8; i++) tilt(30, 10, 0, stamp(i));
      return targets(look).yaw;
    };
    const frozen = await run(() => 0);
    const at60Hz = await run((i) => (i * 1000) / 60);
    expect(frozen).toBeGreaterThan(0);
    expect(frozen).toBeLessThan(deg(30));
    expect(frozen).toBeCloseTo(at60Hz, 6);
  });

  it('減衰中でも、短い間隔で 1 回だけ届いた通知では少ししか寄らず、時間が経つほど寄る', async () => {
    const at = async (ms: number) => {
      const look = await tiltLook();
      tilt(0, 90, 0, 0);
      tilt(0, 10, 0, 0);
      tilt(30, 10, 0, ms);
      return targets(look).yaw;
    };
    const short = await at(4);
    const long = await at(100);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });

  it('最初の通知がほぼ真下なら正面を決めず、真下から外れた最初の通知の向きを正面にする', async () => {
    const look = await tiltLook();
    tilt(120, 1, 3, 0); // 真下: ヨーが不安定なので基準にしない
    expect(targets(look).yaw).toBe(0);
    tilt(50, 90, 0, 16); // 立てた姿勢: ここが正面
    expect(targets(look).yaw).toBeCloseTo(0, 9);
    tilt(80, 90, 0, 32);
    expect(targets(look).yaw).toBeCloseTo(deg(30), 6);
  });

  for (const down of [75, 78]) {
    it(`足元（${down}°）を見下ろしたまま始めても正面が決まり、端末を回すと視線が動く`, async () => {
      const look = await tiltLook();
      const beta = 90 - down; // 横の傾きが無ければ、見下ろし角 = 90° - beta
      tilt(0, beta, 0, 0);
      expect(targets(look).pitch).toBeCloseTo(deg(-down), 6);
      expect((look as any).yawOrigin).not.toBeNull();
      for (let i = 1; i <= 30; i++) tilt(30, beta, 0, i * 16);
      expect(targets(look).yaw).toBeGreaterThan(deg(5));
    });
  }

  it('真下付近（88° 側）を見下ろしたまま始めると正面は決まらない', async () => {
    const look = await tiltLook();
    tilt(0, 3, 0, 0);
    expect((look as any).yawOrigin).toBeNull();
  });

  it('真下付近で「正面に戻す」を押しても、不安定なヨーを正面にせず、真下から外れたときの向きを正面にする', async () => {
    const look = await tiltLook();
    tilt(0, 90, 0, 0);
    tilt(40, 90, 0, 16);
    expect(targets(look).yaw).toBeCloseTo(deg(40), 6);
    tilt(40, 1, 0, 32); // 真下を向く
    look.recenter();
    tilt(170, 1, 5, 48); // 真下で向きが大きく揺れても、yaw は変わらない
    tilt(-100, 2, -5, 64);
    expect(targets(look).yaw).toBeCloseTo(deg(40), 3);
    tilt(70, 90, 0, 80); // 真下から外れた: この向きが新しい正面
    expect(targets(look).yaw).toBeCloseTo(0, 9);
    tilt(100, 90, 0, 96);
    expect(targets(look).yaw).toBeCloseTo(deg(30), 6);
  });

  it('真下から普通の角度に戻ると、また回した分だけ yaw が変わる', async () => {
    const look = await tiltLook();
    tilt(0, 90, 0);
    tilt(120, 1, 0); // 真下で大きく回しても yaw は追わない
    tilt(30, 90, 0); // 立てた姿勢に戻ると、今の向き（30°）に追いつく
    expect(targets(look).yaw).toBeCloseTo(deg(30), 6);
  });
});

describe('LookController.update', () => {
  it('dt=0 では視線は変わらない', () => {
    const look = new LookController();
    look.drag(0.5, 0.2, H);
    const yaw = look.yaw;
    const pitch = look.pitch;
    look.update(new THREE.PerspectiveCamera(), 0);
    expect(look.yaw).toBe(yaw);
    expect(look.pitch).toBe(pitch);
  });

  it('大きな dt では目標に収束し、カメラの回転順は YXZ になる', () => {
    const look = new LookController();
    look.drag(0.5, 0.2, H);
    const cam = new THREE.PerspectiveCamera();
    look.update(cam, 100);
    expect(look.yaw).toBeCloseTo(targets(look).yaw, 12);
    expect(look.pitch).toBeCloseTo(targets(look).pitch, 12);
    expect(cam.rotation.order).toBe('YXZ');
    expect(cam.rotation.x).toBeCloseTo(look.pitch, 12);
    expect(cam.rotation.y).toBeCloseTo(look.yaw, 12);
  });
});

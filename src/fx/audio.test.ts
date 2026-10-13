// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundBoard, bindAudioResumeOnGesture, bindAudioToVisibility } from './audio';

/** 音のノードの代わり。connect は繋ぎ先を返して連鎖できるようにする */
function fakeNode(): any {
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() });
  return {
    connect: (n: unknown) => n,
    start: vi.fn(),
    stop: vi.fn(),
    gain: param(),
    frequency: param(),
    Q: param(),
  };
}

/** AudioContext の代わり。suspend/resume の呼び出しと state を記録する */
class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  state: AudioContextState = 'running';
  sampleRate = 100;
  currentTime = 0;
  destination = {};
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  constructor() {
    FakeAudioContext.last = this;
  }
  createGain = fakeNode;
  createBiquadFilter = fakeNode;
  createBufferSource = fakeNode;
  createOscillator = fakeNode;
  createBuffer(_ch: number, len: number) {
    const data = new Float32Array(len);
    return { getChannelData: () => data };
  }
}

/** visibilityState を切り替えられる document の代わり */
function fakeDoc() {
  const target = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  target.visibilityState = 'visible';
  const set = (v: DocumentVisibilityState) => {
    target.visibilityState = v;
    target.dispatchEvent(new Event('visibilitychange'));
  };
  return { doc: target as unknown as Document, set };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAudioContext.last = null;
});

describe('SoundBoard の一時停止と再開', () => {
  it('開始前の suspend/resume は何もせず、例外も出さない', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const sound = new SoundBoard();
    expect(() => {
      sound.suspend();
      sound.resume();
    }).not.toThrow();
    expect(FakeAudioContext.last).toBeNull();
  });

  it('開始後は suspend で AudioContext を止め、resume で戻す', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const sound = new SoundBoard();
    sound.start();
    const ctx = FakeAudioContext.last!;
    const resumesAtStart = ctx.resume.mock.calls.length;
    sound.suspend();
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    sound.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(resumesAtStart + 1);
  });
});

describe('bindAudioToVisibility', () => {
  it('タブが隠れたら suspend、見えたら resume を呼ぶ', () => {
    const { doc, set } = fakeDoc();
    const sound = { suspend: vi.fn(), resume: vi.fn() };
    bindAudioToVisibility(doc, sound);
    set('hidden');
    expect(sound.suspend).toHaveBeenCalledTimes(1);
    expect(sound.resume).not.toHaveBeenCalled();
    set('visible');
    expect(sound.resume).toHaveBeenCalledTimes(1);
  });

  it('外した後は visibilitychange に反応しない', () => {
    const { doc, set } = fakeDoc();
    const sound = { suspend: vi.fn(), resume: vi.fn() };
    const unbind = bindAudioToVisibility(doc, sound);
    unbind();
    set('hidden');
    set('visible');
    expect(sound.suspend).not.toHaveBeenCalled();
    expect(sound.resume).not.toHaveBeenCalled();
  });

  it('実際の SoundBoard と組み合わせると、隠れたときに AudioContext が止まり、戻ると動き出す', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { doc, set } = fakeDoc();
    const sound = new SoundBoard();
    sound.start();
    bindAudioToVisibility(doc, sound);
    const ctx = FakeAudioContext.last!;
    set('hidden');
    await Promise.resolve();
    expect(ctx.state).toBe('suspended');
    set('visible');
    await Promise.resolve();
    expect(ctx.state).toBe('running');
  });
});

/** suspend / resume が拒否される AudioContext（iOS で復帰後に再開できない場合など） */
class RejectingAudioContext extends FakeAudioContext {
  // vi.fn は戻り値の Promise に then を付けて結果を記録し、reject を「処理済み」にしてしまうので素の関数で数える
  resumeCalls = 0;
  override suspend = (() => Promise.reject(new Error('suspend denied'))) as any;
  override resume = (() => {
    this.resumeCalls++;
    return Promise.reject(new Error('resume denied'));
  }) as any;
  constructor() {
    super();
    this.state = 'suspended';
  }
}

/** 未処理の reject を数える */
async function countUnhandledRejections(run: () => void): Promise<number> {
  const proc = (globalThis as any).process;
  let count = 0;
  const onUnhandled = () => count++;
  proc.on('unhandledRejection', onUnhandled);
  try {
    run();
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    proc.off('unhandledRejection', onUnhandled);
  }
  return count;
}

describe('SoundBoard の再開・停止が拒否されたとき', () => {
  it('start・suspend・resume のどれで拒否されても、未処理の reject を出さない', async () => {
    vi.stubGlobal('AudioContext', RejectingAudioContext);
    const sound = new SoundBoard();
    const count = await countUnhandledRejections(() => {
      sound.start();
      sound.start(); // 2 回目は resume だけ
      sound.suspend();
      sound.resume();
    });
    expect(count).toBe(0);
    expect((FakeAudioContext.last as RejectingAudioContext).resumeCalls).toBe(3);
  });

  it('再開に失敗して止まったままなら needsResume が true、動いていれば false、開始前も false', async () => {
    vi.stubGlobal('AudioContext', RejectingAudioContext);
    const sound = new SoundBoard();
    expect(sound.needsResume).toBe(false);
    sound.start();
    expect(sound.needsResume).toBe(true);
    FakeAudioContext.last!.state = 'running';
    expect(sound.needsResume).toBe(false);
  });
});

describe('bindAudioResumeOnGesture', () => {
  function setup(needsResume: boolean, visibility: DocumentVisibilityState = 'visible') {
    const target = new EventTarget();
    const sound = { resume: vi.fn(), needsResume };
    const unbind = bindAudioResumeOnGesture(target, { visibilityState: visibility }, sound);
    return { target, sound, unbind };
  }

  it('音が止まったままなら、次の pointerdown・keydown の中で resume をやり直す', () => {
    const { target, sound } = setup(true);
    target.dispatchEvent(new Event('pointerdown'));
    expect(sound.resume).toHaveBeenCalledTimes(1);
    target.dispatchEvent(new Event('keydown'));
    expect(sound.resume).toHaveBeenCalledTimes(2);
  });

  it('音が動いているときは、ユーザー操作があっても resume を呼ばない', () => {
    const { target, sound } = setup(false);
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('keydown'));
    expect(sound.resume).not.toHaveBeenCalled();
  });

  it('タブが隠れているときは resume を呼ばない', () => {
    const { target, sound } = setup(true, 'hidden');
    target.dispatchEvent(new Event('pointerdown'));
    expect(sound.resume).not.toHaveBeenCalled();
  });

  it('外した後はユーザー操作に反応しない', () => {
    const { target, sound, unbind } = setup(true);
    unbind();
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('keydown'));
    expect(sound.resume).not.toHaveBeenCalled();
  });

  it('実際の SoundBoard で、復帰時の再開が拒否された後、ユーザー操作で再開できれば音が戻る', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const sound = new SoundBoard();
    sound.start();
    const ctx = FakeAudioContext.last!;
    ctx.state = 'suspended';
    ctx.resume.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    const { doc, set } = fakeDoc();
    bindAudioToVisibility(doc, sound);
    const target = new EventTarget();
    bindAudioResumeOnGesture(target, doc, sound);
    set('visible'); // 復帰時の resume は拒否される
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.state).toBe('suspended');
    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(ctx.state).toBe('running');
  });
});

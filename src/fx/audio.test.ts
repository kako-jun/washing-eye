// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundBoard, bindAudioToVisibility } from './audio';

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

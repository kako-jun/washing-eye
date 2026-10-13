// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createShowerInput, type ShowerInput } from './shower-input';

let button: HTMLButtonElement;
let started: boolean;
let onChange: Mock<(on: boolean) => void>;
let input: ShowerInput;
let visibility: DocumentVisibilityState;

function press(type: string, pointerId = 1, mouseButton = 0) {
  const e =
    typeof PointerEvent !== 'undefined'
      ? new PointerEvent(type, { pointerId, button: mouseButton, bubbles: true, cancelable: true })
      : Object.defineProperty(new MouseEvent(type, { button: mouseButton, bubbles: true, cancelable: true }), 'pointerId', {
          value: pointerId,
        });
  button.dispatchEvent(e);
}

/** Space キーを target（既定は body）から投げる。preventDefault されたかを返す */
function space(type: 'keydown' | 'keyup', opts: { repeat?: boolean; target?: Element } = {}): boolean {
  const e = new KeyboardEvent(type, {
    code: 'Space',
    key: ' ',
    repeat: opts.repeat ?? false,
    bubbles: true,
    cancelable: true,
  });
  (opts.target ?? document.body).dispatchEvent(e);
  return e.defaultPrevented;
}

const changes = () => onChange.mock.calls.map(([on]) => on);

beforeEach(() => {
  button = document.createElement('button');
  document.body.appendChild(button);
  // jsdom は setPointerCapture を持たないことがあるので差し替える
  button.setPointerCapture = vi.fn();
  started = true;
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  onChange = vi.fn();
  input = createShowerInput({
    target: window,
    doc: document,
    button,
    isStarted: () => started,
    onChange,
  });
});

afterEach(() => {
  input.dispose();
  button.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('シャワー入力', () => {
  it('開始前はシャワーボタンも Space も受け付けない', () => {
    started = false;
    press('pointerdown');
    space('keydown');
    expect(input.on).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('開始後はボタンを押すと ON、離すと OFF になり、onChange は切り替わったときだけ呼ばれる', () => {
    press('pointerdown');
    expect(input.on).toBe(true);
    press('pointerup');
    expect(input.on).toBe(false);
    press('pointerup'); // 押していない状態での up は通知しない
    expect(changes()).toEqual([true, false]);
  });

  it('Space を押すと ON、キーリピートでは変化せず、離すと OFF', () => {
    expect(space('keydown')).toBe(true);
    expect(input.on).toBe(true);
    space('keydown', { repeat: true });
    space('keydown', { repeat: true });
    space('keyup');
    expect(input.on).toBe(false);
    expect(changes()).toEqual([true, false]);
  });

  it('ボタンを押したまま Space を押して離しても、ボタンが押されている間は ON のまま', () => {
    press('pointerdown');
    space('keydown');
    space('keyup');
    expect(input.on).toBe(true);
    press('pointerup');
    expect(input.on).toBe(false);
    expect(changes()).toEqual([true, false]);
  });

  it('2 本の指で押しているとき、後の指を離しても ON のままで、両方離すと OFF', () => {
    press('pointerdown', 1);
    press('pointerdown', 2);
    press('pointerup', 2);
    expect(input.on).toBe(true);
    press('pointerup', 1);
    expect(input.on).toBe(false);
  });

  it('右ボタン・中ボタンで押してもシャワーは出ず、キャプチャもしない', () => {
    press('pointerdown', 1, 2);
    press('pointerdown', 2, 1);
    expect(input.on).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(button.setPointerCapture).not.toHaveBeenCalled();
  });

  it('押していない pointerId の up は無視する', () => {
    press('pointerdown', 1);
    press('pointerup', 9);
    expect(input.on).toBe(true);
  });

  it('pointercancel で押下が解除される', () => {
    press('pointerdown', 1);
    press('pointercancel', 1);
    expect(input.on).toBe(false);
  });

  it('lostpointercapture で押下が解除される', () => {
    press('pointerdown', 1);
    press('lostpointercapture', 1);
    expect(input.on).toBe(false);
  });

  it('ウィンドウのフォーカスが外れると、全入力元を解除して OFF', () => {
    press('pointerdown', 1);
    press('pointerdown', 2);
    space('keydown');
    window.dispatchEvent(new Event('blur'));
    expect(input.on).toBe(false);
    expect(changes()).toEqual([true, false]);
    // 解除後に古い入力元の up が来ても状態は変わらない
    space('keyup');
    press('pointerup', 1);
    expect(changes()).toEqual([true, false]);
  });

  it('タブが隠れる（visibilitychange で hidden）と、全入力元を解除して OFF', () => {
    press('pointerdown', 1);
    space('keydown');
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(input.on).toBe(false);
  });

  it('タブが見えている状態の visibilitychange では解除しない', () => {
    press('pointerdown', 1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(input.on).toBe(true);
  });

  it('他のボタン・入力欄・contenteditable にフォーカスがあるときは Space を奪わず、preventDefault もしない', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    // jsdom は isContentEditable を実装していないので、ブラウザと同じ値を与える
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    const controls: Element[] = [
      document.createElement('button'),
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
      editable,
    ];
    for (const el of controls) {
      document.body.appendChild(el);
      expect(space('keydown', { target: el })).toBe(false);
      space('keyup', { target: el });
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('シャワーボタン自体にフォーカスがあるときは Space が効く', () => {
    expect(space('keydown', { target: button })).toBe(true);
    expect(input.on).toBe(true);
  });

  it('dispose 後はボタンにも Space にも反応しない', () => {
    input.dispose();
    press('pointerdown');
    space('keydown');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('releaseAll で全入力元を解除して OFF を通知し、OFF のときは通知しない', () => {
    press('pointerdown', 1);
    space('keydown');
    input.releaseAll();
    expect(input.on).toBe(false);
    input.releaseAll();
    expect(changes()).toEqual([true, false]);
  });
});

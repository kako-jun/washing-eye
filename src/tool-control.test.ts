// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createToolBridge, createToolControl, type ToolBridge, type ToolControl } from './tool-control';
import { createHud, type Hud } from './ui/hud';

let root: HTMLDivElement;
let hud: Hud;
let control: ToolControl;
let bridge: ToolBridge;
let pointer: { toolChanged: Mock; cancel: Mock };
let fixedShower: { setOn: Mock };
let started: boolean;
let visibility: DocumentVisibilityState;

const key = (type: 'keydown' | 'keyup', code: string) => {
  const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  document.body.dispatchEvent(e);
  return e;
};
const fixedOn = () => fixedShower.setOn.mock.calls.at(-1)?.[0] ?? false;
const showerButton = () => root.querySelector<HTMLButtonElement>('.shower')!;
const toolButton = (tool: string) => root.querySelector<HTMLButtonElement>(`[data-tool="${tool}"]`)!;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  started = true;
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  pointer = { toolChanged: vi.fn(), cancel: vi.fn() };
  fixedShower = { setOn: vi.fn() };
  // main と同じ組み立て: HUD は接続口から持ち替え、配線を作るときに接続口をつなぐ
  bridge = createToolBridge();
  hud = createHud(root, { showFps: false, onRecenter: () => {}, onTool: bridge.onTool });
  hud.setMode('mouse');
  control = createToolControl({
    target: window,
    doc: document,
    hud,
    pointer,
    fixedShower,
    isStarted: () => started,
    bridge,
  });
});

afterEach(() => {
  control.dispose();
  document.body.innerHTML = '';
});

describe('道具の持ち替えと固定シャワーの配線', () => {
  it('最初はスポンジで、Space で固定シャワーが出て、ボタンも押せる', () => {
    expect(control.tools.current).toBe('sponge');
    key('keydown', 'Space');
    expect(fixedOn()).toBe(true);
    expect(showerButton().classList.contains('is-on')).toBe(true);
    expect(showerButton().disabled).toBe(false);
  });

  it('Space で固定シャワーを出したまま 2 を押すと、固定シャワーが止まり、ボタンが押せなくなる', () => {
    key('keydown', 'Space');
    key('keydown', 'Digit2');
    expect(control.tools.current).toBe('handShower');
    expect(fixedOn()).toBe(false);
    expect(showerButton().classList.contains('is-on')).toBe(false);
    expect(showerButton().disabled).toBe(true);
    expect(pointer.toolChanged).toHaveBeenCalledWith('sponge');
  });

  it('手持ちシャワーの間は Space を押し直しても固定シャワーは出ない', () => {
    key('keydown', 'Digit2');
    key('keydown', 'Space');
    expect(fixedShower.setOn).not.toHaveBeenCalledWith(true);
  });

  it('1 でスポンジに戻すと、また Space で固定シャワーが出る', () => {
    key('keydown', 'Digit2');
    key('keydown', 'Digit1');
    expect(showerButton().disabled).toBe(false);
    key('keydown', 'Space');
    expect(fixedOn()).toBe(true);
    expect(pointer.toolChanged).toHaveBeenLastCalledWith('handShower');
  });

  it('HUD の切り替えボタンでも持ち替わり、同じ配線が働く', () => {
    key('keydown', 'Space');
    toolButton('handShower').click();
    expect(control.tools.current).toBe('handShower');
    expect(fixedOn()).toBe(false);
    expect(toolButton('handShower').getAttribute('aria-pressed')).toBe('true');
    toolButton('sponge').click();
    expect(control.tools.current).toBe('sponge');
  });

  it('開始前はキー 1 / 2 で持ち替えず、Space でも固定シャワーは出ない', () => {
    started = false;
    key('keydown', 'Digit2');
    key('keydown', 'Space');
    expect(control.tools.current).toBe('sponge');
    expect(fixedShower.setOn).not.toHaveBeenCalled();
  });

  it('ウィンドウのフォーカスが外れたら、ポインター側の動作も止める（固定シャワーも止まる）', () => {
    key('keydown', 'Space');
    window.dispatchEvent(new Event('blur'));
    expect(pointer.cancel).toHaveBeenCalledTimes(1);
    expect(fixedOn()).toBe(false);
  });

  it('タブが隠れたらポインター側の動作も止め、見えたときは何もしない', () => {
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pointer.cancel).not.toHaveBeenCalled();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pointer.cancel).toHaveBeenCalledTimes(1);
  });

  it('dispose 後はキー 1 / 2・Space・フォーカス喪失・タブ非表示のどれにも反応しない', () => {
    control.dispose();
    key('keydown', 'Digit2');
    key('keydown', 'Space');
    window.dispatchEvent(new Event('blur'));
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(control.tools.current).toBe('sponge');
    expect(fixedShower.setOn).not.toHaveBeenCalled();
    expect(pointer.cancel).not.toHaveBeenCalled();
  });

  it('接続口の getTool は持ち替えに追従する（PointerInput に渡すもの）', () => {
    expect(bridge.getTool()).toBe('sponge');
    key('keydown', 'Digit2');
    expect(bridge.getTool()).toBe('handShower');
    toolButton('sponge').click();
    expect(bridge.getTool()).toBe('sponge');
  });
});

describe('道具の接続口', () => {
  it('つなぐ前は最初の道具（スポンジ）を返し、onTool は何もしない', () => {
    const b = createToolBridge();
    expect(b.getTool()).toBe('sponge');
    expect(() => b.onTool('handShower')).not.toThrow();
    expect(b.getTool()).toBe('sponge');
  });
});

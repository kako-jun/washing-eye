// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindToolKeys, createToolState } from './tool';

describe('道具の状態', () => {
  it('既定はスポンジ', () => {
    expect(createToolState(() => {}).current).toBe('sponge');
  });

  it('持ち替えると current が変わり、onChange に新旧の道具が渡る', () => {
    const onChange = vi.fn();
    const tools = createToolState(onChange);
    tools.set('handShower');
    expect(tools.current).toBe('handShower');
    expect(onChange).toHaveBeenCalledWith('handShower', 'sponge');
    tools.set('sponge');
    expect(onChange).toHaveBeenLastCalledWith('sponge', 'handShower');
  });

  it('同じ道具を選び直しても onChange は呼ばれない（排他: 持っているのは常にどちらか 1 つ）', () => {
    const onChange = vi.fn();
    const tools = createToolState(onChange);
    tools.set('sponge');
    tools.set('handShower');
    tools.set('handShower');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('キー 1 / 2 での持ち替え', () => {
  let unbind: () => void = () => {};
  afterEach(() => {
    unbind();
    document.body.innerHTML = '';
  });

  function setup(started = true) {
    const tools = createToolState(() => {});
    let isStarted = started;
    unbind = bindToolKeys({ target: window, tools, isStarted: () => isStarted });
    return { tools, start: () => (isStarted = true) };
  }

  const key = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }));

  it('2 で手持ちシャワー、1 でスポンジに持ち替える（テンキーでも同じ）', () => {
    const { tools } = setup();
    key('Digit2');
    expect(tools.current).toBe('handShower');
    key('Digit1');
    expect(tools.current).toBe('sponge');
    key('Numpad2');
    expect(tools.current).toBe('handShower');
    key('Numpad1');
    expect(tools.current).toBe('sponge');
  });

  it('開始前は持ち替えない', () => {
    const { tools, start } = setup(false);
    key('Digit2');
    expect(tools.current).toBe('sponge');
    start();
    key('Digit2');
    expect(tools.current).toBe('handShower');
  });

  it('Ctrl・Meta・Alt・Shift と一緒に押したときは持ち替えない（ショートカットや記号の入力を奪わない）', () => {
    const { tools } = setup();
    key('Digit2', { ctrlKey: true });
    key('Digit2', { metaKey: true });
    key('Digit2', { altKey: true });
    key('Digit2', { shiftKey: true });
    expect(tools.current).toBe('sponge');
  });

  it('文字入力欄にフォーカスがあるときは持ち替えない', () => {
    const { tools } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    key('Digit2', {}, input);
    expect(tools.current).toBe('sponge');
  });

  it('ほかのキーでは何も起きない', () => {
    const { tools } = setup();
    key('Digit3');
    key('Space');
    expect(tools.current).toBe('sponge');
  });

  it('外した後はキーに反応しない', () => {
    const { tools } = setup();
    unbind();
    key('Digit2');
    expect(tools.current).toBe('sponge');
  });
});

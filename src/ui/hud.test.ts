// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createHud, type Hud } from './hud';

/**
 * 本番の style.css の本文。vitest は CSS を空として読み込む（`?raw` も空になる）ため、
 * リポジトリ直下から Node の fs で直接読む（@types/node を足さないよう getBuiltinModule 経由）。
 */
const nodeProcess = (globalThis as any).process;
const css: string = nodeProcess
  .getBuiltinModule('node:fs')
  .readFileSync(`${nodeProcess.cwd()}/src/ui/style.css`, 'utf8');

let root: HTMLDivElement;
let style: HTMLStyleElement;
let onRecenter: Mock<() => void>;

function hud(showFps = true): Hud {
  onRecenter = vi.fn();
  return createHud(root, { showFps, onRecenter });
}

const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
const recenter = () => q<HTMLButtonElement>('[data-recenter]');
const guideText = () => q<HTMLElement>('.guide').textContent ?? '';
/**
 * 実際の見え方（computed style）。
 * jsdom では UA の [hidden]{display:none} が作者 CSS の display 指定（.chip-button の inline-flex）に
 * 負けないため、ブラウザで起きる「[hidden] が詳細度タイで負ける」問題をここでは再現できない。
 * そのため computed style に加えて、style.css に `[hidden] { display: none` の規則があることを別テストで確かめる。
 */
const isShown = (el: Element) => getComputedStyle(el).display !== 'none';

beforeEach(() => {
  style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
  style.remove();
});

describe('HUD 操作案内', () => {
  it('傾きモードでは「端末を傾ける」を案内し、正面に戻すボタンを見せる', () => {
    const h = hud();
    h.setMode('tilt');
    expect(guideText()).toContain('端末を傾ける');
    expect(recenter().hidden).toBe(false);
    expect(isShown(recenter())).toBe(true);
  });

  it('タッチモードでは「体の外をなぞる」を案内し、正面に戻すボタンを隠す', () => {
    const h = hud();
    h.setMode('touch');
    expect(guideText()).toContain('体の外をなぞる');
    expect(recenter().hidden).toBe(true);
    expect(isShown(recenter())).toBe(false);
  });

  it('マウスモードでは「体の外をドラッグ」と、流すの案内に Space を出し、正面に戻すボタンを隠す', () => {
    const h = hud();
    h.setMode('mouse');
    expect(guideText()).toContain('体の外をドラッグ');
    const dts = [...root.querySelectorAll('.guide dt')];
    const shower = dts.find((dt) => dt.textContent === '流す')!;
    expect(shower.nextElementSibling!.textContent).toContain('Space');
    expect(recenter().hidden).toBe(true);
    expect(isShown(recenter())).toBe(false);
  });

  it('傾きモードからタッチモードに戻すと、正面に戻すボタンがまた隠れる', () => {
    const h = hud();
    h.setMode('tilt');
    h.setMode('touch');
    expect(recenter().hidden).toBe(true);
    expect(isShown(recenter())).toBe(false);
  });
});

describe('HUD の CSS', () => {
  it('style.css に [hidden] を display:none にする規則がある（display を持つボタンを hidden 属性で隠すため）', () => {
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none/);
  });
});

describe('HUD 表示', () => {
  it('setShowerOn でシャワーボタンと照準の is-on、aria-pressed が切り替わる', () => {
    const h = hud();
    const button = q<HTMLButtonElement>('.shower');
    const reticle = q<HTMLElement>('.reticle');
    h.setShowerOn(true);
    expect(button.classList.contains('is-on')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(reticle.classList.contains('is-on')).toBe(true);
    h.setShowerOn(false);
    expect(button.classList.contains('is-on')).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(reticle.classList.contains('is-on')).toBe(false);
  });

  it('fps は四捨五入した整数で「N fps」と表示する（.5 は切り上げ）', () => {
    const h = hud();
    const fps = q<HTMLElement>('.hud__fps');
    h.setFps(59.49);
    expect(fps.textContent).toBe('59 fps');
    h.setFps(59.5);
    expect(fps.textContent).toBe('60 fps');
    h.setFps(60.5);
    expect(fps.textContent).toBe('61 fps');
  });

  it('showFps=false では fps 表示を隠す', () => {
    hud(false);
    const fps = q<HTMLElement>('.hud__fps');
    expect(fps.hidden).toBe(true);
    expect(isShown(fps)).toBe(false);
  });

  it('正面に戻すボタンを押すと onRecenter が 1 回呼ばれる', () => {
    const h = hud();
    h.setMode('tilt');
    recenter().click();
    expect(onRecenter).toHaveBeenCalledTimes(1);
  });
});

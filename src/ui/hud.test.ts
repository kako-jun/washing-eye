// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createHud, guideFor, type Hud } from './hud';

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
let onTool: Mock<(tool: string) => void>;

function hud(showFps = true): Hud {
  onRecenter = vi.fn();
  onTool = vi.fn();
  return createHud(root, { showFps, onRecenter, onTool });
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
    // 右・中ボタンでの見回しも案内する（隠れた操作を作らない）
    expect(guideText()).toContain('右・中ボタン');
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

describe('HUD の CSS（切り替えパネルと案内パネル）', () => {
  it('切り替えパネルは固定幅で、マウス操作（キーの手がかり付き）では広い', () => {
    expect(css).toMatch(/\.hud \{\s*--tools-w: 128px;/);
    expect(css).toMatch(/\.hud\[data-mode='mouse'\] \{\s*--tools-w: 156px;/);
    expect(css).toMatch(/\.tools \{[^}]*width: var\(--tools-w\);/);
  });

  it('案内パネルの最大幅は、切り替えパネルの幅と右の余白を差し引いて決める（狭い幅でも上書きしない）', () => {
    expect(css).toMatch(
      /\.guide \{[^}]*max-width: min\(360px, calc\(100% - var\(--gutter\) - var\(--tools-right\) - var\(--tools-w\) - 8px\)\);/,
    );
    const narrow = css.slice(css.indexOf('@media (max-width: 420px)'));
    const guideInNarrow = narrow.slice(narrow.indexOf('.guide {'), narrow.indexOf('}', narrow.indexOf('.guide {')));
    expect(guideInNarrow).not.toContain('max-width');
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

describe('HUD 道具の切り替え', () => {
  const toolButton = (tool: string) => q<HTMLButtonElement>(`[data-tool="${tool}"]`);
  const pressed = (tool: string) => toolButton(tool).getAttribute('aria-pressed');
  const showerButton = () => q<HTMLButtonElement>('.shower');
  const ddOf = (term: string) =>
    [...root.querySelectorAll('.guide dt')].find((dt) => dt.textContent === term)?.nextElementSibling
      ?.textContent ?? null;

  it('最初はスポンジが選ばれ、固定シャワーは使える（押せない理由の文は hidden）', () => {
    hud();
    expect(root.querySelector<HTMLElement>('.visually-hidden')!.hidden).toBe(true);
    expect(pressed('sponge')).toBe('true');
    expect(pressed('handShower')).toBe('false');
    expect(showerButton().disabled).toBe(false);
    expect(showerButton().textContent).toContain('固定シャワー');
  });

  it('切り替えボタンを押すと、その道具で onTool が呼ばれる（表示の更新は setTool で行う）', () => {
    hud();
    toolButton('handShower').click();
    expect(onTool).toHaveBeenCalledWith('handShower');
    toolButton('sponge').click();
    expect(onTool).toHaveBeenLastCalledWith('sponge');
  });

  it('切り替えボタンはマウスで押してもフォーカスを奪わない（Space を固定シャワーに残す）', () => {
    hud();
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    toolButton('handShower').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('setTool で手持ちシャワーにすると、ボタンの選択が移り、固定シャワーは押せなくなる', () => {
    const h = hud();
    h.setTool('handShower');
    expect(pressed('handShower')).toBe('true');
    expect(pressed('sponge')).toBe('false');
    expect(showerButton().disabled).toBe(true);
    h.setTool('sponge');
    expect(showerButton().disabled).toBe(false);
  });

  it('固定シャワーが押せない間は、理由を title と aria-describedby で伝え、使えるようになれば外す', () => {
    const h = hud();
    h.setTool('handShower');
    expect(showerButton().title).toContain('手持ちシャワーの間は使えません');
    const id = showerButton().getAttribute('aria-describedby')!;
    const reason = document.getElementById(id)!;
    expect(reason.textContent).toContain('手持ちシャワーの間は使えません');
    expect(reason.hidden).toBe(false); // 参照している間は読み上げの対象
    h.setTool('sponge');
    expect(showerButton().hasAttribute('title')).toBe(false);
    expect(showerButton().hasAttribute('aria-describedby')).toBe(false);
    expect(reason.hidden).toBe(true); // 参照していない間は hidden
  });

  it('操作方法を data-mode に出す（切り替えパネルの幅に合わせて案内の幅を変えるため）', () => {
    const h = hud();
    h.setMode('touch');
    expect(q<HTMLElement>('.hud').dataset.mode).toBe('touch');
    h.setMode('mouse');
    expect(q<HTMLElement>('.hud').dataset.mode).toBe('mouse');
  });

  it('手持ちシャワーの間は、案内が流し方と「固定シャワーは使えない」に変わる', () => {
    const h = hud();
    h.setMode('mouse');
    h.setTool('handShower');
    expect(ddOf('流す')).toContain('押している間だけ水が出る');
    expect(ddOf('固定シャワー')).toContain('使えない');
    expect(ddOf('洗う')).toContain('スポンジに持ち替える');
    h.setMode('touch');
    expect(ddOf('流す')).toContain('触れている間');
  });

  it('スポンジに戻すと、案内も元に戻る（固定シャワーの Space が出る）', () => {
    const h = hud();
    h.setMode('mouse');
    h.setTool('handShower');
    h.setTool('sponge');
    expect(ddOf('流す')).toContain('Space');
    expect(ddOf('固定シャワー')).toBeNull();
  });

  it('キー 1 / 2 の手がかりはマウス操作のときだけ見せる', () => {
    const h = hud();
    h.setMode('mouse');
    const keys = [...root.querySelectorAll<HTMLElement>('.tools__key')];
    expect(keys.map((k) => k.textContent)).toEqual(['1', '2']);
    expect(keys.every((k) => !k.hidden)).toBe(true);
    expect(ddOf('持ち替え')).toContain('1 / 2');
    h.setMode('touch');
    expect(keys.every((k) => k.hidden)).toBe(true);
    expect(ddOf('持ち替え')).not.toContain('1 / 2');
  });

  it('どの操作方法・道具でも、見回し・流す・持ち替えの案内が必ずある', () => {
    for (const mode of ['tilt', 'touch', 'mouse'] as const) {
      for (const tool of ['sponge', 'handShower'] as const) {
        const terms = guideFor(mode, tool).map(([k]) => k);
        expect(terms).toEqual(expect.arrayContaining(['見回す', '流す', '洗う', '持ち替え']));
      }
    }
  });
});

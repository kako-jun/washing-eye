import { ICON_RECENTER, ICON_SHOWER } from './icons';

export type ControlMode = 'tilt' | 'touch' | 'mouse';

const GUIDES: Record<ControlMode, [string, string][]> = {
  tilt: [
    ['見回す', '端末を傾ける'],
    ['洗う', '体をなぞる'],
    ['流す', 'シャワーを長押し。視線の先に当たる'],
  ],
  touch: [
    ['見回す', '体の外をなぞる'],
    ['洗う', '体をなぞる'],
    ['流す', 'シャワーを長押し。視線の先に当たる'],
  ],
  mouse: [
    ['見回す', '体の外をドラッグ'],
    ['洗う', '体をドラッグ'],
    ['流す', 'シャワーを長押し／Space。視線の先に当たる'],
  ],
};

export interface Hud {
  show(): void;
  setMode(mode: ControlMode): void;
  setShowerOn(on: boolean): void;
  setFps(fps: number): void;
}

/**
 * 遊んでいる間の表示。操作案内は常に画面に出しておく。
 */
export function createHud(
  root: HTMLElement,
  opts: {
    showFps: boolean;
    onShower(on: boolean): void;
    onRecenter(): void;
  },
): Hud {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    <div class="hud__brand">Washing Eye</div>
    <div class="hud__top-right">
      <span class="hud__fps" ${opts.showFps ? '' : 'hidden'}></span>
      <button class="chip-button" data-recenter type="button" hidden>${ICON_RECENTER}<span>正面に戻す</span></button>
    </div>
    <div class="reticle" aria-hidden="true"></div>
    <dl class="guide" aria-label="操作案内"></dl>
    <button class="shower" type="button" aria-pressed="false">${ICON_SHOWER}<span>シャワー</span></button>
  `;
  root.appendChild(el);

  const guide = el.querySelector<HTMLDListElement>('.guide')!;
  const shower = el.querySelector<HTMLButtonElement>('.shower')!;
  const reticle = el.querySelector<HTMLDivElement>('.reticle')!;
  const fps = el.querySelector<HTMLSpanElement>('.hud__fps')!;
  const recenter = el.querySelector<HTMLButtonElement>('[data-recenter]')!;

  // シャワーは押している間だけ出る
  let pressing = -1;
  shower.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressing = e.pointerId;
    shower.setPointerCapture(e.pointerId);
    opts.onShower(true);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== pressing) return;
    pressing = -1;
    opts.onShower(false);
  };
  shower.addEventListener('pointerup', release);
  shower.addEventListener('pointercancel', release);
  shower.addEventListener('contextmenu', (e) => e.preventDefault());
  recenter.addEventListener('click', () => opts.onRecenter());

  return {
    show() {
      el.classList.add('is-visible');
    },
    setMode(mode) {
      guide.innerHTML = GUIDES[mode]
        .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
        .join('');
      recenter.hidden = mode !== 'tilt';
    },
    setShowerOn(on) {
      shower.classList.toggle('is-on', on);
      shower.setAttribute('aria-pressed', String(on));
      reticle.classList.toggle('is-on', on);
    },
    setFps(v) {
      fps.textContent = `${Math.round(v)} fps`;
    },
  };
}

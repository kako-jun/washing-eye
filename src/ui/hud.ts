import { ICON_RECENTER, ICON_SHOWER } from './icons';
import { TOOLS, type Tool } from '../input/tool';

export type ControlMode = 'tilt' | 'touch' | 'mouse';

type GuideRow = [string, string];

/** 見回す操作の案内（道具によらない） */
const LOOK: Record<ControlMode, string> = {
  tilt: '端末を傾ける',
  touch: '体の外をなぞる',
  mouse: '体の外をドラッグ／右・中ボタンならどこでも',
};

/** 持ち替えの案内 */
const SWAP: Record<ControlMode, string> = {
  tilt: '右下の「スポンジ」「手持ちシャワー」',
  touch: '右下の「スポンジ」「手持ちシャワー」',
  mouse: 'キー 1 / 2、または右下のボタン',
};

/** 持っている道具ごとの操作案内。隠れた操作を作らないよう、今できることを全部出す */
export function guideFor(mode: ControlMode, tool: Tool): GuideRow[] {
  if (tool === 'handShower') {
    return [
      ['見回す', LOOK[mode]],
      [
        '流す',
        mode === 'mouse'
          ? '体の上で当て先を選び、押している間だけ水が出る'
          : '体に触れている間、指の先に水が出る',
      ],
      ['洗う', 'スポンジに持ち替える'],
      ['固定シャワー', '手持ちシャワーの間は使えない'],
      ['持ち替え', SWAP[mode]],
    ];
  }
  return [
    ['見回す', LOOK[mode]],
    ['洗う', mode === 'mouse' ? '体をドラッグ' : '体をなぞる'],
    [
      '流す',
      mode === 'mouse'
        ? '固定シャワーを長押し／Space。視線の先に当たる'
        : '固定シャワーを長押し。視線の先に当たる',
    ],
    ['持ち替え', SWAP[mode]],
  ];
}

/** 固定シャワーのボタンを押せない理由 */
const SHOWER_DISABLED_REASON = '手持ちシャワーの間は使えません';
const SHOWER_DISABLED_ID = 'shower-disabled-reason';

const TOOL_LABELS: Record<Tool, string> = {
  sponge: 'スポンジ',
  handShower: '手持ちシャワー',
};

export interface Hud {
  /** シャワーボタン（押下の扱いは input/shower-input が受け持つ） */
  readonly showerButton: HTMLButtonElement;
  show(): void;
  setMode(mode: ControlMode): void;
  /** 持っている道具を表示に反映する（切り替えボタン・案内・固定シャワーの使える/使えない） */
  setTool(tool: Tool): void;
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
    onRecenter(): void;
    /** 切り替えボタンで道具が選ばれたとき */
    onTool(tool: Tool): void;
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
    <div class="tools" role="group" aria-label="手に持つ道具">${TOOLS.map(
      (tool, i) =>
        `<button class="tools__button" type="button" data-tool="${tool}" aria-pressed="false"><span>${TOOL_LABELS[tool]}</span><kbd class="tools__key" hidden>${i + 1}</kbd></button>`,
    ).join('')}</div>
    <button class="shower" type="button" aria-pressed="false">${ICON_SHOWER}<span>固定シャワー</span></button>
    <span class="visually-hidden" id="${SHOWER_DISABLED_ID}" hidden>${SHOWER_DISABLED_REASON}</span>
  `;
  root.appendChild(el);

  const guide = el.querySelector<HTMLDListElement>('.guide')!;
  const shower = el.querySelector<HTMLButtonElement>('.shower')!;
  const disabledReason = el.querySelector<HTMLSpanElement>(`#${SHOWER_DISABLED_ID}`)!;
  const reticle = el.querySelector<HTMLDivElement>('.reticle')!;
  const fps = el.querySelector<HTMLSpanElement>('.hud__fps')!;
  const recenter = el.querySelector<HTMLButtonElement>('[data-recenter]')!;

  const toolButtons = [...el.querySelectorAll<HTMLButtonElement>('[data-tool]')];
  const toolKeys = [...el.querySelectorAll<HTMLElement>('.tools__key')];
  let mode: ControlMode = 'mouse';
  let tool: Tool = 'sponge';

  const renderGuide = () => {
    guide.innerHTML = guideFor(mode, tool)
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join('');
  };

  recenter.addEventListener('click', () => opts.onRecenter());
  for (const b of toolButtons) {
    // マウスで押してもフォーカスを移さない（フォーカスが残ると Space が固定シャワーに届かなくなる）
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => opts.onTool(b.dataset.tool as Tool));
  }

  const hud: Hud = {
    showerButton: shower,
    show() {
      el.classList.add('is-visible');
    },
    setMode(next) {
      mode = next;
      // 切り替えパネルの幅（キーの手がかりの有無）に合わせて案内の幅を変えるため、CSS に操作方法を渡す
      el.dataset.mode = mode;
      renderGuide();
      recenter.hidden = mode !== 'tilt';
      // キーの手がかりはキーボードのある操作（マウス）のときだけ出す
      for (const k of toolKeys) k.hidden = mode !== 'mouse';
    },
    setTool(next) {
      tool = next;
      for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
      // 手持ちシャワーの間は固定シャワーを使えない（二重に流さない）
      shower.disabled = tool === 'handShower';
      // 押せない理由をツールチップと読み上げで伝える
      // （理由の文は参照している間だけ読み上げの対象にし、それ以外は hidden にしておく）
      disabledReason.hidden = !shower.disabled;
      if (shower.disabled) {
        shower.title = SHOWER_DISABLED_REASON;
        shower.setAttribute('aria-describedby', SHOWER_DISABLED_ID);
      } else {
        shower.removeAttribute('title');
        shower.removeAttribute('aria-describedby');
      }
      renderGuide();
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
  hud.setTool(tool);
  return hud;
}

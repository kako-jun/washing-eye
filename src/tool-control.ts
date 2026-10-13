import { createShowerInput, type ShowerInput } from './input/shower-input';
import { DEFAULT_TOOL, bindToolKeys, createToolState, type Tool, type ToolState } from './input/tool';
import type { PointerInput } from './input/pointer';
import type { Hud } from './ui/hud';

type Listen = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface ToolControlOptions {
  /** keydown / keyup / blur を受けるウィンドウ */
  target: Listen;
  /** visibilitychange を受けるドキュメント */
  doc: Listen & { readonly visibilityState: DocumentVisibilityState };
  hud: Pick<Hud, 'setTool' | 'setShowerOn' | 'showerButton'>;
  pointer: Pick<PointerInput, 'toolChanged' | 'cancel'>;
  /** 固定シャワーの水 */
  fixedShower: { setOn(on: boolean): void };
  isStarted: () => boolean;
  /** HUD・ポインターとの接続口。渡すと、作った ToolState をつなぐ */
  bridge?: ToolBridge;
}

/**
 * 道具の配線より先に作る HUD・PointerInput へ渡す接続口。createToolControl に渡すと ToolState につながる。
 * main とテストで同じ組み立てを使うためのもの。
 */
export interface ToolBridge {
  /** HUD の onTool に渡す（切り替えボタンで持ち替える） */
  readonly onTool: (tool: Tool) => void;
  /** PointerInput の getTool に渡す（今の道具を読む） */
  readonly getTool: () => Tool;
  /** ToolState につなぐ（createToolControl が呼ぶ） */
  attach(tools: ToolState): void;
}

export function createToolBridge(): ToolBridge {
  let tools: ToolState | null = null;
  return {
    onTool: (tool) => tools?.set(tool),
    // つなぐ前（作った直後）は最初の道具
    getTool: () => tools?.current ?? DEFAULT_TOOL,
    attach(t) {
      tools = t;
    },
  };
}

export interface ToolControl {
  /** 手に持つ道具の正本 */
  readonly tools: ToolState;
  /** 固定シャワーの入力 */
  readonly showerInput: ShowerInput;
  /** キー・ウィンドウ・ドキュメントのリスナーをすべて外す */
  dispose(): void;
}

/**
 * 道具の持ち替えと固定シャワーの配線。
 * - 道具（スポンジ／手持ちシャワー）は ToolState を正本にし、HUD の切り替えとキー 1 / 2 で持ち替える
 * - 持ち替えたら、ポインター側の進行中の動作（こする・手持ちの水）を止め、HUD を更新する
 * - 固定シャワー（ボタン長押し／Space）はスポンジを持っている間だけ使え、手持ちに持ち替えた時点で止める
 * - フォーカスが外れた・タブが隠れたら、ポインター側の動作も止める（固定シャワーは shower-input が止める）
 */
export function createToolControl(opts: ToolControlOptions): ToolControl {
  const { target, doc, hud, pointer, fixedShower, isStarted } = opts;

  const tools = createToolState((tool, prev) => {
    pointer.toolChanged(prev);
    hud.setTool(tool);
    // 手持ちシャワーの間は固定シャワーを使えない（二重に流さない）
    if (tool === 'handShower') showerInput.releaseAll();
  });
  opts.bridge?.attach(tools);
  hud.setTool(tools.current);
  const unbindKeys = bindToolKeys({ target, tools, isStarted });

  const showerInput = createShowerInput({
    target,
    doc,
    button: hud.showerButton,
    isStarted,
    isEnabled: () => tools.current === 'sponge',
    onChange(on) {
      fixedShower.setOn(on);
      hud.setShowerOn(on);
    },
  });

  const onBlur = () => pointer.cancel();
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') pointer.cancel();
  };
  target.addEventListener('blur', onBlur);
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    tools,
    showerInput,
    dispose() {
      unbindKeys();
      showerInput.dispose();
      target.removeEventListener('blur', onBlur);
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

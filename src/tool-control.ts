import { createShowerInput, type ShowerInput } from './input/shower-input';
import { bindToolKeys, createToolState, type ToolState } from './input/tool';
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

/**
 * 手に持つ道具。スポンジと手持ちシャワーは同じ手を使うので、どちらか一方だけを持つ。
 * 固定シャワー（上に固定されたヘッド）は手を使わないので、ここでは扱わない。
 */
export type Tool = 'sponge' | 'handShower';

export const TOOLS: readonly Tool[] = ['sponge', 'handShower'];

export interface ToolState {
  readonly current: Tool;
  /** 持ち替える。同じ道具なら何もしない */
  set(tool: Tool): void;
}

/** 道具の状態。持ち替えたときだけ onChange が呼ばれる。既定はスポンジ */
export function createToolState(
  onChange: (tool: Tool, prev: Tool) => void,
  initial: Tool = 'sponge',
): ToolState {
  let current = initial;
  return {
    get current() {
      return current;
    },
    set(tool) {
      if (tool === current) return;
      const prev = current;
      current = tool;
      onChange(tool, prev);
    },
  };
}

type Listen = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** 数字キーと道具の対応（1: スポンジ、2: 手持ちシャワー） */
const KEY_TOOLS: Record<string, Tool> = {
  Digit1: 'sponge',
  Numpad1: 'sponge',
  Digit2: 'handShower',
  Numpad2: 'handShower',
};

/**
 * キー 1 / 2 で持ち替える。開始前・修飾キー付き・文字入力欄にフォーカスがあるときは何もしない。
 * 戻り値はリスナーを外す関数。
 */
export function bindToolKeys(opts: {
  target: Listen;
  tools: Pick<ToolState, 'set'>;
  isStarted: () => boolean;
}): () => void {
  const onKeyDown = (e: Event) => {
    const ke = e as KeyboardEvent;
    const tool = KEY_TOOLS[ke.code];
    if (!tool || !opts.isStarted()) return;
    if (ke.ctrlKey || ke.metaKey || ke.altKey) return;
    if (isTextInput(ke.target)) return;
    opts.tools.set(tool);
  };
  opts.target.addEventListener('keydown', onKeyDown);
  return () => opts.target.removeEventListener('keydown', onKeyDown);
}

function isTextInput(t: EventTarget | null): boolean {
  if (!t) return false;
  const el = t as Partial<Pick<HTMLElement, 'tagName' | 'isContentEditable'>>;
  if (el.isContentEditable) return true;
  return typeof el.tagName === 'string' && /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName);
}

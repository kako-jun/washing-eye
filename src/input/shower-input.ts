/**
 * シャワーの ON/OFF 入力。
 * - シャワーボタンの長押し（主ボタンのポインターごと）と Space キーを、入力元ごとに押下状態として持つ
 * - いずれかの入力元が押されていれば ON。全部離れたら OFF
 * - ウィンドウのフォーカスが外れた・タブが隠れたら、全入力元を解除して OFF
 * - 開始前（スタート画面表示中）は受け付けない
 * - Space は、シャワーボタン以外のボタンや入力欄にフォーカスがあるときは奪わない
 *
 * DOM は引数で受け取り、状態遷移はこのモジュールの中で完結させる。
 */

type Listen = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface ShowerInputOptions {
  /** keydown / keyup / blur を受けるウィンドウ */
  target: Listen;
  /** visibilitychange を受けるドキュメント */
  doc: Listen & { readonly visibilityState: DocumentVisibilityState };
  /** シャワーボタン */
  button: HTMLElement;
  /** 開始済みか（開始前は入力を受け付けない） */
  isStarted: () => boolean;
  /** ON/OFF が切り替わったときだけ呼ばれる */
  onChange: (on: boolean) => void;
}

export interface ShowerInput {
  /** 今 ON か */
  readonly on: boolean;
  /** 全入力元を解除する（ON だったら OFF を通知する） */
  releaseAll(): void;
  /** リスナーをすべて外す */
  dispose(): void;
}

const KEY_SOURCE = 'key:Space';
const pointerSource = (id: number) => `pointer:${id}`;

export function createShowerInput(opts: ShowerInputOptions): ShowerInput {
  const { target, doc, button, isStarted, onChange } = opts;
  const pressed = new Set<string>();
  let on = false;

  const sync = () => {
    const next = pressed.size > 0;
    if (next === on) return;
    on = next;
    onChange(on);
  };
  const press = (source: string) => {
    pressed.add(source);
    sync();
  };
  const release = (source: string) => {
    if (!pressed.delete(source)) return;
    sync();
  };
  const releaseAll = () => {
    pressed.clear();
    sync();
  };

  /** Space を奪ってはいけない要素にフォーカスがあるか（シャワーボタン自体は除く） */
  const isFocusedControl = (t: EventTarget | null): boolean => {
    if (!t || t === button) return false;
    const el = t as Partial<Pick<HTMLElement, 'tagName' | 'isContentEditable'>>;
    if (el.isContentEditable) return true;
    return typeof el.tagName === 'string' && /^(BUTTON|INPUT|TEXTAREA|SELECT)$/i.test(el.tagName);
  };

  const onKeyDown = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.code !== 'Space' || ke.repeat) return;
    if (!isStarted() || isFocusedControl(ke.target)) return;
    ke.preventDefault();
    press(KEY_SOURCE);
  };
  const onKeyUp = (e: Event) => {
    if ((e as KeyboardEvent).code === 'Space') release(KEY_SOURCE);
  };
  const onBlur = () => releaseAll();
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') releaseAll();
  };

  const onPointerDown = (e: Event) => {
    const pe = e as PointerEvent;
    pe.preventDefault();
    // シャワーは主ボタン（左クリック・タッチ・ペン）だけで出す
    if (pe.button !== 0 || !isStarted()) return;
    try {
      button.setPointerCapture(pe.pointerId);
    } catch {
      // キャプチャできなくても押下は受け付ける（離したときの up は届く）
    }
    press(pointerSource(pe.pointerId));
  };
  const onPointerEnd = (e: Event) => release(pointerSource((e as PointerEvent).pointerId));
  const onContextMenu = (e: Event) => e.preventDefault();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  doc.addEventListener('visibilitychange', onVisibility);
  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('pointerup', onPointerEnd);
  button.addEventListener('pointercancel', onPointerEnd);
  button.addEventListener('lostpointercapture', onPointerEnd);
  button.addEventListener('contextmenu', onContextMenu);

  return {
    get on() {
      return on;
    },
    releaseAll,
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      doc.removeEventListener('visibilitychange', onVisibility);
      button.removeEventListener('pointerdown', onPointerDown);
      button.removeEventListener('pointerup', onPointerEnd);
      button.removeEventListener('pointercancel', onPointerEnd);
      button.removeEventListener('lostpointercapture', onPointerEnd);
      button.removeEventListener('contextmenu', onContextMenu);
    },
  };
}

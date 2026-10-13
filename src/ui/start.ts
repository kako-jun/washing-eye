import { ICON_MARK, ICON_PLAY } from './icons';

/** 開始処理（iOS の傾き許可要求など）を待つ上限。返ってこないときは押し直せる状態に戻す */
export const START_TIMEOUT_MS = 8000;

/**
 * スタート画面。「はじめる」の 1 タップで、音の開始と iOS の傾き許可要求をまとめて行う。
 */
export function showStartScreen(root: HTMLElement, touch: boolean, onStart: () => Promise<void>): void {
  const el = document.createElement('section');
  el.className = 'start';
  el.innerHTML = `
    <div class="start__inner">
      <div class="start__mark">${ICON_MARK}</div>
      <h1 class="start__title">Washing Eye</h1>
      <p class="start__lead">湯気のなかで、<br />自分の体をゆっくり洗う。</p>
      <button class="start__button" type="button">${ICON_PLAY}<span>はじめる</span></button>
      <p class="start__error" role="alert" hidden>うまく始められませんでした。もう一度お試しください。</p>
      <p class="start__note">${
        touch
          ? '端末の傾きで見回します。開始時に傾きの使用許可を求められたら「許可」を選んでください。音が出ます。'
          : 'マウスで操作します。音が出ます。'
      }</p>
    </div>
  `;
  root.appendChild(el);
  const button = el.querySelector<HTMLButtonElement>('.start__button')!;
  const error = el.querySelector<HTMLParagraphElement>('.start__error')!;
  button.focus({ preventScroll: true });
  // 開始処理の最中・開始後は押しても何もしない（二重クリックで onStart を複数回走らせない）
  let busy = false;
  let closed = false;
  let attempt = 0;

  const close = () => {
    if (closed) return;
    closed = true;
    busy = true;
    button.disabled = true;
    error.hidden = true;
    button.removeEventListener('click', handleClick);
    el.classList.add('is-leaving');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  };
  // 失敗・時間切れのときは押し直せる状態に戻す
  const recover = () => {
    busy = false;
    button.disabled = false;
    error.hidden = false;
    button.focus({ preventScroll: true });
  };

  const handleClick = () => {
    if (busy || closed) return;
    busy = true;
    const id = ++attempt;
    button.disabled = true;
    error.hidden = true;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled || closed || id !== attempt) return;
      settled = true;
      recover();
    }, START_TIMEOUT_MS);
    Promise.resolve()
      .then(onStart)
      .then(
        () => {
          clearTimeout(timer);
          settled = true;
          // 時間切れの後に遅れて成功した場合も、開始は済んでいるので画面を閉じる（閉じるのは 1 回だけ）
          close();
        },
        () => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          // 押し直し後の古い試行の失敗は、今の試行の状態を壊さないよう無視する
          if (closed || id !== attempt) return;
          recover();
        },
      );
  };
  button.addEventListener('click', handleClick);
}

import { ICON_MARK, ICON_PLAY } from './icons';

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
      <p class="start__note">${
        touch
          ? '端末の傾きで見回します。開始時に傾きの使用許可を求められたら「許可」を選んでください。音が出ます。'
          : 'マウスで操作します。音が出ます。'
      }</p>
    </div>
  `;
  root.appendChild(el);
  const button = el.querySelector<HTMLButtonElement>('.start__button')!;
  button.focus({ preventScroll: true });
  button.addEventListener(
    'click',
    async () => {
      button.disabled = true;
      await onStart();
      el.classList.add('is-leaving');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    },
    { once: true },
  );
}

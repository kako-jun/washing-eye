import type { SoundBoard } from './fx/audio';
import type { LookController } from './input/look';

export interface GameStartOptions {
  sound: Pick<SoundBoard, 'start'>;
  look: Pick<LookController, 'enableTilt'>;
  /** タッチ端末なら傾きの許可を求める */
  isTouch: boolean;
  /** 傾きの値が実際に届いたとき */
  onTiltActive: () => void;
  /** 開始の準備が済んだとき */
  onStarted: () => void;
}

/**
 * 「はじめる」で走らせる開始処理を作る。
 * 音の開始と iOS の傾き許可要求は、クリックの同期区間の中で呼ぶ必要があるため、
 * 返す関数は最初の await より前に sound.start() と look.enableTilt()（その中の requestPermission）を呼ぶ。
 */
export function createGameStart(opts: GameStartOptions): () => Promise<void> {
  return async () => {
    opts.sound.start();
    if (opts.isTouch) await opts.look.enableTilt(opts.onTiltActive);
    opts.onStarted();
  };
}

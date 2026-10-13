/**
 * 鏡の曇り。小さな格子に曇りの濃さ（0: 晴れ 〜 1: 曇り）を持ち、
 * 水が当たった範囲を取り（縁はやわらかく）、時間をかけて再び曇らせる。
 * 描画には依存しない（鏡の見え方への重ね方は scene/mirror.ts が受け持つ）。
 */

/** 晴れた所が完全に曇り直すまでの秒数 */
export const REFOG_SECONDS = 30;
/** 全開の水が当たり続けたとき、1 秒で取れる曇りの量 */
export const CLEAR_RATE = 3;

export class FogMask {
  readonly cols: number;
  readonly rows: number;
  /** 行 0 が下端（v = 0）。値は 0〜1 */
  readonly density: Float32Array;
  /** 縦横比（高さ / 幅）。当たった範囲を円にするため、縦の距離をこれで換算する */
  private readonly aspect: number;

  constructor(cols = 64, rows = 48, aspect = rows / cols) {
    this.cols = cols;
    this.rows = rows;
    this.aspect = aspect;
    this.density = new Float32Array(cols * rows).fill(1);
  }

  /** 格子 (i, j) の曇り。i は横、j は縦（下から） */
  at(i: number, j: number): number {
    return this.density[j * this.cols + i];
  }

  /** uv（0〜1、左下原点）の点の曇り（いちばん近い格子） */
  sample(u: number, v: number): number {
    const i = Math.min(this.cols - 1, Math.max(0, Math.floor(u * this.cols)));
    const j = Math.min(this.rows - 1, Math.max(0, Math.floor(v * this.rows)));
    return this.at(i, j);
  }

  /** 全体の曇りの平均（0〜1） */
  coverage(): number {
    let sum = 0;
    for (const d of this.density) sum += d;
    return sum / this.density.length;
  }

  /**
   * uv の点を中心に曇りを取る。radius は鏡の幅を 1 とした半径。
   * 中心から半径の半分までは amount だけ取り、そこから縁へなめらかに弱める。
   * 戻り値は曇りが変わったか。
   */
  clear(u: number, v: number, radius: number, amount: number): boolean {
    if (!(radius > 0) || !(amount > 0)) return false;
    let changed = false;
    const inner = radius * 0.5;
    for (let j = 0; j < this.rows; j++) {
      const dy = ((j + 0.5) / this.rows - v) * this.aspect;
      if (Math.abs(dy) > radius) continue;
      for (let i = 0; i < this.cols; i++) {
        const dx = (i + 0.5) / this.cols - u;
        const dist = Math.hypot(dx, dy);
        if (dist >= radius) continue;
        const w = 1 - smoothstep(inner, radius, dist);
        const k = j * this.cols + i;
        const next = Math.max(0, this.density[k] - amount * w);
        if (next !== this.density[k]) {
          this.density[k] = next;
          changed = true;
        }
      }
    }
    return changed;
  }

  /** 時間で再び曇らせる（REFOG_SECONDS で 0 から 1 へ）。戻り値は曇りが変わったか */
  update(dt: number, refogSeconds = REFOG_SECONDS): boolean {
    if (!(dt > 0)) return false;
    const step = dt / refogSeconds;
    let changed = false;
    for (let k = 0; k < this.density.length; k++) {
      if (this.density[k] >= 1) continue;
      this.density[k] = Math.min(1, this.density[k] + step);
      changed = true;
    }
    return changed;
  }

  /**
   * RGBA の画素列（キャンバスの ImageData、上の行から）に曇りの濃さを灰色で書く。
   * 鏡の曇りの重ね（alphaMap）は緑の値を不透明度として使う。
   */
  writeTo(pixels: Uint8ClampedArray): void {
    for (let j = 0; j < this.rows; j++) {
      const row = this.rows - 1 - j; // 画素は上から、格子は下から
      for (let i = 0; i < this.cols; i++) {
        const g = Math.round(this.density[j * this.cols + i] * 255);
        const p = (row * this.cols + i) * 4;
        pixels[p] = g;
        pixels[p + 1] = g;
        pixels[p + 2] = g;
        pixels[p + 3] = 255;
      }
    }
  }
}

/**
 * 鏡の上の点（ワールド座標）を uv（0〜1、左下原点）にする。鏡は +Z を向き、中心と幅・高さで表す。
 * 鏡の外なら null。
 */
export function mirrorUv(
  point: { x: number; y: number },
  mirror: { center: { x: number; y: number }; width: number; height: number },
): { u: number; v: number } | null {
  const u = (point.x - mirror.center.x) / mirror.width + 0.5;
  const v = (point.y - mirror.center.y) / mirror.height + 0.5;
  // 縁ちょうどの点が丸め誤差で外れないよう、わずかな誤差は許して内側に収める
  const EPS = 1e-9;
  if (u < -EPS || u > 1 + EPS || v < -EPS || v > 1 + EPS) return null;
  return { u: Math.min(1, Math.max(0, u)), v: Math.min(1, Math.max(0, v)) };
}

/**
 * every フレームに 1 回だけ true を返す（鏡の反射の描き直しを間引くため）。every が 1 以下なら毎回 true。
 */
export function createUpdateThrottle(every: number): () => boolean {
  const n = Math.max(1, Math.floor(every));
  let frame = 0;
  return () => {
    const due = frame % n === 0;
    frame++;
    return due;
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

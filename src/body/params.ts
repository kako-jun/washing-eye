/**
 * 体のパラメータ。体型・肌色をここに集約し、後から別の体に差し替えられるようにする。
 * 体は抽象的なマネキンで、単純な幾何形状の組み合わせだけで作る。
 */
export interface BodyParams {
  /** 肌色 */
  skinColor: string;
  /** 輪郭線の色（肌色より少し暗く薄い色） */
  outlineColor: string;
  /** 肩幅の倍率 */
  shoulderWidth: number;
  /** 胴の太さの倍率 */
  torsoGirth: number;
  /** 手足の太さの倍率 */
  limbGirth: number;
  /** 手足の長さの倍率 */
  limbLength: number;
}

export const DEFAULT_BODY: BodyParams = {
  skinColor: '#e9c6ad',
  outlineColor: '#8a6a5c',
  shoulderWidth: 1,
  torsoGirth: 1,
  limbGirth: 1,
  limbLength: 1,
};

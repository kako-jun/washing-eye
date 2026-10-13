import * as THREE from 'three';

let sharedGradient: THREE.DataTexture | null = null;

/**
 * トゥーン用のグラデーションマップ。
 * 段数 3（影・中間・明部）。NearestFilter で段を立たせる。
 */
export function getGradientMap(): THREE.DataTexture {
  if (sharedGradient) return sharedGradient;
  const steps = [96, 178, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sharedGradient = tex;
  return tex;
}

export interface ToonOptions {
  color: THREE.ColorRepresentation;
  /** リムライトの色 */
  rimColor?: THREE.ColorRepresentation;
  /** リムライトの強さ（0 で無効） */
  rimStrength?: number;
  transparent?: boolean;
  opacity?: number;
}

/**
 * MeshToonMaterial にリムライトを足したもの。
 * 縁が柔らかく光ることで BotW 風の空気感を出す。
 */
export function createToonMaterial(opts: ToonOptions): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color,
    gradientMap: getGradientMap(),
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  const rimColor = new THREE.Color(opts.rimColor ?? 0xbfe4ff);
  const rimStrength = opts.rimStrength ?? 0.35;
  if (rimStrength > 0) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = { value: rimColor };
      shader.uniforms.uRimStrength = { value: rimStrength };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'uniform vec3 uRimColor;\nuniform float uRimStrength;\nvoid main() {',
        )
        .replace(
          '#include <opaque_fragment>',
          `{
            vec3 viewDir = normalize(vViewPosition);
            float rim = 1.0 - max(dot(normal, viewDir), 0.0);
            rim = smoothstep(0.55, 0.9, rim);
            outgoingLight += uRimColor * rim * uRimStrength;
          }
          #include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => 'toon-rim';
  }
  return mat;
}

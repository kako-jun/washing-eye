import * as THREE from 'three';

/**
 * 反転ハル方式の輪郭線マテリアル。
 * 裏面だけを法線方向に少し膨らませて描き、細く薄い縁取りにする。
 */
export function createOutlineMaterial(
  color: THREE.ColorRepresentation,
  width = 0.004,
): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uOutlineWidth;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = vec3(position) + normalize(normal) * uOutlineWidth;',
      );
  };
  mat.customProgramCacheKey = () => 'outline-hull';
  return mat;
}

/** メッシュと同じジオメトリで輪郭線メッシュを作る */
export function createOutlineMesh(
  source: THREE.Mesh,
  material: THREE.Material,
): THREE.Mesh {
  const outline = new THREE.Mesh(source.geometry, material);
  outline.position.copy(source.position);
  outline.quaternion.copy(source.quaternion);
  outline.scale.copy(source.scale);
  outline.raycast = () => {};
  return outline;
}

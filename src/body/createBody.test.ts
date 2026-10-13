import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBody } from './createBody';
import { DEFAULT_BODY, type BodyParams } from './params';

const make = (over: Partial<BodyParams> = {}) => createBody({ ...DEFAULT_BODY, ...over });

const bbox = (group: THREE.Object3D) => {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
};

const SCALE_KEYS = ['shoulderWidth', 'torsoGirth', 'limbGirth', 'limbLength'] as const;
const allScales = (value: number): Partial<BodyParams> =>
  Object.fromEntries(SCALE_KEYS.map((k) => [k, value]));

function expectFiniteGeometry(group: THREE.Object3D) {
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry as THREE.BufferGeometry;
    for (const name of ['position', 'normal']) {
      const arr = geo.getAttribute(name).array;
      for (let i = 0; i < arr.length; i++) {
        if (!Number.isFinite(arr[i])) throw new Error(`${name}[${i}] が有限値でない: ${arr[i]}`);
      }
    }
  });
}

describe('createBody', () => {
  it('当たり判定の部品は 21 個で、group には部品と輪郭線の 42 個が入る', () => {
    const body = make();
    expect(body.surfaces).toHaveLength(21);
    expect(body.group.children).toHaveLength(42);
  });

  it('当たり判定の部品に輪郭線（裏面描画のメッシュ）を含めない', () => {
    const body = make();
    for (const m of body.surfaces) {
      expect((m.material as THREE.Material).side).not.toBe(THREE.BackSide);
    }
    const outlines = body.group.children.filter(
      (o) => ((o as THREE.Mesh).material as THREE.Material).side === THREE.BackSide,
    );
    expect(outlines).toHaveLength(21);
    for (const o of outlines) expect(body.surfaces).not.toContain(o);
  });

  it('体の外から下向きにレイを飛ばすと、当たるのは当たり判定の部品だけ', () => {
    const body = make();
    body.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    let hitCount = 0;
    for (let x = -0.4; x <= 0.4; x += 0.05) {
      for (let z = -0.7; z <= 0.2; z += 0.05) {
        ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
        for (const h of ray.intersectObjects(body.group.children, false)) {
          expect(body.surfaces).toContain(h.object);
          hitCount++;
        }
      }
    }
    expect(hitCount).toBeGreaterThan(0);
  });

  it('肩幅 2.0 では体の横幅が 1.0 を超え、標準より広い', () => {
    const wide = bbox(make({ shoulderWidth: 2 }).group);
    const normal = bbox(make().group);
    const width = wide.max.x - wide.min.x;
    expect(width).toBeGreaterThan(1.0);
    expect(width).toBeGreaterThan(normal.max.x - normal.min.x);
  });

  it('手足を長くすると、体の前方（-Z）への広がりが伸びる', () => {
    const long = bbox(make({ limbLength: 1.5 }).group);
    const normal = bbox(make().group);
    expect(long.min.z).toBeLessThan(normal.min.z);
  });

  it('手足を太くすると、体全体の外形が大きくなる', () => {
    const thick = bbox(make({ limbGirth: 1.8 }).group);
    const normal = bbox(make().group);
    const ts = thick.getSize(new THREE.Vector3());
    const ns = normal.getSize(new THREE.Vector3());
    expect(ts.x).toBeGreaterThan(ns.x);
    expect(ts.y).toBeGreaterThan(ns.y);
    expect(ts.z).toBeGreaterThan(ns.z);
  });

  it('肌の材質の色は skinColor と一致する', () => {
    const body = make({ skinColor: '#336699' });
    const mat = body.surfaces[0].material as THREE.MeshToonMaterial;
    expect(mat.color.equals(new THREE.Color('#336699'))).toBe(true);
    for (const m of body.surfaces) expect(m.material).toBe(mat);
  });

  it('dispose で全ジオメトリと材質が 1 回ずつ破棄される（輪郭線と共有するジオメトリも二重に破棄しない）', () => {
    const body = make();
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    body.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geos.add(o.geometry);
        mats.add(o.material as THREE.Material);
      }
    });
    expect(geos.size).toBe(21);
    expect(mats.size).toBe(2); // 肌と輪郭線
    const counts = new Map<object, number>();
    for (const t of [...geos, ...mats]) {
      counts.set(t, 0);
      (t as THREE.EventDispatcher<{ dispose: object }>).addEventListener('dispose', () =>
        counts.set(t, counts.get(t)! + 1),
      );
    }
    body.dispose();
    for (const n of counts.values()) expect(n).toBe(1);
  });

  it('標準値と 0.5・2.0 の体型では、頂点と法線に NaN が出ない', () => {
    for (const value of [1, 0.5, 2.0]) {
      expect(() => expectFiniteGeometry(make(allScales(value)).group)).not.toThrow();
    }
  });

  it('範囲外の体型（0・負・NaN）はクランプされ、有限値の体になる', () => {
    const minBox = bbox(make(allScales(0.5)).group);
    const defBox = bbox(make().group);
    for (const value of [0, -1]) {
      const body = make(allScales(value));
      expect(() => expectFiniteGeometry(body.group)).not.toThrow();
      expect(bbox(body.group).equals(minBox)).toBe(true);
    }
    // 非有限値は既定の 1 として扱う
    const nan = make(allScales(NaN));
    expect(() => expectFiniteGeometry(nan.group)).not.toThrow();
    expect(bbox(nan.group).equals(defBox)).toBe(true);
  });
});

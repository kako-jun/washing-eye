import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Steam } from './steam';

const seedAttr = (s: Steam) => s.points.geometry.getAttribute('aSeed') as THREE.BufferAttribute;

describe('湯気', () => {
  it('粒が入れ替わったフレームでは、大きさの種（aSeed）を GPU に送り直す', () => {
    const steam = new Steam(4);
    const before = seedAttr(steam).version;
    steam.update(20); // 寿命を超えて全部入れ替わる
    expect(seedAttr(steam).version).toBeGreaterThan(before);
  });

  it('入れ替わりの無いフレームでは、aSeed は送り直さない', () => {
    const steam = new Steam(4);
    steam.update(20); // 全部入れ替えて寿命を 0 からにそろえる
    const before = seedAttr(steam).version;
    steam.update(0.001);
    expect(seedAttr(steam).version).toBe(before);
  });
});

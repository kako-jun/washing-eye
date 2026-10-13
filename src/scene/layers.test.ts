import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MIRROR_LAYER, VIEW_ONLY_LAYER, setupFirstPersonLayers, setupReflectionLayers } from './layers';
import { Steam } from '../fx/steam';
import { Shower } from '../fx/shower';

const firstPerson = () => {
  const c = new THREE.PerspectiveCamera();
  setupFirstPersonLayers(c);
  return c;
};
/** 反射用のカメラは一人称カメラを複製して作られる（three の Reflector と同じ） */
const reflection = () => {
  const c = firstPerson().clone();
  setupReflectionLayers(c);
  return c;
};
const splashOf = (s: Shower) => s.group.children.find((o) => (o as THREE.Points).isPoints)!;

describe('描き分けのレイヤー', () => {
  it('一人称カメラは一人称だけの効果を描き、鏡だけのものは描かない（既定のレイヤーも描く）', () => {
    const c = firstPerson();
    expect(c.layers.isEnabled(0)).toBe(true);
    expect(c.layers.isEnabled(VIEW_ONLY_LAYER)).toBe(true);
    expect(c.layers.isEnabled(MIRROR_LAYER)).toBe(false);
  });

  it('反射用のカメラは鏡だけのものを描き、一人称だけの効果は描かない（一人称カメラを複製しても）', () => {
    const c = reflection();
    expect(c.layers.isEnabled(0)).toBe(true);
    expect(c.layers.isEnabled(MIRROR_LAYER)).toBe(true);
    expect(c.layers.isEnabled(VIEW_ONLY_LAYER)).toBe(false);
  });

  it('湯気は一人称カメラにだけ映り、鏡の反射には映らない（反射の中で膨らんで白く飛ぶのを防ぐ）', () => {
    const steam = new Steam(4);
    expect(steam.points.layers.test(firstPerson().layers)).toBe(true);
    expect(steam.points.layers.test(reflection().layers)).toBe(false);
  });

  it('シャワーの水しぶきも一人称カメラにだけ映る。水筋は鏡にも映る', () => {
    const shower = new Shower(new THREE.Vector3(0, 1, 0), 4);
    const splash = splashOf(shower);
    expect(splash.layers.test(firstPerson().layers)).toBe(true);
    expect(splash.layers.test(reflection().layers)).toBe(false);
    const streaks = shower.group.children.find((o) => (o as THREE.LineSegments).isLineSegments)!;
    expect(streaks.layers.test(reflection().layers)).toBe(true);
  });
});

import * as THREE from 'three';
import './ui/style.css';
import { createStage, watchPixelRatio } from './scene/stage';
import { createBody } from './body/createBody';
import { DEFAULT_BODY } from './body/params';
import { Foam } from './foam/foam';
import { LookController } from './input/look';
import { PointerInput, type SurfaceHit } from './input/pointer';
import { Sponge } from './input/sponge';
import { createShowerInput } from './input/shower-input';
import { bindToolKeys, createToolState } from './input/tool';
import { AimMarker } from './fx/aim-marker';
import { Steam } from './fx/steam';
import { Shower } from './fx/shower';
import { SoundBoard, bindAudioResumeOnGesture, bindAudioToVisibility } from './fx/audio';
import { showStartScreen } from './ui/start';
import { createGameStart } from './game-start';
import { createHud, type ControlMode } from './ui/hud';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const uiRoot = document.querySelector<HTMLDivElement>('#ui')!;
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const showFps = new URLSearchParams(location.search).has('fps');

const stage = createStage(canvas);
const { scene, camera, renderer } = stage;

// 体（BodyParams を差し替えれば別の体になる）
const body = createBody(DEFAULT_BODY);
scene.add(body.group);

// スマホでは泡の上限を下げて軽く保つ
const foam = new Foam(isTouch ? 600 : 1000);
scene.add(foam.mesh);

const sponge = new Sponge();
scene.add(sponge.group);

const steam = new Steam(isTouch ? 50 : 70);
scene.add(steam.points);

// 固定シャワー: ヘッドは上に固定、視線の中心に当てる
const shower = new Shower(stage.showerHead);
scene.add(shower.group);

// 手持ちシャワー: ポインターの指す点に当てる。ヘッドは当て先の手前に追従させる
const handShower = new Shower(stage.showerHead, 180);
scene.add(handShower.group);
const aimMarker = new AimMarker();
scene.add(aimMarker.mesh);
/** 手持ちシャワーの当て先（体から外れている間は、最後に当たっていた点を保つ） */
const handPoint = new THREE.Vector3();
const handNormal = new THREE.Vector3(0, 1, 0);
let handOnBody = false;

const sound = new SoundBoard();
bindAudioToVisibility(document, sound);
bindAudioResumeOnGesture(window, document, sound);
const look = new LookController();

const FOAM_RADIUS = 0.016;
let scrubSpeed = 0;
const tangent = new THREE.Vector3();
const bitangent = new THREE.Vector3();

const pointer = new PointerInput(canvas, camera, body.surfaces, look, {
  onScrub(hit: SurfaceHit, speed: number) {
    scrubSpeed = Math.max(scrubSpeed, speed);
    // 当たり位置の周りに少し散らして泡を置く（体表に当て直して浮かないようにする）
    foam.add(hit.point, hit.normal, FOAM_RADIUS);
    tangent.set(hit.normal.y, -hit.normal.x, 0);
    if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
    tangent.normalize();
    bitangent.crossVectors(hit.normal, tangent);
    const spread = 0.022;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    const p = hit.point
      .clone()
      .addScaledVector(tangent, Math.cos(a) * r)
      .addScaledVector(bitangent, Math.sin(a) * r)
      .addScaledVector(hit.normal, 0.05);
    const back = pointer.hitRay(p, hit.normal.clone().negate(), 0.1);
    if (back) foam.add(back.point, back.normal, FOAM_RADIUS * (0.7 + Math.random() * 0.5));
  },
  onScrubEnd() {
    scrubSpeed = 0;
  },
  onHover(hit, scrubbing) {
    sponge.setHit(hit, scrubbing);
  },
  onAim(hit, spraying) {
    aimMarker.setTarget(hit, spraying);
    handOnBody = !!hit;
    if (hit) {
      handPoint.copy(hit.point);
      handNormal.copy(hit.normal);
    }
  },
  onSpray(on) {
    handShower.setOn(on);
  },
});

const hud = createHud(uiRoot, {
  showFps,
  onRecenter: () => look.recenter(),
  onTool: (tool) => tools.set(tool),
});

const setMode = (mode: ControlMode) => hud.setMode(mode);
setMode(isTouch ? 'touch' : 'mouse');

let started = false;

// 手に持つ道具（スポンジ／手持ちシャワー）。持ち替えたら、もう一方の動作は止める
const tools = createToolState((tool) => {
  pointer.setTool(tool); // こすり・手持ちの水流を止め、前の道具の目印を消す
  hud.setTool(tool);
  // 手持ちシャワーの間は固定シャワーを使えない（二重に流さない）
  if (tool === 'handShower') showerInput.releaseAll();
});
bindToolKeys({ target: window, tools, isStarted: () => started });

// 固定シャワーはボタンの長押し／Space の、いずれかが押されている間だけ出る（スポンジを持っている間だけ）
const showerInput = createShowerInput({
  target: window,
  doc: document,
  button: hud.showerButton,
  isStarted: () => started,
  isEnabled: () => tools.current === 'sponge',
  onChange(on) {
    shower.setOn(on);
    hud.setShowerOn(on);
  },
});

// フォーカスが外れた・タブが隠れたら、こする・手持ちの水流も止める（固定シャワーは shower-input が止める）
window.addEventListener('blur', () => pointer.cancel());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pointer.cancel();
});
showStartScreen(
  uiRoot,
  isTouch,
  // iOS の傾き許可はこのタップの中で求める。値が届いたら傾きモードに切り替える
  createGameStart({
    sound,
    look,
    isTouch,
    onTiltActive: () => setMode('tilt'),
    onStarted: () => {
      started = true;
      hud.show();
    },
  }),
);

const onResize = () => {
  stage.resize();
  steam.setViewportHeight(renderer.domElement.height, camera.fov);
};
window.addEventListener('resize', onResize);
watchPixelRatio(window, onResize);
onResize();

// シャワーの狙い: 視線の中心のレイが体に当たる点。外れたら前方 1m
const center = new THREE.Vector2(0, 0);
const aimRay = new THREE.Raycaster();
const aimPoint = new THREE.Vector3();
const RINSE_RADIUS = 0.13;
const handHead = new THREE.Vector3();
const toCamera = new THREE.Vector3();

let lastTime = -1;
let elapsed = 0;
let fpsAccum = 0;
let fpsFrames = 0;

renderer.setAnimationLoop((time: number) => {
  const dt = lastTime < 0 ? 1 / 60 : Math.min((time - lastTime) / 1000, 1 / 20);
  lastTime = time;
  elapsed += dt;

  look.update(camera, dt);
  camera.updateMatrixWorld();
  if (started) pointer.update();

  aimRay.setFromCamera(center, camera);
  const aimHit = pointer.hitRay(aimRay.ray.origin, aimRay.ray.direction, 3);
  if (aimHit) aimPoint.copy(aimHit.point);
  else aimPoint.copy(aimRay.ray.origin).addScaledVector(aimRay.ray.direction, 1);
  shower.aim(aimPoint);
  shower.update(dt, aimHit?.normal ?? null);

  // 手持ちシャワー: ヘッドは当て先から体の外側・手前に少し離した位置
  toCamera.subVectors(camera.position, handPoint).normalize();
  handHead.copy(handPoint).addScaledVector(handNormal, 0.14).addScaledVector(toCamera, 0.1);
  handShower.setHead(handHead);
  handShower.aim(handPoint);
  handShower.update(dt, handOnBody ? handNormal : null);
  aimMarker.update(dt);

  // 泡は水の落ちる点を中心に流す（固定: 視線の中心、手持ち: 当て先）
  const fixedFlow = shower.flowLevel;
  if (fixedFlow > 0.2 && aimHit) foam.rinse(aimPoint, RINSE_RADIUS, 2.6 * fixedFlow, dt);
  const handFlow = handShower.flowLevel;
  if (handFlow > 0.2 && handOnBody) foam.rinse(handPoint, RINSE_RADIUS, 2.6 * handFlow, dt);
  foam.update(dt);
  const flow = Math.max(fixedFlow, handFlow);

  sponge.update(dt, elapsed);
  steam.setIntensity(0.45 + flow * 0.25);
  steam.update(dt);

  sound.setScrub(scrubSpeed);
  sound.setWater(flow);
  sound.update();
  scrubSpeed *= Math.exp(-dt * 12);

  renderer.render(scene, camera);

  if (showFps) {
    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      hud.setFps(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
    }
  }
});

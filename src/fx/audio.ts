/**
 * 仮の SE。音源ファイルを使わず WebAudio のノイズから合成する。
 * - こする音: 帯域を絞ったノイズ。こする速さで音量と明るさが変わる
 * - 水音: 広帯域のノイズ＋低い成分。シャワーの出方に追従する
 * - 浴室の気配: ごく小さな低音のノイズと、ときどき落ちる水滴
 */
export class SoundBoard {
  private ctx: AudioContext | null = null;
  private scrubGain!: GainNode;
  private scrubFilter!: BiquadFilterNode;
  private waterGain!: GainNode;
  private master!: GainNode;
  private nextDrip = 0;

  /** ユーザー操作の中で呼ぶ（iOS の自動再生制限のため） */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    void ctx.resume();

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    const noise = this.createNoiseBuffer(ctx, 2);
    const pink = this.createNoiseBuffer(ctx, 3, true);

    // こする音
    {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      this.scrubFilter = ctx.createBiquadFilter();
      this.scrubFilter.type = 'bandpass';
      this.scrubFilter.frequency.value = 1400;
      this.scrubFilter.Q.value = 0.9;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      this.scrubGain = ctx.createGain();
      this.scrubGain.gain.value = 0;
      src.connect(this.scrubFilter).connect(hp).connect(this.scrubGain).connect(this.master);
      src.start();
    }

    // 水音（シャー＋ザー）
    {
      this.waterGain = ctx.createGain();
      this.waterGain.gain.value = 0;
      this.waterGain.connect(this.master);

      const hiss = ctx.createBufferSource();
      hiss.buffer = noise;
      hiss.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      const hissGain = ctx.createGain();
      hissGain.gain.value = 0.35;
      hiss.connect(hp).connect(lp).connect(hissGain).connect(this.waterGain);
      hiss.start();

      const body = ctx.createBufferSource();
      body.buffer = pink;
      body.loop = true;
      const blp = ctx.createBiquadFilter();
      blp.type = 'lowpass';
      blp.frequency.value = 900;
      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.7;
      body.connect(blp).connect(bodyGain).connect(this.waterGain);
      body.start();
    }

    // 浴室の気配
    {
      const room = ctx.createBufferSource();
      room.buffer = pink;
      room.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      room.connect(lp).connect(g).connect(this.master);
      room.start();
    }
    this.nextDrip = ctx.currentTime + 2;
  }

  /** こする強さ（体表上の速さ m/s）。0 で無音 */
  setScrub(speed: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const level = Math.min(speed / 0.8, 1);
    this.scrubGain.gain.setTargetAtTime(level * 0.32, t, level > 0 ? 0.03 : 0.08);
    this.scrubFilter.frequency.setTargetAtTime(900 + level * 1600, t, 0.05);
  }

  /** シャワーの出方（0〜1） */
  setWater(level: number): void {
    if (!this.ctx) return;
    this.waterGain.gain.setTargetAtTime(level * 0.28, this.ctx.currentTime, 0.05);
  }

  /** 毎フレーム呼ぶ。ときどき水滴の音を鳴らす */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (ctx.currentTime < this.nextDrip) return;
    this.nextDrip = ctx.currentTime + 2.5 + Math.random() * 5;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const f = 900 + Math.random() * 700;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.06);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number, pink = false): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) {
        d[i] = w;
        continue;
      }
      // 簡易ピンクノイズ（Paul Kellet の近似を簡略化）
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }
}

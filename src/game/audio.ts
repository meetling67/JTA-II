import { ParadiseHeatSettings } from './types';

/**
 * 100% procedural Web Audio synthesizer + custom user soundtrack player.
 * Mirrors UParadiseHeatExperience: Master, Music, Engine (car & motorcycle),
 * and Reactions (punches, impacts, pedestrian shouts), plus Pause/Resume sync.
 */
export class ParadiseHeatAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private reactionGain: GainNode | null = null;

  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineActiveGain: GainNode | null = null;

  private sirenOsc: OscillatorNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private sirenLfoGain: GainNode | null = null;
  private sirenActiveGain: GainNode | null = null;

  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private paused = false;
  private initialized = false;

  private customAudioEl: HTMLAudioElement | null = null;
  private customObjectUrl: string | null = null;
  private customPlaying = false;
  private customStatus = 'Built-in soundtrack';

  private settings: ParadiseHeatSettings;

  constructor(settings: ParadiseHeatSettings) {
    this.settings = { ...settings };
  }

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended' && !this.paused) {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.engineGain = this.ctx.createGain();
    this.reactionGain = this.ctx.createGain();

    this.musicGain.connect(this.masterGain);
    this.engineGain.connect(this.masterGain);
    this.reactionGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Setup continuous engine synthesizer (silent until driving)
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2.type = 'triangle';
    this.engineOsc1.frequency.value = 55;
    this.engineOsc2.frequency.value = 110;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 260;

    this.engineActiveGain = this.ctx.createGain();
    this.engineActiveGain.gain.value = 0;

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineActiveGain);
    this.engineActiveGain.connect(this.engineGain);

    this.engineOsc1.start();
    this.engineOsc2.start();

    // Setup continuous police siren synthesizer (silent until police pursuit)
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sawtooth';
    this.sirenOsc.frequency.value = 760;

    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 1.65;
    this.sirenLfoGain = this.ctx.createGain();
    this.sirenLfoGain.gain.value = 210;
    this.sirenLfo.connect(this.sirenLfoGain);
    this.sirenLfoGain.connect(this.sirenOsc.frequency);

    const sirenFilter = this.ctx.createBiquadFilter();
    sirenFilter.type = 'bandpass';
    sirenFilter.frequency.value = 980;
    sirenFilter.Q.value = 1.8;

    this.sirenActiveGain = this.ctx.createGain();
    this.sirenActiveGain.gain.value = 0;

    this.sirenOsc.connect(sirenFilter);
    sirenFilter.connect(this.sirenActiveGain);
    this.sirenActiveGain.connect(this.reactionGain);

    this.sirenOsc.start();
    this.sirenLfo.start();

    this.initialized = true;
    this.applySettings(this.settings);
    this.startBuiltInMusicLoop();
  }

  public applySettings(settings: ParadiseHeatSettings): void {
    this.settings = { ...settings };
    if (this.ctx && this.masterGain && this.musicGain && this.engineGain && this.reactionGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(settings.masterVolume, now, 0.04);
      this.musicGain.gain.setTargetAtTime(settings.musicVolume * 0.28, now, 0.04);
      this.engineGain.gain.setTargetAtTime(settings.engineVolume * 0.45, now, 0.04);
      this.reactionGain.gain.setTargetAtTime(settings.reactionVolume * 0.75, now, 0.04);
    }
    if (this.customAudioEl) {
      this.customAudioEl.volume = Math.min(1, settings.masterVolume * settings.musicVolume * 0.85);
    }
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.ctx) {
      if (paused) {
        void this.ctx.suspend();
      } else {
        void this.ctx.resume();
      }
    }
    if (this.customAudioEl && this.customPlaying) {
      if (paused) {
        this.customAudioEl.pause();
      } else {
        void this.customAudioEl.play().catch(() => {});
      }
    }
  }

  public updateEngine(active: boolean, isMotorcycle: boolean, speedRatio: number, throttle: number): void {
    if (!this.ctx || !this.engineActiveGain || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!active || this.paused) {
      this.engineActiveGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    const clampedSpeed = Math.min(1.4, Math.max(0, speedRatio));
    const baseFreq = isMotorcycle ? 74 : 46;
    const pitch = baseFreq + clampedSpeed * (isMotorcycle ? 128 : 82) + Math.abs(throttle) * (isMotorcycle ? 28 : 18);

    this.engineOsc1.type = isMotorcycle ? 'sawtooth' : 'sawtooth';
    this.engineOsc2.type = isMotorcycle ? 'square' : 'triangle';
    this.engineOsc1.frequency.setTargetAtTime(pitch, now, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(pitch * (isMotorcycle ? 1.5 : 2.0), now, 0.05);
    this.engineFilter.frequency.setTargetAtTime(220 + clampedSpeed * 900 + Math.abs(throttle) * 450, now, 0.06);
    this.engineActiveGain.gain.setTargetAtTime(0.14 + Math.abs(throttle) * 0.16 + clampedSpeed * 0.08, now, 0.06);
  }

  public updateSiren(active: boolean, proximityRatio: number): void {
    if (!this.ctx || !this.sirenActiveGain || !this.sirenLfo) return;
    const now = this.ctx.currentTime;
    if (!active || this.paused) {
      this.sirenActiveGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }
    const level = 0.035 + Math.min(1, Math.max(0, proximityRatio)) * 0.14;
    this.sirenActiveGain.gain.setTargetAtTime(level, now, 0.08);
    this.sirenLfo.frequency.setTargetAtTime(1.4 + proximityRatio * 1.4, now, 0.1);
  }

  public playPoliceDispatch(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1240, now);
    osc.frequency.setValueAtTime(920, now + 0.09);
    osc.frequency.setValueAtTime(1240, now + 0.18);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.29);
  }

  public playPunch(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;

    // Crisp air whoosh on punch swing
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.13);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playPunchHit(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;

    // Deep body thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.16);
    gain.gain.setValueAtTime(0.46, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.19);

    // Crisp slap transient
    const bufLen = Math.floor(this.ctx.sampleRate * 0.08);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1150;
    const nGain = this.ctx.createGain();
    nGain.gain.value = 0.42;
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.reactionGain);
    noise.start(now);
  }

  public playGunshot(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;

    // Sharp pistol crack transient
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.11);
    g.gain.setValueAtTime(0.42, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g);
    g.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.13);

    // Gunfire noise burst + street echo tail
    const bufLen = Math.floor(this.ctx.sampleRate * 0.26);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.2));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3400, now);
    filter.frequency.exponentialRampToValueAtTime(380, now + 0.24);
    const nGain = this.ctx.createGain();
    nGain.gain.value = 0.5;
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.reactionGain);
    noise.start(now);
  }

  public playPlayerHurt(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(64, now + 0.16);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    g.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playImpact(intensity = 0.7): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;
    const vol = Math.min(1, Math.max(0.15, intensity));

    // Low crunch + metallic thump
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140 + vol * 60, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.24);
    gain.gain.setValueAtTime(0.42 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.27);

    // Noise burst
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.18);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 650;
    const nGain = this.ctx.createGain();
    nGain.gain.value = 0.35 * vol;
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.reactionGain);
    noise.start(now);
  }

  public playPedestrianShout(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;

    // Formant-filtered startled vocal "Hey! / Aargh!" synth
    const osc = this.ctx.createOscillator();
    const formant = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    const basePitch = 165 + Math.random() * 95;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(basePitch * 1.15, now);
    osc.frequency.exponentialRampToValueAtTime(basePitch * 0.72, now + 0.34);

    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(920, now);
    formant.frequency.exponentialRampToValueAtTime(620, now + 0.34);
    formant.Q.value = 3.2;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(formant);
    formant.connect(gain);
    gain.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playDoorLatch(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.09);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playGlassShatter(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;

    const bufLen = Math.floor(this.ctx.sampleRate * 0.24);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.22));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    const nGain = this.ctx.createGain();
    nGain.gain.value = 0.42;
    noise.connect(hp);
    hp.connect(nGain);
    nGain.connect(this.reactionGain);
    noise.start(now);

    // High crystalline shard pings
    const freqs = [3100, 4250, 5350];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.reactionGain) return;
      const t0 = now + idx * 0.028;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f + Math.random() * 400, t0);
      g.gain.setValueAtTime(0.11, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      osc.connect(g);
      g.connect(this.reactionGain);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    });
  }

  public playTirePop(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.12);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g);
    g.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.15);

    // Air hiss tail
    const bufLen = Math.floor(this.ctx.sampleRate * 0.35);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.45));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    const nGain = this.ctx.createGain();
    nGain.gain.value = 0.28;
    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(this.reactionGain);
    noise.start(now + 0.02);
  }

  public playShellClink(): void {
    if (!this.ctx || !this.reactionGain || this.paused) return;
    const now = this.ctx.currentTime + 0.14;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4200 + Math.random() * 700, now);
    g.gain.setValueAtTime(0.045, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(g);
    g.connect(this.reactionGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public loadCustomSong(file: File): string {
    this.unlock();
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl = null;
    }

    const url = URL.createObjectURL(file);
    this.customObjectUrl = url;
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = Math.min(1, this.settings.masterVolume * this.settings.musicVolume * 0.85);
    this.customAudioEl = audio;
    this.customPlaying = true;
    this.customStatus = file.name;

    if (!this.paused) {
      void audio.play().catch(() => {});
    }
    return this.customStatus;
  }

  public useDefaultMusic(): string {
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl = null;
    }
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
    this.customPlaying = false;
    this.customStatus = 'Built-in soundtrack';
    return this.customStatus;
  }

  public getMusicStatus(): string {
    return this.customStatus;
  }

  private startBuiltInMusicLoop(): void {
    if (this.bgmTimer !== null) return;
    // Warm Miami-heat synthwave bassline & Rhodes chords (112 BPM -> ~134ms 16th note)
    const bassNotes = [55, 55, 65.41, 55, 73.42, 73.42, 82.41, 65.41];
    const leadNotes = [220, 0, 261.63, 329.63, 293.66, 0, 392.0, 329.63, 220, 0, 261.63, 329.63, 440, 392, 329.63, 293.66];

    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.paused || this.customPlaying) return;
      if (this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const step = this.bgmStep++;

      // Warm analog bass pulse on 8th notes
      if (step % 2 === 0) {
        const freq = bassNotes[(step / 2) % bassNotes.length];
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, now);
        filter.frequency.exponentialRampToValueAtTime(160, now + 0.22);
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(filter);
        filter.connect(g);
        g.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.25);
      }

      // Soft sun-drenched synth pluck
      const lead = leadNotes[step % leadNotes.length];
      if (lead > 0) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(lead, now);
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    }, 175);
  }

  public dispose(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl = null;
    }
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
    if (this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this.sirenLfo?.stop();
      } catch {
        // Already stopped
      }
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

/**
 * everything the player hears: one-shot effects, the jetpack, and music that follows the run
 * browser only; the simulation never imports this
 *
 * graph:  effects ─┐
 *         jetpack ─┼─ sfx bus ──┐
 *         booster ─┘            ├─ limiter ─ speakers
 *         menu bed ─┬─ tone ─ level ─ duck ─ music bus ─┘
 *         run track ┘
 */

const assetPath = (path: string): string => `${import.meta.env.BASE_URL}assets/audio/${path}`;

/** short sounds that play once */
export type SoundName = "click" | "coin" | "collision" | "fail" | "powerup" | "thud" | "whoosh" | "sting" | "zap";

/** per-sound level, so every call site can think in 0..1 */
const LEVELS: Record<SoundName, number> = {
  click: 0.5,
  coin: 0.45,
  collision: 0.6,
  fail: 0.5,
  powerup: 0.3, // the sample is mastered far hotter than the rest
  thud: 0.7,
  whoosh: 0.5,
  sting: 0.6,
  zap: 0.5,
};

const LOOPS = ["jetpack", "nitro", "run"] as const;
type LoopName = (typeof LOOPS)[number];

/** semitones above the base coin for each coin of an unbroken streak; it holds at the octave */
const COIN_LADDER = [0, 2, 4, 5, 7, 9, 11, 12];

// the menu bed is mastered about 5 dB louder than the run track; these land both at the same loudness
const MENU_LEVEL = 0.35;
const RUN_LEVEL = 0.6;
const JETPACK_LEVEL = 0.42;
const NITRO_LEVEL = 0.5;
/** a one-shot starts where its sound starts: lead-in quieter than this share of the peak is skipped */
const LEAD_IN_THRESHOLD = 0.02;
/** low-pass cutoff that leaves the music untouched */
const OPEN = 20000;
/** the run music starts slightly dark and is fully open once the difficulty passes this */
const OPEN_AT_INTENSITY = 0.15;
const DARK = 5500;

const PREFS_KEY = "starfall-audio";

export type AudioScene = "menu" | "run" | "paused" | "dead";

/** what the game looks like this frame, as far as sound is concerned */
export interface AudioFrame {
  scene: AudioScene;
  /** the jetpack is firing */
  thrust: boolean;
  booster: boolean;
  /** 0..1, how far the run has ramped up */
  intensity: number;
  /** vertical speed of the player, px/s, negative is up */
  vy: number;
  /** the crash has come to rest and the results are on screen */
  settled: boolean;
}

interface PlayOptions {
  volume?: number;
  rate?: number;
  /** random pitch variation, as a fraction of the rate */
  spread?: number;
}

interface Graph {
  ctx: AudioContext;
  sfxBus: GainNode;
  musicBus: GainNode;
  tone: BiquadFilterNode;
  level: GainNode;
  duck: GainNode;
  menuGain: GainNode;
  runGain: GainNode;
  jetTone: BiquadFilterNode;
  jetGain: GainNode;
  nitroGain: GainNode;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** where the audible part of a decoded sound begins, a few milliseconds early to keep its attack */
function leadInSeconds(buffer: AudioBuffer): number {
  const samples = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const threshold = peak * LEAD_IN_THRESHOLD;
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first++;
  return Math.max(0, first / buffer.sampleRate - 0.004);
}

export class AudioEngine {
  private graph: Graph | null = null;
  /** decoding needs no user gesture, so every sound is ready before the first key press */
  private decoder = typeof OfflineAudioContext === "undefined" ? null : new OfflineAudioContext(1, 1, 44100);
  private buffers = new Map<SoundName | LoopName, AudioBuffer>();
  /** seconds of near-silence at the head of each one-shot, skipped so the sound lands on its frame */
  private leadIn = new Map<SoundName, number>();
  /** loop regions inside the loop files; a loop without an entry repeats the whole file */
  private loopPoints: Partial<Record<LoopName, { loopStart: number; loopEnd: number }>> = {};
  private menu = new Audio(assetPath("atmosphere.mp3"));

  private jetSource: AudioBufferSourceNode | null = null;
  private nitroSource: AudioBufferSourceNode | null = null;
  private runSource: AudioBufferSourceNode | null = null;
  /** seconds since the run music or the booster was last needed; they stop after a short fade */
  private runIdle = 0;
  private nitroIdle = 0;
  private menuIdle = 0;

  /** last value sent to each parameter, so a steady frame schedules nothing */
  private targets = new Map<AudioParam, number>();
  private lastCoinAt = 0;
  private musicEnabled = true;
  private soundEnabled = true;

  constructor() {
    this.menu.loop = true;
    this.menu.preload = "auto";
    this.loadPrefs();

    const names: (SoundName | LoopName)[] = [...(Object.keys(LEVELS) as SoundName[]), ...LOOPS];
    for (const name of names) void this.load(name);
    void fetch(assetPath("loops.json"))
      .then((res) => (res.ok ? res.json() : {}))
      .then((points) => {
        this.loopPoints = points;
      })
      .catch(() => {});

    // the frame loop stops in a hidden tab, so the sound has to stop with it
    document.addEventListener("visibilitychange", () => {
      const ctx = this.graph?.ctx;
      if (!ctx) return;
      if (document.hidden) {
        void ctx.suspend();
        this.menu.pause();
      } else {
        void ctx.resume();
      }
    });
  }

  /** browsers only allow sound after a key press or a tap; every input calls this */
  unlock(): void {
    if (this.graph) {
      if (this.graph.ctx.state !== "running" && !document.hidden) void this.graph.ctx.resume();
      return;
    }
    if (typeof AudioContext === "undefined") return;
    this.graph = this.build(new AudioContext({ latencyHint: "interactive" }));
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  toggleMusic(): void {
    this.musicEnabled = !this.musicEnabled;
    if (this.graph) this.glide(this.graph.musicBus.gain, this.musicEnabled ? 1 : 0, 0.04);
    this.savePrefs();
  }

  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    if (this.graph) this.glide(this.graph.sfxBus.gain, this.soundEnabled ? 1 : 0, 0.02);
    this.savePrefs();
  }

  play(name: SoundName, { volume = 1, rate = 1, spread = 0 }: PlayOptions = {}): void {
    const g = this.graph;
    const buffer = this.buffers.get(name);
    if (!g || !buffer || !this.soundEnabled) return;

    const source = g.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * spread);
    const gain = g.ctx.createGain();
    gain.gain.value = LEVELS[name] * volume;
    source.connect(gain).connect(g.sfxBus);
    source.start(0, this.leadIn.get(name) ?? 0);
  }

  /** each coin of an unbroken streak rings one step higher */
  coin(streak: number): void {
    const now = performance.now();
    if (now - this.lastCoinAt < 28) return; // two coins in one frame are one sound
    this.lastCoinAt = now;
    const step = COIN_LADDER[clamp(streak - 1, 0, COIN_LADDER.length - 1)];
    this.play("coin", { rate: 2 ** (step / 12) });
  }

  /** pull the music down for a moment so a sound can be heard over it */
  duck(depth: number, seconds: number): void {
    const g = this.graph;
    if (!g) return;
    const now = g.ctx.currentTime;
    const gain = g.duck.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(depth, now);
    gain.linearRampToValueAtTime(1, now + seconds);
  }

  /** follow the game; call once per rendered frame */
  update(frame: AudioFrame, dt: number): void {
    const g = this.graph;
    if (!g) return;

    const inRun = frame.scene !== "menu";
    const flying = frame.scene === "run";

    // music: the menu bed and the run track swap with a short crossfade
    if (flying && !this.runSource) this.runSource = this.startLoop(g, "run", g.runGain);
    this.glide(g.runGain.gain, inRun ? 1 : 0, 0.2);
    this.glide(g.menuGain.gain, inRun ? 0 : 1, 0.3);
    this.runIdle = inRun ? 0 : this.runIdle + dt;
    if (this.runIdle > 1.2 && this.runSource) {
      this.runSource.stop();
      this.runSource = null;
    }
    this.menuIdle = inRun ? this.menuIdle + dt : 0;
    if (inRun) {
      if (this.menuIdle > 1.5 && !this.menu.paused) this.menu.pause();
    } else if (this.menu.paused) {
      void this.menu.play().catch(() => {});
    }

    let cutoff = OPEN;
    let level = MENU_LEVEL;
    let rate = 1;
    if (frame.scene === "run") {
      // quantised, so a slow ramp does not schedule a change every frame
      const open = Math.round(clamp(frame.intensity / OPEN_AT_INTENSITY, 0, 1) * 24) / 24;
      cutoff = frame.booster ? OPEN : DARK * (OPEN / DARK) ** open;
      level = RUN_LEVEL * (0.85 + 0.15 * open);
      rate = frame.booster ? 1.05 : 1;
    } else if (frame.scene === "paused") {
      cutoff = 520;
      level = RUN_LEVEL * 0.45;
    } else if (frame.scene === "dead") {
      // the track sags like a slowing tape through the tumble, then sits muffled under the results
      cutoff = frame.settled ? 1100 : 620;
      level = RUN_LEVEL * (frame.settled ? 0.6 : 0.5);
      rate = frame.settled ? 1 : 0.74;
    }
    this.glide(g.tone.frequency, cutoff, flying ? 0.12 : 0.07);
    this.glide(g.level.gain, level, 0.15);
    if (this.runSource) this.glide(this.runSource.playbackRate, rate, frame.scene === "dead" ? 0.16 : 0.3);

    // jetpack: fast on, slightly slower off, and it rises in pitch on the way up
    if (!this.jetSource) this.jetSource = this.startLoop(g, "jetpack", g.jetTone);
    const firing = flying && frame.thrust && !frame.booster;
    this.glide(g.jetGain.gain, firing ? JETPACK_LEVEL : 0, firing ? 0.03 : 0.08);
    this.glide(g.jetTone.frequency, firing ? 9000 : 700, firing ? 0.04 : 0.1);
    if (this.jetSource) {
      const pitch = Math.round((1 + clamp(-frame.vy / 6000, -0.06, 0.1)) * 100) / 100;
      this.glide(this.jetSource.playbackRate, pitch, 0.1);
    }

    // booster: a fresh source each time, so the ignition at the start of the sample is heard
    const boosting = flying && frame.booster;
    if (boosting && !this.nitroSource) this.nitroSource = this.startLoop(g, "nitro", g.nitroGain);
    this.glide(g.nitroGain.gain, boosting ? NITRO_LEVEL : 0, boosting ? 0.05 : 0.3);
    this.nitroIdle = boosting ? 0 : this.nitroIdle + dt;
    if (this.nitroIdle > 1.5 && this.nitroSource) {
      this.nitroSource.stop();
      this.nitroSource = null;
    }
  }

  private build(ctx: AudioContext): Graph {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);

    const gain = (value: number, to: AudioNode): GainNode => {
      const node = ctx.createGain();
      node.gain.value = value;
      node.connect(to);
      return node;
    };
    const lowpass = (frequency: number, to: AudioNode): BiquadFilterNode => {
      const node = ctx.createBiquadFilter();
      node.type = "lowpass";
      node.frequency.value = frequency;
      node.Q.value = 0.6;
      node.connect(to);
      return node;
    };

    const sfxBus = gain(this.soundEnabled ? 1 : 0, limiter);
    const musicBus = gain(this.musicEnabled ? 1 : 0, limiter);
    const duck = gain(1, musicBus);
    const level = gain(MENU_LEVEL, duck);
    const tone = lowpass(OPEN, level);
    const menuGain = gain(1, tone);
    const runGain = gain(0, tone);
    const jetGain = gain(0, sfxBus);
    const jetTone = lowpass(700, jetGain);
    const nitroGain = gain(0, sfxBus);

    ctx.createMediaElementSource(this.menu).connect(menuGain);
    void this.menu.play().catch(() => {});

    return { ctx, sfxBus, musicBus, tone, level, duck, menuGain, runGain, jetTone, jetGain, nitroGain };
  }

  /** a loop with loop points plays its lead-in once, then stays inside the loop region */
  private startLoop(g: Graph, name: LoopName, to: AudioNode): AudioBufferSourceNode | null {
    const buffer = this.buffers.get(name);
    if (!buffer) return null; // still decoding; the caller tries again next frame
    const source = g.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const points = this.loopPoints[name];
    if (points && points.loopEnd > points.loopStart && points.loopEnd <= buffer.duration) {
      source.loopStart = points.loopStart;
      source.loopEnd = points.loopEnd;
    }
    source.connect(to);
    source.start();
    return source;
  }

  /** move a parameter towards a value; a repeated target schedules nothing */
  private glide(param: AudioParam, value: number, timeConstant: number): void {
    if (this.targets.get(param) === value) return;
    this.targets.set(param, value);
    param.setTargetAtTime(value, this.graph!.ctx.currentTime, timeConstant);
  }

  private async load(name: SoundName | LoopName): Promise<void> {
    if (!this.decoder) return;
    try {
      const res = await fetch(assetPath(`${name}.mp3`));
      if (!res.ok) return;
      const buffer = await this.decoder.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buffer);
      if (name in LEVELS) this.leadIn.set(name as SoundName, leadInSeconds(buffer));
    } catch {
      // a sound that fails to load is silence, never an error
    }
  }

  private loadPrefs(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      if (typeof saved.music === "boolean") this.musicEnabled = saved.music;
      if (typeof saved.sound === "boolean") this.soundEnabled = saved.sound;
    } catch {
      // private mode or a damaged entry: keep the defaults
    }
  }

  private savePrefs(): void {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ music: this.musicEnabled, sound: this.soundEnabled }));
    } catch {
      // nothing to do: the choice still holds for this session
    }
  }
}

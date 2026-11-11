type SoundEffect = "coin" | "collision" | "fail" | "powerup" | "click";

const assetPath = (path: string): string =>
  `${import.meta.env.BASE_URL}${path}`;

export class AudioManager {
  private music = new Audio(assetPath("assets/audio/atmosphere.mp3"));
  private nitro = new Audio(assetPath("assets/audio/nitro.mp3"));

  private effects: Record<SoundEffect, string> = {
    coin: assetPath("assets/audio/coin.mp3"),
    collision: assetPath("assets/audio/collision.mp3"),
    fail: assetPath("assets/audio/fail.mp3"),
    powerup: assetPath("assets/audio/powerup.mp3"),
    click: assetPath("assets/audio/click.mp3"),
  };

  private unlocked = false;
  private boosterVolume = 0;
  private musicEnabled = true;
  private soundEnabled = true;

  constructor() {
    this.music.loop = true;
    this.music.volume = 0.35;
    this.nitro.loop = true;
    this.nitro.volume = 0;
  }

  unlock(): void {
    if (this.unlocked) return;

    this.unlocked = true;

    if (this.musicEnabled) {
      void this.music.play().catch(() => {});
    }
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  toggleMusic(): void {
    this.musicEnabled = !this.musicEnabled;

    if (!this.unlocked) return;

    if (this.musicEnabled) {
      void this.music.play().catch(() => {});
    } else {
      this.music.pause();
    }
  }

  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;

    if (!this.soundEnabled) {
      this.boosterVolume = 0;
      this.nitro.volume = 0;
      this.nitro.pause();
      this.nitro.currentTime = 0;
    }
  }

  play(effect: SoundEffect): void {
    if (!this.unlocked || !this.soundEnabled) return;

    const sound = new Audio(this.effects[effect]);
    sound.volume = effect === "collision" ? 0.65 : 0.5;
    void sound.play().catch(() => {});
  }

  updateBooster(active: boolean, dt: number): void {
    if (!this.unlocked) return;

    if (!this.soundEnabled) {
      this.boosterVolume = 0;
      this.nitro.volume = 0;
      this.nitro.pause();
      this.nitro.currentTime = 0;
      return;
    }

    const target = active ? 0.55 : 0;

    if (active && this.nitro.paused) {
      this.nitro.currentTime = 0;
      void this.nitro.play().catch(() => {});
    }

    this.boosterVolume +=
      (target - this.boosterVolume) * Math.min(1, 1.5 * dt);

    this.nitro.volume = Math.max(0, Math.min(1, this.boosterVolume));

    if (!active && this.boosterVolume < 0.01 && !this.nitro.paused) {
      this.boosterVolume = 0;
      this.nitro.volume = 0;
      this.nitro.pause();
      this.nitro.currentTime = 0;
    }
  }
}

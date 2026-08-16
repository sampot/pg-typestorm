/**
 * Sample playback for the storm. Every effect keeps a small pool of clones so
 * fast typing never cuts the previous blip off, and `rate` shifts pitch as the
 * combo climbs. All samples are CC0 (see ATTRIBUTION.md).
 */

const FX = {
  key: { file: "key.ogg", volume: 0.3, pool: 6 },
  lock: { file: "lock.ogg", volume: 0.4, pool: 3 },
  burst: { file: "burst.ogg", volume: 0.45, pool: 4 },
  error: { file: "error.ogg", volume: 0.35, pool: 3 },
  breach: { file: "breach.ogg", volume: 0.5, pool: 2 },
  bonus: { file: "bonus.ogg", volume: 0.45, pool: 2 },
  wave: { file: "wave.ogg", volume: 0.5, pool: 2 },
  win: { file: "win.ogg", volume: 0.6, pool: 1 },
  lose: { file: "lose.ogg", volume: 0.55, pool: 1 },
};

export class GameAudio {
  constructor(base = "./assets/audio/") {
    this.base = base;
    this.enabled = true;
    this.pools = new Map();
    this.cursors = new Map();
    this.music = null;
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (!this.enabled) this.music?.pause();
    else if (this.music) void this.music.play().catch(() => {});
    return this.enabled;
  }

  /** Called from a user gesture so autoplay policies are satisfied. */
  async startMusic() {
    if (!this.enabled) return;
    if (!this.music) {
      this.music = new Audio(`${this.base}music.ogg`);
      this.music.loop = true;
      this.music.volume = 0.18;
    }
    try {
      await this.music.play();
    } catch {
      // A blocked autoplay attempt must never break the game loop.
    }
  }

  stopMusic() {
    this.music?.pause();
  }

  pool(name) {
    if (this.pools.has(name)) return this.pools.get(name);
    const spec = FX[name];
    if (!spec) return null;
    const clips = Array.from({ length: spec.pool }, () => {
      const clip = new Audio(`${this.base}${spec.file}`);
      clip.volume = spec.volume;
      clip.preload = "auto";
      return clip;
    });
    this.pools.set(name, clips);
    this.cursors.set(name, 0);
    return clips;
  }

  play(name, { rate = 1, volume } = {}) {
    if (!this.enabled) return;
    const clips = this.pool(name);
    if (!clips?.length) return;
    const index = this.cursors.get(name) ?? 0;
    const clip = clips[index];
    this.cursors.set(name, (index + 1) % clips.length);
    try {
      clip.currentTime = 0;
      clip.playbackRate = Math.max(0.5, Math.min(2.4, rate));
      if (volume != null) clip.volume = Math.max(0, Math.min(1, volume));
      void clip.play().catch(() => {});
    } catch {
      // Some browsers throw on currentTime before metadata loads; skip a beat.
    }
  }
}

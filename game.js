/**
 * 字幕風暴 (pg-typestorm) — pure game logic.
 *
 * No DOM, no audio, no timers: the shell drives `tick(dt)` from
 * requestAnimationFrame and feeds physical keystrokes into `key(letter)`.
 * Coordinates are percentages of the storm field (y = 100 is the city roof).
 */

export const FIELD_HEIGHT = 100;
export const SPAWN_Y = -6;
export const EDGE_MIN = 5;
export const EDGE_MAX = 95;

export const MAX_LIVES = 5;
export const START_LIVES = 3;
/** Wrong keystrokes tolerated before the city takes damage. */
export const STRIKES_PER_LIFE = 5;
/** Every N combo repairs one life (capped at MAX_LIVES). */
export const COMBO_LIFE_STEP = 12;
export const LETTER_SCORE = 10;
export const CLEAR_SCORE_PER_LETTER = 25;
export const MAX_MULTIPLIER = 5;
export const WAVE_BREAK = 1.6;

/** Short words grouped by length; later waves draw from the longer banks. */
export const WORD_POOL = {
  3: ["bus", "cat", "dot", "fog", "ink", "jam", "key", "mud", "net", "oil", "pin", "ray", "sky", "tea", "van", "wax", "yam", "zip"],
  4: ["bolt", "cake", "dusk", "echo", "fern", "gale", "hail", "iris", "jolt", "kite", "lime", "mist", "node", "opal", "pier", "raft", "silk", "tide", "vine", "wind", "yarn", "zinc", "boba"],
  5: ["amber", "blitz", "cloud", "drift", "ember", "flash", "grasp", "haste", "inlet", "jetty", "knock", "lunar", "mango", "night", "ocean", "pixel", "quest", "ridge", "storm", "thumb", "urban", "vapor", "whisk", "yield", "zebra", "matsu"],
  6: ["basalt", "cipher", "damper", "escape", "fabric", "gazebo", "hazard", "impact", "jigsaw", "kernel", "lagoon", "marble", "nimbus", "oolong", "plasma", "quartz", "ripple", "signal", "temple", "upward", "vessel", "wicket", "yonder", "zenith", "taipei", "penghu", "taroko"],
  7: ["ballast", "cascade", "drizzle", "eclipse", "fortune", "gateway", "harvest", "isolate", "kinetic", "lantern", "monsoon", "network", "octagon", "pendant", "quantum", "rampart", "scooter", "typhoon", "upgrade", "vantage", "whisker", "keelung", "hsinchu"],
  8: ["aquarium", "blizzard", "campfire", "downpour", "elevator", "firewall", "gradient", "headwind", "keystone", "lakeside", "monolith", "notebook", "overcast", "pinwheel", "quantify", "rainfall", "seashell", "tailwind", "umbrella", "vineyard", "windmill", "dumpling"],
};

/** Wave table: fall speed (%/s) and word length climb every wave. */
export const WAVES = [
  { count: 6, speed: 7, spawnEvery: 2.4, maxAlive: 3, lengths: [3, 4], kinds: ["drift"] },
  { count: 8, speed: 8.5, spawnEvery: 2.1, maxAlive: 4, lengths: [3, 4, 5], kinds: ["drift", "swoop"] },
  { count: 10, speed: 10, spawnEvery: 1.9, maxAlive: 4, lengths: [4, 5, 6], kinds: ["drift", "swoop"] },
  { count: 12, speed: 11.5, spawnEvery: 1.7, maxAlive: 5, lengths: [4, 5, 6, 7], kinds: ["drift", "swoop", "heavy"] },
  { count: 14, speed: 13, spawnEvery: 1.5, maxAlive: 5, lengths: [5, 6, 7], kinds: ["drift", "swoop", "heavy"] },
  { count: 16, speed: 15, spawnEvery: 1.3, maxAlive: 6, lengths: [5, 6, 7, 8], kinds: ["drift", "swoop", "heavy"] },
];

/** Deterministic RNG so tests (and replays) can pin a seed. */
export function createRng(seed = 20260817) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Which falling word should a fresh keystroke lock onto?
 * Only untouched words whose first letter matches; the most urgent (lowest on
 * screen) wins. Returns -1 when nothing matches.
 */
export function chooseTarget(words, letter) {
  let best = -1;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word.typed !== 0 || word.text[0] !== letter) continue;
    if (best < 0 || word.y > words[best].y) best = i;
  }
  return best;
}

export function comboMultiplier(combo) {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / 10));
}

export class TypestormGame {
  constructor({ seed = 20260817, rng, pool = WORD_POOL, waves = WAVES } = {}) {
    this.rng = rng ?? createRng(seed);
    this.pool = pool;
    this.waves = waves;
    this.reset();
  }

  reset() {
    this.status = "idle";
    this.waveIndex = 0;
    this.pending = this.waves[0].count;
    this.spawnTimer = 0.4;
    this.breakTimer = 0;
    this.words = [];
    this.targetId = null;
    this.nextId = 1;
    this.lives = START_LIVES;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.hits = 0;
    this.misses = 0;
    this.strikes = 0;
    this.cleared = 0;
    this.breaches = 0;
    this.elapsed = 0;
    this.message = "打第一個字母就會鎖定那個詞";
  }

  start() {
    this.reset();
    this.status = "playing";
    return this;
  }

  pause() {
    if (this.status === "playing") this.status = "paused";
    return this.status;
  }

  resume() {
    if (this.status === "paused") this.status = "playing";
    return this.status;
  }

  get outcome() {
    return this.status === "won" || this.status === "lost" ? this.status : "playing";
  }

  get wave() {
    return this.waveIndex + 1;
  }

  get waveConfig() {
    return this.waves[Math.min(this.waveIndex, this.waves.length - 1)];
  }

  get multiplier() {
    return comboMultiplier(this.combo);
  }

  get target() {
    return this.words.find((word) => word.id === this.targetId) ?? null;
  }

  /** Word closest to the city — what the on-screen assist row should suggest. */
  get urgent() {
    let urgent = null;
    for (const word of this.words) if (!urgent || word.y > urgent.y) urgent = word;
    return urgent;
  }

  pickText() {
    const { lengths } = this.waveConfig;
    const taken = new Set(this.words.map((word) => word.text));
    const heads = new Set(this.words.filter((word) => word.typed === 0).map((word) => word.text[0]));
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const length = lengths[Math.floor(this.rng() * lengths.length)];
      const bank = this.pool[length] ?? [];
      const text = bank[Math.floor(this.rng() * bank.length)];
      if (!text || taken.has(text)) continue;
      // Two untouched words sharing a first letter make locking ambiguous.
      if (heads.has(text[0]) && attempt < 18) continue;
      return text;
    }
    const rest = Object.values(this.pool).flat().filter((text) => !taken.has(text));
    return rest[Math.floor(this.rng() * rest.length)] ?? "storm";
  }

  spawn() {
    const config = this.waveConfig;
    const kind = config.kinds[Math.floor(this.rng() * config.kinds.length)] ?? "drift";
    let text = this.pickText();
    if (kind === "heavy") {
      const longest = Math.max(...config.lengths);
      const bank = this.pool[longest] ?? [];
      const taken = new Set(this.words.map((word) => word.text));
      const pick = bank.filter((word) => !taken.has(word));
      if (pick.length) text = pick[Math.floor(this.rng() * pick.length)];
    }
    const word = {
      id: this.nextId,
      text,
      typed: 0,
      kind,
      bonus: kind === "heavy" ? 2 : 1,
      y: SPAWN_Y,
      x: EDGE_MIN + this.rng() * (EDGE_MAX - EDGE_MIN),
      vx: (this.rng() - 0.5) * 1.4,
      speed: config.speed,
    };
    if (kind === "swoop") {
      const fromLeft = this.rng() < 0.5;
      word.x = fromLeft ? EDGE_MIN : EDGE_MAX;
      word.vx = (fromLeft ? 1 : -1) * (5 + this.rng() * 5);
      word.speed = config.speed * 1.05;
    }
    if (kind === "heavy") word.speed = config.speed * 0.7;
    this.nextId += 1;
    this.pending = Math.max(0, this.pending - 1);
    this.words.push(word);
    return word;
  }

  /** Feed one physical keystroke. Returns what happened, for sound/FX. */
  key(char) {
    const letter = typeof char === "string" ? char.toLowerCase() : "";
    if (!/^[a-z]$/.test(letter)) return { result: "ignored", events: [] };
    if (this.status !== "playing") return { result: "ignored", events: [] };

    const target = this.target;
    if (target) {
      if (target.text[target.typed] === letter) return this.advance(target);
      return this.strike(letter);
    }
    const index = chooseTarget(this.words, letter);
    if (index < 0) return this.strike(letter);
    const word = this.words[index];
    this.targetId = word.id;
    const advanced = this.advance(word);
    if (advanced.result === "hit") return { ...advanced, result: "lock" };
    return advanced;
  }

  advance(word) {
    const events = [];
    word.typed += 1;
    this.hits += 1;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    let gained = LETTER_SCORE * this.multiplier;
    this.score += gained;

    if (this.combo % COMBO_LIFE_STEP === 0 && this.lives < MAX_LIVES) {
      this.lives += 1;
      this.message = `連擊 ${this.combo}！防線修復 +1`;
      events.push({ type: "bonus", lives: this.lives });
    }

    if (word.typed >= word.text.length) {
      this.words = this.words.filter((other) => other.id !== word.id);
      this.targetId = null;
      this.cleared += 1;
      const bonus = Math.round(word.text.length * CLEAR_SCORE_PER_LETTER * this.multiplier * word.bonus);
      this.score += bonus;
      gained += bonus;
      this.message = `擊破 ${word.text.toUpperCase()} +${bonus}`;
      events.push({ type: "clear", word });
      return { result: "clear", word, gained, events };
    }
    return { result: "hit", word, gained, events };
  }

  strike(letter) {
    const events = [];
    this.misses += 1;
    this.combo = 0;
    this.strikes += 1;
    let lifeLost = false;
    if (this.strikes >= STRIKES_PER_LIFE) {
      this.strikes = 0;
      lifeLost = true;
      this.damage(events, "漏打太多，城牆裂了");
    } else {
      this.message = `打錯 ${letter.toUpperCase()}，連擊中斷`;
    }
    events.push({ type: "miss", letter, lifeLost });
    return { result: "miss", letter, lifeLost, events };
  }

  damage(events, reason) {
    this.lives -= 1;
    this.message = reason;
    if (this.lives <= 0) {
      this.lives = 0;
      this.status = "lost";
      this.message = "防線失守——再來一次";
      events.push({ type: "lost" });
    }
  }

  /** Advance the storm by `dt` seconds. Returns events for sound/FX. */
  tick(dt = 1 / 60) {
    const events = [];
    if (this.status !== "playing" || !(dt > 0)) return events;
    this.elapsed += dt;

    if (this.breakTimer > 0) {
      this.breakTimer = Math.max(0, this.breakTimer - dt);
    } else {
      const config = this.waveConfig;
      this.spawnTimer -= dt;
      if (this.pending > 0 && this.spawnTimer <= 0 && this.words.length < config.maxAlive) {
        events.push({ type: "spawn", word: this.spawn() });
        this.spawnTimer = config.spawnEvery;
      }
    }

    for (const word of this.words) {
      word.y += word.speed * dt;
      word.x += word.vx * dt;
      if (word.x < EDGE_MIN) {
        word.x = EDGE_MIN;
        word.vx = Math.abs(word.vx);
      } else if (word.x > EDGE_MAX) {
        word.x = EDGE_MAX;
        word.vx = -Math.abs(word.vx);
      }
    }

    const breached = this.words.filter((word) => word.y >= FIELD_HEIGHT);
    if (breached.length) {
      this.words = this.words.filter((word) => word.y < FIELD_HEIGHT);
      for (const word of breached) {
        if (word.id === this.targetId) this.targetId = null;
        this.breaches += 1;
        this.combo = 0;
        events.push({ type: "breach", word });
        this.damage(events, `「${word.text.toUpperCase()}」撞上城市`);
      }
    }
    if (this.status !== "playing") return events;

    if (!this.words.length && this.pending === 0 && this.breakTimer === 0) {
      if (this.waveIndex >= this.waves.length - 1) {
        this.status = "won";
        this.message = "風暴散去，城市守住了！";
        events.push({ type: "won" });
      } else {
        this.waveIndex += 1;
        this.pending = this.waveConfig.count;
        this.breakTimer = WAVE_BREAK;
        this.spawnTimer = 0;
        this.message = `第 ${this.wave} 波：風速上升`;
        events.push({ type: "wave", wave: this.wave });
      }
    }
    return events;
  }

  /** Flat snapshot for the HUD (never returns live word objects). */
  summary() {
    const target = this.target;
    const attempts = this.hits + this.misses;
    return {
      status: this.status,
      outcome: this.outcome,
      wave: this.wave,
      waveCount: this.waves.length,
      lives: this.lives,
      maxLives: MAX_LIVES,
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      multiplier: this.multiplier,
      cleared: this.cleared,
      breaches: this.breaches,
      strikes: this.strikes,
      remaining: this.pending + this.words.length,
      alive: this.words.length,
      accuracy: attempts ? Math.round((this.hits / attempts) * 100) : 100,
      message: this.message,
      target: target ? { text: target.text, typed: target.typed } : null,
    };
  }
}

export function createGame(options) {
  return new TypestormGame(options);
}

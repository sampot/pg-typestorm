import { describe, expect, it } from "vitest";
import {
  chooseTarget,
  comboMultiplier,
  createGame,
  createRng,
  COMBO_LIFE_STEP,
  FIELD_HEIGHT,
  MAX_LIVES,
  START_LIVES,
  STRIKES_PER_LIFE,
  TypestormGame,
  WAVES,
  WORD_POOL,
} from "./game.js";

/** Deterministic single-wave setup so rules can be asserted without RNG noise. */
const soloWave = (overrides = {}) => [
  { count: 1, speed: 10, spawnEvery: 1, maxAlive: 3, lengths: [4], kinds: ["drift"], ...overrides },
];

/** Game with hand-placed words: no spawning, exact positions. */
function staged(texts, { waves, ...options } = {}) {
  const game = new TypestormGame({ waves: waves ?? soloWave({ count: 0 }), ...options });
  game.start();
  game.pending = 0;
  game.breakTimer = 999;
  game.words = texts.map((text, index) => ({
    id: index + 1,
    text,
    typed: 0,
    kind: "drift",
    bonus: 1,
    y: 20 + index * 10,
    x: 20 + index * 10,
    vx: 0,
    speed: 10,
  }));
  game.nextId = texts.length + 1;
  return game;
}

const typeWord = (game, text) => [...text].map((letter) => game.key(letter));

describe("word pool and wave table", () => {
  it("keys every word bank by its own word length", () => {
    for (const [length, bank] of Object.entries(WORD_POOL)) {
      expect(bank.length).toBeGreaterThan(5);
      for (const word of bank) {
        expect(word).toMatch(/^[a-z]+$/);
        expect(word).toHaveLength(Number(length));
      }
    }
  });

  it("ramps difficulty every wave", () => {
    for (let i = 1; i < WAVES.length; i += 1) {
      expect(WAVES[i].speed).toBeGreaterThan(WAVES[i - 1].speed);
      expect(WAVES[i].count).toBeGreaterThanOrEqual(WAVES[i - 1].count);
      expect(WAVES[i].spawnEvery).toBeLessThanOrEqual(WAVES[i - 1].spawnEvery);
    }
  });

  it("keeps the seeded RNG reproducible", () => {
    const a = createRng(99);
    const b = createRng(99);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("target locking", () => {
  it("locks the word whose first letter was typed", () => {
    const game = staged(["mist", "bolt"]);
    const outcome = game.key("b");
    expect(outcome.result).toBe("lock");
    expect(game.target.text).toBe("bolt");
    expect(game.target.typed).toBe(1);
  });

  it("prefers the most urgent word when two share a first letter", () => {
    const words = [
      { text: "tide", typed: 0, y: 30 },
      { text: "tea", typed: 0, y: 80 },
    ];
    expect(chooseTarget(words, "t")).toBe(1);
  });

  it("never locks a word that is already partly typed", () => {
    const words = [{ text: "mist", typed: 2, y: 90 }];
    expect(chooseTarget(words, "m")).toBe(-1);
  });

  it("returns -1 when no word starts with the letter", () => {
    expect(chooseTarget([{ text: "bolt", typed: 0, y: 10 }], "z")).toBe(-1);
  });

  it("stays locked on the target even if another word starts with the key", () => {
    const game = staged(["mist", "bolt"]);
    game.key("m");
    const outcome = game.key("b");
    expect(outcome.result).toBe("miss");
    expect(game.target.text).toBe("mist");
  });

  it("uppercase input is normalised to the same letter", () => {
    const game = staged(["bolt"]);
    expect(game.key("B").result).toBe("lock");
    expect(game.key("O").result).toBe("hit");
    expect(game.target.typed).toBe(2);
  });

  it("ignores non-letter keys without touching combo or lives", () => {
    const game = staged(["bolt"]);
    for (const key of ["Enter", "1", " ", "", null, undefined]) {
      expect(game.key(key).result).toBe("ignored");
    }
    expect(game.combo).toBe(0);
    expect(game.misses).toBe(0);
    expect(game.lives).toBe(START_LIVES);
  });

  it("ignores keys while paused and accepts them again after resume", () => {
    const game = staged(["bolt"]);
    game.pause();
    expect(game.key("b").result).toBe("ignored");
    game.resume();
    expect(game.key("b").result).toBe("lock");
  });
});

describe("typing letters", () => {
  it("advances letter by letter through the locked word", () => {
    const game = staged(["mist"]);
    const results = typeWord(game, "mis").map((outcome) => outcome.result);
    expect(results).toEqual(["lock", "hit", "hit"]);
    expect(game.hits).toBe(3);
  });

  it("scores every correct letter and clears the word on the last one", () => {
    const game = staged(["mist"]);
    const results = typeWord(game, "mist");
    expect(results.at(-1).result).toBe("clear");
    expect(game.words).toHaveLength(0);
    expect(game.target).toBeNull();
    expect(game.cleared).toBe(1);
    expect(game.score).toBe(4 * 10 + 4 * 25);
  });

  it("grows the combo and multiplier while typing correctly", () => {
    const game = staged(["blizzard", "downpour"]);
    typeWord(game, "blizzard");
    typeWord(game, "down");
    expect(game.combo).toBe(12);
    expect(game.bestCombo).toBe(12);
    expect(game.multiplier).toBe(2);
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(40)).toBe(5);
  });

  it("pays more for the same word at a higher multiplier", () => {
    const plain = staged(["mist"]);
    typeWord(plain, "mist");

    const hot = staged(["mist"]);
    hot.combo = 20;
    typeWord(hot, "mist");
    expect(hot.score).toBeGreaterThan(plain.score * 2);
  });

  it("doubles the clear bonus for heavy words", () => {
    const light = staged(["mist"]);
    typeWord(light, "mist");

    const heavy = staged(["mist"]);
    heavy.words[0].bonus = 2;
    typeWord(heavy, "mist");
    expect(heavy.score).toBe(4 * 10 + 4 * 25 * 2);
  });

  it("repairs one life on every combo milestone, up to the cap", () => {
    const game = staged(["blizzard", "downpour"]);
    game.lives = 2;
    typeWord(game, "blizzard");
    const milestone = typeWord(game, "down").at(-1);
    expect(game.combo).toBe(COMBO_LIFE_STEP);
    expect(game.lives).toBe(3);
    expect(milestone.events.some((event) => event.type === "bonus")).toBe(true);

    game.lives = MAX_LIVES;
    game.combo = COMBO_LIFE_STEP * 2 - 1;
    game.key("p");
    expect(game.lives).toBe(MAX_LIVES);
  });
});

describe("mistakes", () => {
  it("breaks the combo on a wrong letter but keeps the typed progress", () => {
    const game = staged(["mist"]);
    typeWord(game, "mi");
    const outcome = game.key("z");
    expect(outcome.result).toBe("miss");
    expect(game.combo).toBe(0);
    expect(game.misses).toBe(1);
    expect(game.target.typed).toBe(2);
  });

  it("costs a life once wrong keys pile up", () => {
    const game = staged(["mist"]);
    for (let i = 0; i < STRIKES_PER_LIFE - 1; i += 1) {
      expect(game.key("z").lifeLost).toBe(false);
    }
    const punished = game.key("z");
    expect(punished.lifeLost).toBe(true);
    expect(game.lives).toBe(START_LIVES - 1);
    expect(game.strikes).toBe(0);
  });

  it("reports a miss when no word matches the key at all", () => {
    const game = staged(["mist"]);
    expect(game.key("q").result).toBe("miss");
    expect(game.target).toBeNull();
  });

  it("tracks accuracy in the summary", () => {
    const game = staged(["mist"]);
    typeWord(game, "mis");
    game.key("z");
    expect(game.summary().accuracy).toBe(75);
  });
});

describe("the storm", () => {
  it("drops words toward the city over time", () => {
    const game = staged(["mist"]);
    const before = game.words[0].y;
    game.tick(0.5);
    expect(game.words[0].y).toBeCloseTo(before + 5, 5);
  });

  it("keeps swooping words inside the field", () => {
    const game = staged(["mist"]);
    game.words[0].vx = -80;
    game.tick(0.5);
    expect(game.words[0].x).toBeGreaterThanOrEqual(5);
    expect(game.words[0].vx).toBeGreaterThan(0);
  });

  it("does not move anything while paused", () => {
    const game = staged(["mist"]);
    game.pause();
    expect(game.tick(1)).toEqual([]);
    expect(game.words[0].y).toBe(20);
  });

  it("costs a life and the combo when a word reaches the city", () => {
    const game = staged(["mist"]);
    game.combo = 8;
    game.words[0].y = FIELD_HEIGHT - 1;
    const events = game.tick(1);
    expect(events.some((event) => event.type === "breach")).toBe(true);
    expect(game.lives).toBe(START_LIVES - 1);
    expect(game.combo).toBe(0);
    expect(game.words).toHaveLength(0);
    expect(game.breaches).toBe(1);
  });

  it("drops the lock when the locked word breaches", () => {
    const game = staged(["mist"]);
    game.key("m");
    game.words[0].y = FIELD_HEIGHT - 1;
    game.tick(1);
    expect(game.target).toBeNull();
    expect(game.targetId).toBeNull();
  });

  it("spawns words up to the wave's concurrency limit", () => {
    const game = new TypestormGame({ seed: 7, waves: soloWave({ count: 9, maxAlive: 2 }) }).start();
    for (let i = 0; i < 40; i += 1) game.tick(0.2);
    expect(game.words.length).toBeLessThanOrEqual(2);
    expect(game.words.length).toBeGreaterThan(0);
  });

  it("avoids duplicate words on screen", () => {
    const game = new TypestormGame({ seed: 4, waves: soloWave({ count: 12, maxAlive: 5, lengths: [3, 4, 5] }) }).start();
    for (let i = 0; i < 60; i += 1) game.tick(0.15);
    const texts = game.words.map((word) => word.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("waves, winning and losing", () => {
  it("advances to the next wave once the current one is cleared", () => {
    const game = staged(["mist"], { waves: [...soloWave({ count: 0 }), ...soloWave({ count: 3 })] });
    game.breakTimer = 0;
    typeWord(game, "mist");
    const events = game.tick(0.1);
    expect(events.some((event) => event.type === "wave")).toBe(true);
    expect(game.wave).toBe(2);
    expect(game.pending).toBe(3);
    expect(game.breakTimer).toBeGreaterThan(0);
  });

  it("wins after the final wave is cleared", () => {
    const game = staged(["mist"]);
    game.breakTimer = 0;
    typeWord(game, "mist");
    const events = game.tick(0.1);
    expect(events.some((event) => event.type === "won")).toBe(true);
    expect(game.outcome).toBe("won");
    expect(game.summary().status).toBe("won");
  });

  it("loses when the last life is gone and then freezes", () => {
    const game = staged(["mist"]);
    game.lives = 1;
    game.words[0].y = FIELD_HEIGHT;
    const events = game.tick(0.1);
    expect(events.some((event) => event.type === "lost")).toBe(true);
    expect(game.outcome).toBe("lost");
    expect(game.key("m").result).toBe("ignored");
    expect(game.tick(1)).toEqual([]);
  });

  it("loses through accumulated wrong keys alone", () => {
    const game = staged(["mist"]);
    game.lives = 1;
    for (let i = 0; i < STRIKES_PER_LIFE; i += 1) game.key("z");
    expect(game.outcome).toBe("lost");
    expect(game.lives).toBe(0);
  });

  it("survives a long autoplay run and always ends in a legal state", () => {
    const game = createGame({ seed: 31 }).start();
    for (let i = 0; i < 8000 && game.outcome === "playing"; i += 1) {
      const target = game.target ?? game.urgent;
      if (target) game.key(target.text[target.typed] ?? "z");
      else game.tick(1 / 60);
    }
    expect(["playing", "won", "lost"]).toContain(game.outcome);
    expect(game.summary().score).toBeGreaterThan(0);
    expect(Number.isFinite(game.summary().score)).toBe(true);
  });

  it("restarts cleanly", () => {
    const game = createGame({ seed: 5 }).start();
    game.score = 900;
    game.lives = 1;
    game.start();
    expect(game.score).toBe(0);
    expect(game.lives).toBe(START_LIVES);
    expect(game.wave).toBe(1);
    expect(game.words).toHaveLength(0);
    expect(game.outcome).toBe("playing");
  });

  it("summarises everything the HUD needs", () => {
    const game = staged(["mist"]);
    game.key("m");
    const summary = game.summary();
    expect(summary).toMatchObject({
      status: "playing",
      wave: 1,
      lives: START_LIVES,
      maxLives: MAX_LIVES,
      combo: 1,
      multiplier: 1,
      target: { text: "mist", typed: 1 },
    });
    expect(typeof summary.message).toBe("string");
    expect(summary.remaining).toBe(1);
  });
});

/**
 * Shell for 字幕風暴: keyboard input, DOM words over a canvas storm, sound,
 * and high-score persistence. All game rules live in game.js.
 */

import { COMBO_LIFE_STEP, MAX_LIVES, TypestormGame } from "./game.js";
import { GameAudio } from "./audio.js";
import { loadProgress, mergeProgress, saveProgress } from "./persist.js";

const $ = (selector) => document.querySelector(selector);
const el = {
  stage: $("#stage"),
  canvas: $("#storm"),
  field: $("#field"),
  overlay: $("#overlay"),
  overlayEyebrow: $("#overlay-eyebrow"),
  overlayTitle: $("#overlay-title"),
  overlayBody: $("#overlay-body"),
  overlayStats: $("#overlay-stats"),
  overlayFoot: $("#overlay-foot"),
  primary: $("#primary"),
  secondary: $("#secondary"),
  status: $("#status"),
  focus: $("#focus"),
  focusWord: $("#focus-word"),
  assistRow: $("#assist-row"),
  keyboard: $("#keyboard"),
  assistToggle: $("#assist-toggle"),
  wave: $("#hud-wave"),
  lives: $("#hud-lives"),
  score: $("#hud-score"),
  combo: $("#hud-combo"),
  best: $("#hud-best"),
  comboFill: $("#combo-fill"),
  pause: $("#pause"),
  sound: $("#sound"),
  help: $("#help"),
  sheet: $("#sheet"),
  sheetClose: $("#sheet-close"),
  banner: $("#banner"),
};

const game = new TypestormGame({ seed: Date.now() % 100000 });
const audio = new GameAudio();
const ctx = el.canvas.getContext("2d");

let progress = null;
let overlayKind = "idle";
let stageWidth = 0;
let stageHeight = 0;

// ── canvas storm ───────────────────────────────────────────────────

const sprite = (src) => {
  const image = new Image();
  image.src = src;
  return image;
};
const sparkSprite = sprite("./assets/images/spark.png");
const glowSprite = sprite("./assets/images/glow.png");

const rain = Array.from({ length: 90 }, () => ({
  x: Math.random(),
  y: Math.random(),
  length: 0.03 + Math.random() * 0.07,
  speed: 0.35 + Math.random() * 0.65,
}));

/** Fixed skyline so the defended city stays recognisable between runs. */
const skyline = (() => {
  const towers = [];
  let x = -0.02;
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  while (x < 1.02) {
    const width = 0.05 + next() * 0.08;
    towers.push({ x, width, height: 0.06 + next() * 0.13, lit: next() });
    x += width + 0.004;
  }
  return towers;
})();

const particles = [];

function resizeCanvas() {
  const rect = el.stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  stageWidth = rect.width;
  stageHeight = rect.height;
  el.canvas.width = Math.max(1, Math.round(rect.width * dpr));
  el.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function burst(word, color = "#6fe3ff") {
  const x = (word.x / 100) * stageWidth;
  const y = (word.y / 100) * stageHeight;
  for (let i = 0; i < 18; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 190;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.5 + Math.random() * 0.4,
      age: 0,
      size: 10 + Math.random() * 22,
      color,
    });
  }
}

function drawStorm(dt) {
  ctx.clearRect(0, 0, stageWidth, stageHeight);
  const intensity = 0.6 + game.waveIndex * 0.16;

  ctx.save();
  ctx.strokeStyle = "rgba(150, 200, 255, 0.2)";
  ctx.lineWidth = 1;
  for (const drop of rain) {
    drop.y += drop.speed * intensity * dt;
    drop.x += 0.03 * dt;
    if (drop.y > 1.1) {
      drop.y = -0.1;
      drop.x = Math.random();
    }
    const x = drop.x * stageWidth;
    const y = drop.y * stageHeight;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4, y + drop.length * stageHeight);
    ctx.stroke();
  }
  ctx.restore();

  // Warning line: words below it are about to hit the city.
  const alarm = game.lives <= 1 ? 0.5 : 0.24;
  ctx.save();
  ctx.strokeStyle = `rgba(255, 107, 129, ${alarm})`;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(0, stageHeight * 0.84);
  ctx.lineTo(stageWidth, stageHeight * 0.84);
  ctx.stroke();
  ctx.restore();

  // City silhouette; window lights go out as the city takes damage.
  const healthy = game.lives / MAX_LIVES;
  for (const tower of skyline) {
    const w = tower.width * stageWidth;
    const h = tower.height * stageHeight;
    const x = tower.x * stageWidth;
    const y = stageHeight - h;
    ctx.fillStyle = "#050d1c";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(111, 227, 255, 0.28)";
    ctx.fillRect(x, y, w, 1.5);
    const alive = tower.lit < healthy;
    ctx.fillStyle = alive ? "rgba(255, 209, 102, 0.8)" : "rgba(255, 107, 129, 0.4)";
    let row = 0;
    for (let wy = y + 7; wy < stageHeight - 5; wy += 11) {
      let column = 0;
      for (let wx = x + 5; wx < x + w - 6; wx += 10) {
        if ((row + column) % 3 !== 2) ctx.fillRect(wx, wy, 3.5, 5);
        column += 1;
      }
      row += 1;
    }
  }
  ctx.fillStyle = "rgba(111, 227, 255, 0.4)";
  ctx.fillRect(0, stageHeight - 2, stageWidth, 2);

  // Glow behind the locked word so the eye finds it instantly.
  const target = game.target;
  if (target && glowSprite.complete) {
    const size = Math.max(stageWidth, stageHeight) * 0.34;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.4;
    ctx.drawImage(
      glowSprite,
      (target.x / 100) * stageWidth - size / 2,
      (target.y / 100) * stageHeight - size / 2,
      size,
      size,
    );
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 260 * dt;
    const fade = 1 - p.age / p.life;
    ctx.globalAlpha = fade;
    if (sparkSprite.complete) {
      ctx.drawImage(sparkSprite, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
  }
  ctx.restore();
}

// ── falling words (DOM) ────────────────────────────────────────────

const wordNodes = new Map();

function wordNode(word) {
  const node = document.createElement("span");
  node.className = "word";
  node.dataset.kind = word.kind;
  node.innerHTML = '<b class="done"></b><i class="next"></i><em class="rest"></em>';
  el.field.append(node);
  wordNodes.set(word.id, node);
  return node;
}

function syncWords() {
  const seen = new Set();
  for (const word of game.words) {
    seen.add(word.id);
    const node = wordNodes.get(word.id) ?? wordNode(word);
    node.style.left = `${word.x}%`;
    node.style.top = `${word.y}%`;
    if (node.dataset.typed !== String(word.typed)) {
      node.dataset.typed = String(word.typed);
      node.children[0].textContent = word.text.slice(0, word.typed);
      node.children[1].textContent = word.text[word.typed] ?? "";
      node.children[2].textContent = word.text.slice(word.typed + 1);
    }
    node.classList.toggle("locked", word.id === game.targetId);
    node.classList.toggle("danger", word.y > 80);
  }
  for (const [id, node] of wordNodes) {
    if (!seen.has(id)) {
      node.remove();
      wordNodes.delete(id);
    }
  }
}

function clearWords() {
  for (const node of wordNodes.values()) node.remove();
  wordNodes.clear();
  particles.length = 0;
}

// ── hud, focus strip, assist row ───────────────────────────────────

const shown = {};

function setText(node, key, value) {
  if (shown[key] === value) return;
  shown[key] = value;
  node.textContent = value;
}

function syncHud() {
  const view = game.summary();
  setText(el.wave, "wave", `${view.wave}/${view.waveCount}`);
  setText(el.score, "score", String(view.score));
  setText(el.combo, "combo", view.combo ? `${view.combo} ×${view.multiplier}` : "0");
  setText(el.best, "best", String(Math.max(progress?.best ?? 0, view.score)));
  if (shown.lives !== `${view.lives}`) {
    shown.lives = `${view.lives}`;
    el.lives.innerHTML = `${"♥".repeat(view.lives)}<span class="spent">${"♥".repeat(
      Math.max(0, MAX_LIVES - view.lives),
    )}</span>`;
  }
  el.comboFill.style.width = `${((view.combo % COMBO_LIFE_STEP) / COMBO_LIFE_STEP) * 100}%`;
  setText(el.status, "status", view.message);

  const target = game.target;
  const signature = target ? `${target.text}:${target.typed}` : "";
  if (shown.focus !== signature) {
    shown.focus = signature;
    el.focusWord.innerHTML = target
      ? `<span class="done">${target.text.slice(0, target.typed)}</span>` +
        `<span class="next">${target.text[target.typed] ?? ""}</span>` +
        `<span class="rest">${target.text.slice(target.typed + 1)}</span>`
      : '<span class="focus-empty">尚未鎖定 · 打字首鎖定</span>';
  }
  syncAssist();
}

function assistLetters() {
  const target = game.target;
  if (target) return [target.text[target.typed]];
  return [
    ...new Set(
      [...game.words]
        .sort((a, b) => b.y - a.y)
        .slice(0, 7)
        .map((word) => word.text[0]),
    ),
  ];
}

function syncAssist() {
  const letters = assistLetters();
  const signature = `${game.status}:${game.target ? "lock" : "open"}:${letters.join("")}`;
  if (shown.assist === signature) return;
  shown.assist = signature;
  el.assistRow.innerHTML = "";
  if (!letters.length) {
    const hint = document.createElement("span");
    hint.className = "assist-empty";
    hint.textContent = game.status === "playing" ? "風暴集結中…" : "按開始防守";
    el.assistRow.append(hint);
    return;
  }
  for (const letter of letters) {
    el.assistRow.append(assistButton(letter, game.target != null));
  }
}

function assistButton(letter, hot) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = hot ? "assist-key hot" : "assist-key";
  button.textContent = letter;
  button.dataset.letter = letter;
  return button;
}

function buildKeyboard() {
  for (const row of ["qwertyuiop", "asdfghjkl", "zxcvbnm"]) {
    for (const letter of row) el.keyboard.append(assistButton(letter, false));
  }
}

// ── overlay ────────────────────────────────────────────────────────

const OVERLAY = {
  idle: {
    eyebrow: "READY",
    title: "守住城市",
    body: "英文短詞會從天上落下。用鍵盤打出某個詞的<strong>第一個字母</strong>就會鎖定它，接著把它打完就能擊破。六波全清就贏。",
    primary: "開始防守",
    secondary: null,
    foot: "按 Enter 開始 · Esc 暫停",
  },
  paused: {
    eyebrow: "PAUSED",
    title: "風暴暫停",
    body: "回到鍵盤就繼續。",
    primary: "繼續",
    secondary: "重新開始",
    foot: "按 Esc 或 Enter 繼續",
  },
  won: {
    eyebrow: "CITY SAVED",
    title: "風暴散去了",
    body: "六波全清，城市守住。",
    primary: "再來一次",
    secondary: null,
    foot: "按 Enter 再玩一場",
  },
  lost: {
    eyebrow: "BREACHED",
    title: "防線失守",
    body: "字幕壓進城市了。再守一次？",
    primary: "再來一次",
    secondary: null,
    foot: "按 Enter 再玩一場",
  },
};

function showOverlay(kind) {
  overlayKind = kind;
  const config = OVERLAY[kind];
  el.overlayEyebrow.textContent = config.eyebrow;
  el.overlayTitle.textContent = config.title;
  el.overlayBody.innerHTML = config.body;
  el.overlayFoot.textContent = config.foot;
  el.primary.textContent = config.primary;
  el.secondary.hidden = !config.secondary;
  if (config.secondary) el.secondary.textContent = config.secondary;

  const showStats = kind === "won" || kind === "lost";
  el.overlayStats.hidden = !showStats;
  if (showStats) {
    const view = game.summary();
    el.overlayStats.innerHTML = [
      ["分數", view.score],
      ["最佳", Math.max(progress?.best ?? 0, view.score)],
      ["最高連擊", view.bestCombo],
      ["擊破", view.cleared],
      ["準確率", `${view.accuracy}%`],
      ["抵達波次", `${view.wave}/${view.waveCount}`],
    ]
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join("");
  }
  el.overlay.hidden = false;
  el.primary.focus({ preventScroll: true });
}

function hideOverlay() {
  el.overlay.hidden = true;
}

// ── run control ────────────────────────────────────────────────────

function startRun() {
  game.start();
  clearWords();
  Object.keys(shown).forEach((key) => delete shown[key]);
  hideOverlay();
  el.pause.hidden = false;
  void audio.startMusic();
  showBanner("第 1 波");
  syncHud();
}

function togglePause() {
  if (game.status === "playing") {
    game.pause();
    showOverlay("paused");
  } else if (game.status === "paused") {
    game.resume();
    hideOverlay();
  }
}

async function finishRun() {
  el.pause.hidden = true;
  const view = game.summary();
  audio.play(view.status === "won" ? "win" : "lose");
  if (view.status === "lost") audio.stopMusic();
  progress = mergeProgress(progress, {
    score: view.score,
    bestCombo: view.bestCombo,
    wave: view.wave,
    outcome: view.status,
  });
  showOverlay(view.status);
  syncHud();
  await saveProgress(progress);
}

let bannerTimer = 0;

function showBanner(text) {
  el.banner.textContent = text;
  el.banner.hidden = false;
  el.banner.style.animation = "none";
  void el.banner.offsetWidth;
  el.banner.style.animation = "";
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    el.banner.hidden = true;
  }, 1200);
}

function hurt() {
  el.stage.classList.remove("hurt", "shake");
  void el.stage.offsetWidth;
  el.stage.classList.add("hurt", "shake");
}

function flashWrong() {
  el.focus.classList.remove("wrong");
  void el.focus.offsetWidth;
  el.focus.classList.add("wrong");
}

function handleEvents(events) {
  for (const event of events) {
    if (event.type === "bonus") audio.play("bonus");
    else if (event.type === "breach") {
      burst(event.word, "#ff6b81");
      audio.play("breach");
      hurt();
    } else if (event.type === "miss" && event.lifeLost) hurt();
    else if (event.type === "wave") {
      audio.play("wave");
      showBanner(`第 ${event.wave} 波`);
    }
    else if (event.type === "won" || event.type === "lost") void finishRun();
  }
}

function typeLetter(letter) {
  const outcome = game.key(letter);
  if (outcome.result === "ignored") return;
  if (outcome.result === "miss") {
    audio.play("error", { rate: 0.95 });
    flashWrong();
  } else if (outcome.result === "lock") {
    audio.play("lock");
  } else if (outcome.result === "hit") {
    audio.play("key", { rate: 1 + Math.min(0.5, game.combo * 0.015) });
  } else if (outcome.result === "clear") {
    audio.play("burst");
    burst(outcome.word, "#6fe3ff");
  }
  handleEvents(outcome.events);
}

// ── input ──────────────────────────────────────────────────────────

el.primary.addEventListener("click", () => {
  if (overlayKind === "paused") togglePause();
  else startRun();
});
el.secondary.addEventListener("click", startRun);
el.pause.addEventListener("click", togglePause);

el.sound.addEventListener("click", async () => {
  const on = audio.setEnabled(el.sound.getAttribute("aria-pressed") !== "true");
  el.sound.setAttribute("aria-pressed", String(on));
  el.sound.textContent = on ? "音效 開" : "音效 關";
  if (on && game.status === "playing") await audio.startMusic();
  if (progress) await saveProgress({ ...progress, sound: on });
});

el.help.addEventListener("click", () => {
  if (game.status === "playing") togglePause();
  el.sheet.hidden = false;
  el.sheetClose.focus({ preventScroll: true });
});
el.sheetClose.addEventListener("click", () => {
  el.sheet.hidden = true;
  el.help.focus({ preventScroll: true });
});

el.assistToggle.addEventListener("click", () => {
  const open = el.keyboard.hidden;
  el.keyboard.hidden = !open;
  el.assistToggle.setAttribute("aria-pressed", String(open));
});

for (const host of [el.assistRow, el.keyboard]) {
  host.addEventListener("click", (event) => {
    const letter = event.target.closest("[data-letter]")?.dataset.letter;
    if (letter) typeLetter(letter);
  });
}

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (!el.sheet.hidden) {
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      el.sheetClose.click();
    }
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    togglePause();
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    if (!el.overlay.hidden) {
      event.preventDefault();
      el.primary.click();
    }
    return;
  }
  if (/^[a-zA-Z]$/.test(event.key)) {
    event.preventDefault();
    typeLetter(event.key);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.status === "playing") togglePause();
});

// ── loop ───────────────────────────────────────────────────────────

let previous = performance.now();

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
  previous = now;
  if (game.status === "playing") handleEvents(game.tick(dt));
  drawStorm(dt);
  syncWords();
  syncHud();
  requestAnimationFrame(frame);
}

new ResizeObserver(resizeCanvas).observe(el.stage);
resizeCanvas();
buildKeyboard();
showOverlay("idle");
syncHud();
requestAnimationFrame(frame);

progress = await loadProgress();
if (progress.sound === false) {
  audio.setEnabled(false);
  el.sound.setAttribute("aria-pressed", "false");
  el.sound.textContent = "音效 關";
}
delete shown.best;
syncHud();

/**
 * High-score persistence through the Playgrounds host KV API.
 * The UI never touches localStorage as an authority — `/api/kv/…` is.
 */

export const PROGRESS_KEY = "/api/kv/pg-typestorm:progress";

export const EMPTY_PROGRESS = {
  best: 0,
  bestCombo: 0,
  bestWave: 1,
  plays: 0,
  wins: 0,
  sound: true,
  updatedAt: null,
};

/** Fold one finished run into the stored record. Pure, so it is testable. */
export function mergeProgress(previous, run = {}, now = new Date()) {
  const base = { ...EMPTY_PROGRESS, ...(previous ?? {}) };
  return {
    ...base,
    best: Math.max(base.best, Number(run.score) || 0),
    bestCombo: Math.max(base.bestCombo, Number(run.bestCombo) || 0),
    bestWave: Math.max(base.bestWave, Number(run.wave) || 1),
    plays: base.plays + 1,
    wins: base.wins + (run.outcome === "won" ? 1 : 0),
    updatedAt: now.toISOString(),
  };
}

export async function loadProgress(fetcher = fetch) {
  try {
    const response = await fetcher(PROGRESS_KEY);
    if (!response?.ok) return { ...EMPTY_PROGRESS };
    const text = await response.text();
    if (!text) return { ...EMPTY_PROGRESS };
    return { ...EMPTY_PROGRESS, ...JSON.parse(text) };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

export async function saveProgress(progress, fetcher = fetch) {
  try {
    await fetcher(PROGRESS_KEY, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(progress),
    });
  } catch {
    // Offline or host-less (opened as a plain file): keep playing regardless.
  }
  return progress;
}

# Attribution（pg-typestorm 字幕風暴）

本專案慣例：**即使授權不要求署名（CC0）也署名**。以下素材皆已核授權，並已複製進本 repo（不 runtime 依賴外部路徑）。

## 字型（畫面主字體）

- **俐方體11號 / Cubic 11** v1.500 — ACh-K，SIL Open Font License 1.1
  <https://github.com/ACh-K/Cubic-11>
  檔案：`assets/fonts/Cubic_11.woff2`；授權：`assets/licenses/cubic-11-OFL.txt`、來源：`assets/licenses/cubic-11-SOURCE.txt`
  （基於 M⁺ BITMAP FONTS 的 M⁺ gothic 12r，同為 OFL 1.1。保留名稱：Cubic／俐方體。）

## 音效（打字、擊破、失守、過波、勝敗）

- **The Essential Retro Video Game Sound Effects Collection [512 sounds]** — Juhani Junkala，CC0 1.0
  <https://opengameart.org/content/512-sound-effects-8-bit-style>
  授權：`assets/licenses/oga-512-8bit-sfx-LICENSE.txt`
  轉為 Ogg Vorbis 後使用：
  | 遊戲事件 | 檔案 | 原始素材 |
  | --- | --- | --- |
  | 打對字母 | `assets/audio/key.ogg` | `Simple Bleeps/sfx_sounds_Blip3.wav` |
  | 鎖定目標 | `assets/audio/lock.ogg` | `Simple Bleeps/sfx_sounds_Blip8.wav` |
  | 擊破詞 | `assets/audio/burst.ogg` | `Explosions/Shortest/sfx_exp_shortest_soft2.wav` |
  | 打錯字母 | `assets/audio/error.ogg` | `Negative Sounds/sfx_sounds_error2.wav` |
  | 城市受損 | `assets/audio/breach.ogg` | `Negative Sounds/sfx_sounds_damage2.wav` |
  | 連擊修復 | `assets/audio/bonus.ogg` | `Positive Sounds/sfx_sounds_powerup1.wav` |
  | 過波 | `assets/audio/wave.ogg` | `Positive Sounds/sfx_sounds_powerup10.wav` |
  | 勝利 | `assets/audio/win.ogg` | `Fanfares/sfx_sounds_fanfare3.wav` |
  | 失敗 | `assets/audio/lose.ogg` | `Negative Sounds/sfx_sounds_negative1.wav` |

## 音樂（背景循環）

- **BLIPPY BITS** — Dylann Taylor，CC0 1.0
  <https://dylanntaylor.itch.io/blippy-bits>
  檔案：`assets/audio/music.ogg`；授權：`assets/licenses/blippy-bits.txt`

## 美術（粒子）

- **Particle Pack** — Kenney (kenney.nl)，CC0 1.0
  <https://kenney.nl/assets/particle-pack>
  檔案：`assets/images/spark.png`（原 `star_08.png`，擊破火花）、`assets/images/glow.png`（原 `light_01.png`，鎖定光暈）
  授權：`assets/licenses/kenney-particle-pack.txt`

## 程式繪製

雨絲、城市天際線、警戒線與窗光皆由 `app.js` 以 Canvas 2D 程式繪製，無外部素材。

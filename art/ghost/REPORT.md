# Ghost Sprite Draft Report (Starfall)

## What was made & method

I built a complete first draft of the ghost companion sprite using a deterministic Python + NumPy + Pillow pixel-art rig under `art/ghost/src/`:

- [`art/ghost/src/palette.py`](src/palette.py): 8-colour single cool ramp (`#F4FFFF`, `#C4FAFF`, `#7CEAF8`, `#4AC6E0`, `#2E96BE`, `#1F6294`, `#163A6A`, `#0D1D3C`) strictly in the cyan–teal–indigo hue family (zero red, orange, or yellow/gold; `B >= G >= R` on every pixel so game tinting for the three AI skill tiers works cleanly). Alpha is strictly quantised to four discrete steps: `0`, `77` (30%), `153` (60%), and `255` (100%)—no airbrush gradients.
- [`art/ghost/src/ghost_rig.py`](src/ghost_rig.py): modular pixel-art character renderer designed as a lighter, smaller spectral echo of `public/assets/player/rig/astronaut.png` (rounded helmet with rear crest and circular ear-cup, large glowing cyan visor with curved white specular, collar ring, compact torso with glowing chest bar and mini spectral pack echo, articulated stubby arms, and a single tapering travelling-S wispy tail with 60%/30% translucency and shedding motes). Crisp 1px dark-indigo outline on the solid upper body softens to 60% mid-indigo on the mid-tail and disappears on the 30% wispy tips.
- [`art/ghost/src/build.py`](src/build.py): rebuilds all exports and previews in one command (`python3 art/ghost/src/build.py`) and prints automated audit metrics.

### Delivered files (all strictly under `art/ghost/`)

| Path | Description |
|---|---|
| `art/ghost/export/ghost.png` | `768 x 480` RGBA sprite sheet (8 cols × 5 rows of `96 x 96` cells; unused cells strictly transparent) |
| `art/ghost/export/ghost.json` | Row order, animation names, frame counts, durations in ms, loop flags, cell dimensions, and anchor `(54, 44)` |
| `art/ghost/previews/ghost_float.gif` | 4× nearest-neighbour (`384 x 384`) on `#141020`, 8 frames @ 110 ms, loops |
| `art/ghost/previews/ghost_rise.gif` | 4× nearest-neighbour (`384 x 384`) on `#141020`, 4 frames @ 90 ms, loops |
| `art/ghost/previews/ghost_fall.gif` | 4× nearest-neighbour (`384 x 384`) on `#141020`, 4 frames @ 90 ms, loops |
| `art/ghost/previews/ghost_pop.gif` | 4× nearest-neighbour (`384 x 384`) on `#141020`, 6 frames @ 70 ms, plays once |
| `art/ghost/previews/ghost_appear.gif` | 4× nearest-neighbour (`384 x 384`) on `#141020`, 6 frames @ 70 ms, plays once |
| `art/ghost/previews/ghost_in_scene.gif` | `480 x 300` crop of `alien_background.png` over `#141020`, 16 frames @ 110 ms (2 `float` cycles), half-size smoothed ghost (`48 x 48`) at 60% opacity drifting ±6 px vertically ~90 px right of half-size astronaut frame 0 |
| `art/ghost/previews/sheet_4x.png` | `3072 x 1920` full sheet at 4× on `#141020` with thin 1px cell grid |

---

## Per-animation status & frame-difference verification

Every animation was verified both **programmatically** (adjacent-frame RGBA pixel differences, silhouette XOR pixel counts, rigid-shift-invariant silhouette XOR for `float`, and helmet+torso mass centroids) and **visually** (inspecting `sheet_4x.png`, zoomed 4× frame montages, and extracted frames of `ghost_in_scene.gif` across three iteration passes).

| Row | Animation | Status | Frames / Timing | Helmet+torso centroid `(x, y)` | Adj. RGBA diff (px) | Adj. silhouette XOR (px) | Notes on frame variation |
|---|---|---|---|---|---|---|---|
| 0 | `float` | Finished | 8 @ 110 ms, loop | `x: 53.9–54.1`, `y: 42.0–45.1` | 504–1024 | 180–293 (**180–242** after optimal rigid `(dx, dy)` shift) | Genuine silhouette morph on every frame: phase-propagating S-wave tail, 3 px vertical bob, subtle pitch/nod breathing, opposing stubby-arm paddle, visor glow pulse, hologram scanline blink/flicker on f5, recovery sparkle on f6. |
| 1 | `rise` | Finished | 4 @ 90 ms, loop | `x: 54.5–54.6`, `y: 41.0–43.5` | 784–1016 | 276–362 | Distinct leaned-back silhouette (`-14.5°` to `-18.5°`), tail whipping steeply downward in a 4-frame travelling wave, cycling cyan-white thrust sparks and mini puffs underneath. |
| 2 | `fall` | Finished | 4 @ 90 ms, loop | `x: 53.2–53.4`, `y: 43.9–45.8` | 781–867 | 268–312 | Distinct tipped-forward silhouette (`+14.5°` to `+18.0°`), tail streaming upward and fluttering, both stubby arms lifted clearly in open space with drifting air wisps. |
| 3 | `pop` | Finished | 6 @ 70 ms, once | `f0: (52.1, 42.8)` → `f5: 6 px` | 108–1671 | 108–1259 | Startled recoil + shock lines (f0) → bright glowing bubble swell (f1) → comic asymmetrical cloud-wisp pop + stars (f2) → dispersing tapered wisps (f3) → faint 30% curls (f4) → nearly empty 6 fading pixels (f5). |
| 4 | `appear` | Finished | 6 @ 70 ms, once | `f3–f5: x=54.0–54.1` | 654–1461 | 166–899 | Sparse scanlines + converging sparks (f0) → sliced 1-in-3 row hologram (f1) → banded glitchy hologram (f2) → vertical snap-in stretch + clearing scanlines (f3) → slight settle overshoot + final scan glint (f4) → exact `float` frame 0 (f5). |

---

## Honest judgement: does it feel alive, and what is weakest?

**Does it feel alive?**
Yes—especially `float`, `rise`, and `fall`. In `float`, the travelling S-wave tail genuinely ripples backward rather than sliding rigidly (at least 180 silhouette pixels change between every consecutive pair even after factoring out vertical bob), the stubby arms gently counter-paddle, the visor breathes in brightness, and the frame-5 hologram blink/flicker breaks mechanical repetition and immediately sells the "hologram of a test pilot" identity. In `ghost_in_scene.gif`, it reads as a light, friendly, curious little companion ahead of the astronaut—clearly smaller (~half height), clearly translucent, and bright enough to remain legible over the dark violet alien mountains at 60% opacity.

**What is weakest?**
1. **`pop` f2 → f3 shape continuity:** Frame 2 bursts into soft, round comic puffs while frame 3 transitions to sleeker radial tapered streaks. At 70 ms per frame it reads as a harmless, comic pop, but a more gradual stretch from puffy clouds into curly wisps would make the dissipation feel smoother.
2. **Procedural pixel-edge polish on tilted poses:** Because the sprite is rasterised from geometric primitives (rotated ellipses/capsules + distance-field tail + cel-shading + outline pass) rather than hand-cleaned pixel-by-pixel in Aseprite, a few diagonal seams (particularly where the rotated collar meets the shoulder/pack in `rise` and `fall`) have minor 1px stair-step roughness when inspected at 4×.
3. **`rise` sparks at half game scale:** The spectral thrust sparks underneath `rise` read clearly at 4×, though at half game size (`48 x 48`) with 60% opacity they shrink to subtle 1–2 px glints—fine for a light apparition, but less punchy than a dedicated particle emitter.
4. **4-frame loop crispness on `rise` and `fall`:** Four frames at 90 ms gives an energetic whip, though the tail wave has slightly larger per-frame jumps than the smoother 8-frame `float` loop.

---

## Brief compliance check

- **Sheet size & grid:** Exact match (`768 x 480`, 8×5 grid of `96 x 96` cells, zero padding/trimming, unused cells strictly alpha `0`).
- **Visual centre `(54, 44)`:** Exact match on neutral `float` (`54.1, 44.1` on frame 0; `53.9–54.1` horizontally and `42.0–45.1` vertically across the 3 px bob; `rise`/`fall` stay within ±1 px horizontally and ±3 px vertically due to intentional lean/bob).
- **Row order, frame counts, timings, looping:** Exact match in both `ghost.png`, `ghost.json`, and all 5 preview GIFs.
- **Colour & alpha rules:** Exact match—8 cool cyan-to-indigo RGB colours, zero red/orange/gold, strictly 4 discrete alpha steps (`0, 77, 153, 255`).
- **One minor integration note on `appear`:** `appear` frame 5 matches `float` frame 0 identically (as requested: "into the first `float` frame"). When transitioning directly from `appear` to `float` in-game, starting `float` on frame 1 avoids holding that exact pose for `70 + 110 = 180 ms`.
- **Workspace rules:** Only files under `art/ghost/` were created or written; nothing in `src/`, `public/`, or other parts of `art/` was modified, and no git commit/push was performed.

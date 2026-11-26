# Astronaut rig pilot: report

Aseprite AI Artist plugin 0.8.4, live mode, with Aseprite 1.3.18.6. Work ran from 2026-11-25 19:45 to 20:12 CST.

## Files

| Path | What |
|---|---|
| `art/player/astronaut.aseprite` | Layered rig source with both tags and the pivot slice. Saved; `validate` passes. |
| `art/player/export/astronaut.png` + `.json` | Sprite sheet (14 frames in one row, 1344x176) and JSON atlas with frame tags, durations and the `torso_pivot` slice. Flame layer hidden. |
| `art/player/export/astronaut_flame.png` + `.json` | Flame layer only, on the same 14-frame grid. Frames 9–14 are empty. |
| `art/player/previews/compare.png` | The plugin's `look op="compare"` output, saved as is. Reference frame 07 (scaled to 144/170) is on the left, the new base pose on the right, both at 5x. |
| `art/player/previews/thrust.gif`, `fall.gif` | **Assembled outside the plugin** (see the GIF section below). |

## Spec

- **Canvas:** 96x176, RGB. The reference is scaled by 144/170, so an upright figure would be 144 px tall. The flying base pose measures about 69x139.
- **Palette:** 18 colours plus transparent, taken from the reference frames and locked. Nothing went off-palette.
  - Outline: `#0d0a12`.
  - Suit, 5 steps: `#17131d #211c28 #2c2733 #3a3443 #4e4659`.
  - Trim, 4 steps: `#3a2953 #5c3f82 #8862bd #b78ae0`.
  - Visor, 5 steps: `#1d5573 #3896b9 #5ec6dc #93e4f0 #e8fcff`.
  - Flame: `#b9e3f3 #7fb8d8 #5b7fb0`.
- **Layers, bottom to top:** `flame`, `leg-far`, `arm-far`, `jetpack`, `leg-near`, `torso`, `helmet`, `visor`, `arm-near`.
- **Torso pivot:** canvas **(56, 72)**. It is stored as slice `torso_pivot`: bounds x37 y42 w39 h62, pivot (19, 30) relative to the bounds. It is exported in both atlases.
  - The torso, helmet, visor and jetpack cels sit at (0, 0) in all 14 frames, so the body never drifts.
- **`thrust`:** frames 1–8, forward, looping.
  - Durations: 100, 83, 83, 100, 100, 83, 83, 100 ms (732 ms total).
  - Limbs move with `cel oscillate` on 8-frame periods, near and far sides in opposite phase. Arms move ±1 px, near leg ±2/±1 px, far leg ±1 px.
  - Four flame shapes (short, medium, long, bent) play in an irregular order: medium, long, bent, short, medium, long, short, bent.
- **`fall`:** frames 9–14, forward, looping.
  - Durations: 150, 133, 117, 150, 133, 117 ms (800 ms total).
  - The jetpack is off and the flame layer is empty.
  - Limbs are moved up and out from the thrust pose: near arm (-2, -2), far arm (+2, -3), near leg (-2, -3), far leg (+1, -2). On top of that, a ±1 px drift runs on a 6-frame period with staggered phases.
- **Limbs:** in both tags they move only by moving cels. No limb or body part is redrawn per frame. Only the flame, which is an effect, is drawn per frame.

## Decision made on the owner's behalf

The base pose follows the reference's **flying** pose (frame 07), not the upright one. Both required animations happen in flight, and they had to share one body position, so I drew the forward lean into the base. `thrust` and `fall` therefore lean the same way and differ in limbs and flame.

## Likeness and critique

Compare the two halves of `previews/compare.png`.

- **What matches:**
  - Colours.
  - Helmet shape, side ear disc and purple collar ring.
  - Visor and its highlight.
  - Cyan chest lamp, belt and buckle.
  - Jetpack with its purple top, side stripe and bottom band.
  - Where the flame sits.
  - Leg layout and the dark selective outline.
- **What differs:**
  - The new figure is a little bulkier, with a torso about 36 px wide against about 30.
  - Its lean reads weaker than the reference's.
  - It has crisp pixel edges where the reference is anti-aliased. That is intentional.

### Critic rounds

| Round | What changed | Result |
|---|---|---|
| First critique | none | **5/10**, three blocking findings: (a) no forward lean; (b) the near arm does not read apart from the torso; (c) the suit is too dark for a dark background. |
| Fix 1 | Torso redrawn with slanted edges. Near arm one step lighter, glove lowered below the hip. Far glove moved out in front of the hip. Lit faces added on torso, legs, jetpack and helmet. Black slab at the far ankle removed. | The first blind A/B critic had no shell and judged at 1x. It admitted ±3 px error, and its coordinates did not match the art. Re-run with 5x images on the game background: it **picked the new version, 6/10**, and judged (a) fixed. |
| Fix 2 | Near arm raised one more step (recolour on that layer only). | Blind A/B: the critic **could not tell the two versions apart** (687 px differ) and named the old one with low confidence. **Restored** the round-1 version, as the plugin's rule requires; the restore is pixel-exact. |

**Still standing** (two of the three rounds used, then stopped): at half size on a dark background, the near arm merges with the torso and the suit has no clearly lit surface. The palette's lightest suit tone is `#4e4659`, about as dark as the reference itself. Fixing this means adding lighter suit colours, which would move the character away from the current look. **This needs the owner's decision.**

## How the tool did

### Time

| Stage | Time |
|---|---|
| Setup, measuring the reference, palette | 19:45–19:47 |
| Base pose drawn, outlined and trimmed | about 8 minutes |
| Critic loop (3 critic calls, 2 fix rounds, 1 restore) | about 10 minutes |
| Both animations (frames, cel motion, flame drawings, timing, tags) | about 4 minutes |
| Exports and cleanup | the remainder |

### Worked well

- **Drawing:** filled polygons, lines and ellipses in one batched, undoable call per layer. `transform outline side=inside` gave a clean selective outline in one step.
- **Compare:** `look op="compare"` against the imported reference was the most useful tool in the loop.
- **Recolour and filmstrip:** `recolor replace` and the filmstrip view both worked well.
- **Motion:** `cel oscillate` reports per-frame offsets, so it is reproducible.
- **Sprite sheet export:** includes tags, durations, slices and layer selection.
- **Validate:** clear output, and the `expect` contract is useful.

### Struggled, and workarounds

- **GIF export never finishes.**
  - Error, word for word: `timeout: Aseprite did not answer 'export.run' within 120000ms.`
  - Three attempts:
    1. `thrust`, scale 3.
    2. `fall`, scale 3, sent in the same batch as attempt 1.
    3. `thrust`, scale 1.
  - No file was written.
  - **Finding:** each attempt left an indexed temporary document open in Aseprite (ids #1022, #1445, #1772) carrying the source's filename, `art/player/astronaut.aseprite`.
    - Saving any of them would have overwritten the real rig with a flattened, indexed copy.
    - I closed all three with `force: true` without saving. The source was unmodified and saved throughout.
  - On the coordinator's instruction I did not retry. I built `thrust.gif` and `fall.gif` **outside the plugin**, with Python and PIL, from the plugin-exported `astronaut.png` + `astronaut_flame.png` and the durations in `astronaut.json`.
    - The flame is drawn under the body in `thrust.gif`.
    - The GIFs are 3x nearest-neighbour on the game background `#141020`.
    - GIF stores timing in hundredths of a second, so 83/117/133 ms became 80/110/130 ms in the GIFs only. The atlas keeps the exact values.
- **`cel op="link"`** returns `applied: 1` but links nothing, whether or not the target cels exist.
  - Workaround: `cel oscillate` with amplitude 0 copies the start cel into every frame. Static parts are therefore **unlinked copies**: a later fix to the torso, helmet, visor or jetpack has to be applied to all 14 frames.
- **`frame op="delete"`** ignores `count` and deletes one frame.
- **`draw` op `clear`** with no region grows the cel to the full canvas. This is harmless for export.
- **`reference op="sample_palette"`** timed out once and otherwise returned near-duplicate colours, not clusters. I took the palette roles from a local quantise of the reference frames instead.
- **The `pixel-critic` agent has no shell**, so it cannot upscale 96x176 PNGs. It needs pre-upscaled images, or it judges at 1x and guesses coordinates.
  - Critic scores also vary between calls, and it called a 687 px value change invisible. Treat its numbers as rough.

## Validate on the saved source

- **Without the outline style check:** `passed: true`, `score: 100`, "Clean."
- **With the outline style check:** `passed: true`, "Clean (50 style note(s))", `score: 0`. The score looks inconsistent with the pass.
  - All 50 notes are outline warnings repeated across frames: 1–5 edge pixels where a trim line touches a part's silhouette (far-arm cuff, near-arm cuff, a torso seam at (54, 102), and the flame core at (31, 77)).
  - These are left as they are.
- **Open documents:** none besides `art/player/astronaut.aseprite`, which is unmodified and matches the file on disk.

## Not finished or unsure

- The darkness and arm-separation finding is still open (see above).
- `fall` is subtle: limbs move 2–3 px, about 1.5 px at in-game size.
- Switching between `thrust` and `fall` makes the limbs jump 2–3 px. The body does not move.
- Static parts are copies, not linked cels (tool bug).
- Nothing was committed. Nothing outside `art/` was written. The game does not use these files yet.

# Astronaut rig, round 2: real limb poses and the remaining animations

Worked 2026-11-25, 20:17 to 20:51 CST, in the live Aseprite session (plugin 0.8.4, Aseprite 1.3.18.6).

## Status

All six tags exist in the saved source and in both atlases.
- All six GIF previews and `poses.png` exist.
- `validate` passes on the saved source.

## What did not change

- The base body is untouched: torso, helmet, visor and jetpack art.
- The 18-colour palette is untouched. The `draw` palette lock snapped 0 colours on every import.
- The canvas stays 96x176, and the pivot slice `torso_pivot` stays at (56, 72).
- The round-1 flame drawings are reused unchanged for `thrust`.
- Round 1 is backed up in `art/player/round1/`:
  - `astronaut.aseprite`;
  - `export/`;
  - `previews/`;
  - the round-1 report.

## Files

| Path | What |
|---|---|
| `art/player/astronaut.aseprite` | Source: 30 frames, 6 tags, same 9 layers, slice `torso_pivot` |
| `art/player/export/astronaut.png` + `.json` | Body sheet (flame hidden), 30 frames in one row, 2880x176. Atlas has all six tags, every frame duration and the slice. |
| `art/player/export/astronaut_flame.png` + `.json` | Flame only, same grid and tags. Ink only on frames 1 to 6. |
| `art/player/previews/{thrust,fall,run,land,hit,tumble}.gif` | 3x nearest-neighbour on `#141020`; flame drawn in `thrust`. **Built with PIL from the plugin-exported sheets**, not with the plugin's GIF export. GIF timing is stored in 10 ms steps, so 83 → 80, 67 → 70, 117 → 110 and 133 → 130 ms (GIFs only; the atlas is exact). `land` and `hit` play once; the others loop. |
| `art/player/previews/poses.png` | The image to judge. Top row: first frame of each tag at half size (48x88) on `#141020`. Bottom row: the same row at 3x (144x264 each), drawn with smoothing as the browser would. |
| `art/player/previews/compare.png` | Round-1 likeness comparison, unchanged |
| `art/player/rig-src/` | The pose generator scripts (`rig.py`, `poses.py`, `comp.py`, `build.py`), kept so any pose can be regenerated |

## Tags

Frame numbers are 1-based, as in Aseprite. The atlas is 0-based, so `thrust` is 0 to 5 there.

| Tag | Frames | Count | Durations (ms) | Loop | Flame |
|---|---|---|---|---|---|
| `thrust` | 1–6 | 6 | 100, 83, 83, 100, 83, 83 | loop | on |
| `fall` | 7–12 | 6 | 133, 117, 133, 133, 117, 133 | loop | off |
| `run` | 13–20 | 8 | 83, 67, 83, 83, 83, 67, 83, 83 | loop | off |
| `land` | 21–23 | 3 | 67, 150, 100 | one-shot (repeat 1) | off |
| `hit` | 24–26 | 3 | 50, 117, 133 | one-shot (repeat 1) | off |
| `tumble` | 27–30 | 4 | 100, 117, 100, 117 | loop | off |

What each tag shows:
- **`thrust`:** legs trail back and down, and both arms brace forward-down with curled fists. Hands, feet and flame flicker on offset cycles.
- **`fall`:** legs swing forward with bent, loose knees and kick in alternation. Arms lift forward to chest and chin height.
- **`run`:** contact, down, pass and push for each leg, half a cycle apart, with opposing arm pumps.
- **`land`:** feet touch, then knees absorb, then rise into run frame 1.
- **`hit`:** impact, then peak whiplash, then settle. The near arm is thrown back over the jetpack and the legs jackknife forward.
- **`tumble`:** arms dangle loosely and legs splay.

## Joints

The shoulder and hip coordinates are the same for every pose of a limb. Coordinates are canvas pixel centres.

| Joint | Canvas (x, y) |
|---|---|
| Near shoulder (`arm-near`) | (52, 51) |
| Far shoulder (`arm-far`) | (61, 54) |
| Near hip (`leg-near`) | (50, 100) |
| Far hip (`leg-far`) | (56, 100) |

**Body offset.** In some frames the whole upper body is moved by a vertical offset `dy`. The four body layers are shifted, and the joints and torso pivot move with them. Every other frame has `dy` = 0.

| Tag | `dy` per frame |
|---|---|
| `run` (frames 13–20) | 0, +1, 0, −1, 0, +1, 0, −1 (bob within the 2 px limit) |
| `land` (frames 21–23) | 0, +5, +2 |

The `land` +5 is my own choice; the brief sets no limit for `land`. At +2 the critic could not see the absorb at game size. The pivot is therefore at (56, 72 + `dy`) in those frames.

## Ground line

**y = 148.** This is the lowest opaque row of a planted sole. It is identical in all 8 `run` frames and all 3 `land` frames, measured on the exported sheet.

## `thrust` against `fall`: first frames, source size

Silhouette:

| Measure | Pixels |
|---|---|
| `thrust` silhouette | 4721 |
| `fall` silhouette | 5086 |
| Differing (XOR) | **2381** |

Hand and foot positions (glove tip and boot toe):

| Point | `thrust` | `fall` | Distance |
|---|---|---|---|
| Near hand | (74.3, 85.1) | (87.7, 56.9) | **31.2 px** |
| Far hand | (59.8, 95.6) | (87.6, 83.3) | **30.4 px** |
| Near foot | (31.8, 150.1) | (65.4, 149.2) | **33.6 px** |
| Far foot | (30.4, 148.3) | (66.5, 149.5) | **36.1 px** |

These are larger than the brief's 8 to 16 px aim.
- At 15 to 22 px (my first and second passes), the critic read `fall` as "standing / same as thrust" at game size.
- It kept asking for even more: feet past x 85 and both arms above the shoulders. That would have meant 40 to 87 px.
- I settled in between, about 30 to 36 px, roughly 15 to 18 px at game size. This is a judgement call the owner may want to tune.

Secondary motion inside `thrust`, across the 6-frame loop:

| Point | Maximum travel |
|---|---|
| Near hand | 17.6 px |
| Far hand | 18.0 px |
| Near foot | 15.0 px |
| Far foot | 15.2 px |

That is well above the 3 to 4 px minimum.

## Critic

The critic is the `pixel-critic` agent. It was always given pre-upscaled images on `#141020`. I treated its scores as rough: they are not on one scale between calls, and it made checkable mistakes. It said `run` had no body bob, but the helmet top moves through rows 15, 16, 17. It also put the ground line at y 122 to 146; the measured value is 148.

**Pass 1 (first draft).**

| Tag | Score |
|---|---|
| `thrust` | 6 |
| `fall` | 4 |
| `run` | 6 |
| Six poses | 4 |

- Blocking: `fall` looked like `thrust` without the flame, `hit` read as reaching, and `tumble` read as a stride.
- Fix round 1: `thrust` arms brace forward, clear of the flame. `fall` legs go forward with bent knees and the arms lift. `run` gets a real arm pump. `hit` becomes a forward jackknife. `tumble` becomes splayed.

**Pass 2: blind A/B of the six first frames.** It picked the new version.

| Tag | Score |
|---|---|
| `thrust` | 6 |
| `fall` | 4 |
| `run` | 6 |
| `land` | 3 |
| `hit` | 5 |
| `tumble` | 3 |
| Six poses | 5 |

- Blocking: `tumble` read as waving, the `land` absorb was invisible, and `fall` still read as standing.
- Fix round 2:
  - `tumble` gets dangling arms instead of a raised palm.
  - `land` frame 2 becomes a crouch (`dy` +5).
  - `hit` becomes impact, then peak, then settle, with the near arm thrown back over the jetpack.
  - `thrust` gets wider hand and foot travel and fists.
  - `run` gets a fist.
  - `fall` gets its F5 → F6 arm pop removed. The cause was my edge pull-in; the reach was shortened so it never fires.

**Final pass, read only (no fixes after it).** Overall 6/10.

| Tag | Score | Main remaining finding |
|---|---|---|
| `thrust` | 7 | In frames 3 and 4 the near hand hangs at the hip rather than bracing. The flame is only about 3x9 px at game size. |
| `fall` | 5 | **Blocking:** the feet still sit under the hips rather than clearly forward, so a still reads as "standing and reaching". The forward hand comes within about 4 px of the right edge. |
| `run` | 6 | Reads as a brisk walk or march (short stride). In frame 7 the raised knee fills the gap between the legs. |
| `land` | 6 | Frame 1 already looks like standing. The 5 px drop is only about 2 to 3 px at game size. |
| `hit` | 6 | The thrown-back open hand in frame 1 reads a bit like a wave. In frame 2 the feet reach x ≈ 92 of 96. |
| `tumble` | 7 | The legs keep a "seated jump" shape. Only the near arm looks truly loose. |

Both fix rounds are used for `fall`, `thrust`, `run`, `hit` and `tumble`; `land` had one. **`fall` keeps its blocking finding**, and I stopped as the rules require. The critic's suggested next fix is in the next section.

## What the plugin could and could not do for posing

**Could not:**
- **Rotate a cel's contents by an arbitrary angle.** `transform op="rotate" angle=-30 allowLossy=true` was refused with: `invalid_args: Only 90/180/270 rotations are lossless. The server should have blocked this; pass allowLossy there if the user accepted the quality loss.` This happens even with `allowLossy` set. So no pose could start from a rotated copy.
- **Pose with its own tools.** It has no IK, no bones and no way to bend a limb. Moving a cel only slides it, which is what failed in round 1.

**What I did instead:**
- I wrote a small two-bone limb renderer (`art/player/rig-src/rig.py`). It builds each limb from tapered segments (upper and lower limb plus glove or boot), using the round-1 limb colour ramps and light direction. It adds a per-segment inside outline and the suit trim: shoulder-pad stripe, purple forearm stripe, cuff, finger lines, knee seam, boot cuff and sole.
- Every pose is drawn from joint angles. `run` and `land` feet are solved with IK onto the ground line.
- Each limb image was brought into the document with the plugin's `draw` op `image` (palette lock on, 0 snaps).
- The plugin's export matches my local renders exactly on all 30 frames (0 differing pixels).
- So the poses are drawn, not slid, but drawn by my script rather than by plugin tools.
- There is no small set of 2 or 3 shared drawings per limb: each frame has its own drawing, from the same renderer and joint points.

**Worked:**
- `draw` `image` with an absolute path.
- `cel oscillate` with amplitude 0, to copy a static cel into new frames.
- `cel set`, for the body offsets.
- Tags, durations, `spritesheet` export with tags, durations and slices.
- `validate`.

**Bugs, still present:**
- `export op="frames"` **hangs exactly like the GIF export**: `timeout: Aseprite did not answer 'export.run' within 120000ms.` It left an indexed temp document (#2239) under the source's filename. I closed it without saving.
- I did not call the GIF export.
- `cel link` is still a no-op, so the static parts are unlinked copies in all 30 frames.

**Final state:** the only open document is `art/player/astronaut.aseprite`, unmodified and saved.

## `validate` on the saved source

Result: `passed: true`, "Clean (36 style note(s))". The `expect` contract checked that every layer has art in its expected frames, and it raised nothing.

All 36 notes are 1 px outline warnings on round-1 art I was not allowed to redraw:
- a torso seam pixel at (54, 102), once per frame;
- the flame core pixel at (31, 77).

There are no findings on the new limb layers. `score` is reported as 0 next to "Clean" again, the same plugin quirk seen in round 1.

## Unfinished or unsure

- **`fall` still reads partly as standing** in a still (critic's blocking finding, rounds used up). The next fix would be to draw `fall` as the `thrust` legs swung forward under the body with a loose bend, and to raise the forearms about 10 px. That might also bring the difference back toward 8 to 16 px.
- **The `thrust`/`fall` difference is about 30 to 36 px,** above the 8 to 16 px aim. The game switches tags on every press, so this is a visible pose change on each tap. The owner should check it in game.
- **`run` reads more like a brisk walk** than a sprint, with a short stride. The approved torso does read as upright enough with the legs under it, so I did not redraw it.
- **The `land` crouch is subtle at game size.**
- **The torso pivot moves** in `run` (±1) and `land` (+5, +2). The game should apply `dy` or accept the small motion.
- **Limbs are rendered, not hand-pixelled.** They follow the round-1 style closely, but there was no per-pixel hand cleanup, as the critic notes say. 2 to 3 run frames have a forearm slightly bent by my edge pull-in near the right canvas edge.
- **Nothing was committed.** Nothing outside `art/` was written.

# architecture

This file is the system map. `MECHANICS.md` has the detailed math.

## boundaries

The project has these runtime areas.

| area | owns | can depend on |
|---|---|---|
| `src/config` | tunable values, presets, small math helpers | no game or browser code |
| `src/game` | simulation state and gameplay rules | config and other game modules |
| `src/game/procedural` | encounter genomes, headless simulation, feasibility, agent, fitness, search, scheduling | config and `src/game` |
| `src/render` | everything the player sees: world, hazards, astronaut, effects, HUD, menus | config and game |
| `src/audio` | everything the player hears: Web Audio graph, loops, music that follows the run | browser only |
| `src/debug` | lab view: panel, telemetry, prediction display, overlays drawn on top of the player view | config, game, render |
| `src/main.ts` | browser events, fixed step accumulator, event dispatch, render scheduling | all of the above |
| `src/viewport.ts` | canvas backing-store size for the current window, pointer to logical coordinates | config |

The dependency direction is one way:

```text
config <- game <- render <- debug <- main
                              audio <- main
```

`src/render` and `src/debug` read the game. They do not own gameplay rules
and never write to it. `DebugPanel` can change the live config because live
tuning is part of the lab. The next fixed step reads those new values.

`src/audio` imports nothing from the game. `main.ts` hands it one small
`AudioFrame` per rendered frame and plays one-shots from game events.

## important owners

| question | owner |
|---|---|
| what values can be tuned | `src/config/gameplayConfig.ts` |
| what happens in one simulation step | `src/game/Game.ts` |
| how y and vy change | `src/game/Physics.ts` |
| how floor and ceiling contact works | `src/game/Player.ts` |
| how world x becomes screen x | `src/game/Camera.ts` |
| how obstacle order is produced | `src/game/Spawner.ts` (weighted draw or encounter scheduler) and `Random.ts` |
| how an encounter is searched | `src/game/procedural/SearchGenerator.ts` |
| when a searched encounter is committed | `src/game/procedural/EncounterScheduler.ts` |
| whether a whole sequence has a safe path | `src/game/procedural/SequenceValidator.ts` |
| how the simulated player decides | `src/game/procedural/AgentController.ts` (see `AGENT.md`) |
| what difficulty, rhythm and novelty mean | `src/game/procedural/Fitness.ts`, `Pacing.ts`, `DiversityArchive.ts` |
| how encounter seeds are derived | `src/game/procedural/RandomStreams.ts` |
| how difficulty changes with distance | `src/game/Difficulty.ts` |
| whether one obstacle can be reached | `src/game/Validator.ts` |
| how future paths are simulated | `src/game/Trajectory.ts` |
| how hazard overlap works | `src/game/Collision.ts` |
| when fixed steps run | `src/main.ts` |
| what the simulation reports to sound and effects | `GameEvent` in `src/game/Game.ts`, dispatched in `src/main.ts` |
| what a power-up does and when it is spent | `src/game/Game.ts` (`toggleLoadout`, `beginRun`) |
| what happens between the fatal hit and the results | `Game.simulateCrash` |
| what the player sees | `src/render/GameRenderer.ts` and the layers it owns (`WorldLayer`, `PlayerSprite`, `Effects`, `Hud`, `Menus`) |
| how a hazard of any height is drawn from pieces | `src/render/HazardKit.ts` |
| which test flight a ghost replays and where it is | `src/game/procedural/GhostTracks.ts` |
| how a ghost looks and when it appears, bursts or hides | `src/render/GhostLayer.ts` |
| where buttons and panels sit | `src/render/layout.ts` |
| what the player hears | `src/audio/AudioEngine.ts` |
| what the lab view adds on top | `src/debug/DebugRenderer.ts` |
| where art and audio sources live | `art/` (Aseprite files, audio takes and `build_audio.py`); shipped files are under `public/assets` |
| how big the game is on screen | `src/style.css` (largest 16:10 box that fits the window) |
| how sharp it is at that size, and where a click lands | `src/viewport.ts` |

## one rendered frame

`requestAnimationFrame` gives `main.ts` the wall time since the last display
frame. That time is clamped, scaled, and added to an accumulator.

```text
browser input events
        |
        v
Input held state
        |
        v
accumulator >= fixedDt ?
        |
        +-- no --> render current state
        |
        +-- yes --> Game.step(fixedDt)
                       |
                       v
                 Game.consumeEvents -> sound and effects
                       |
                       v
                 telemetry sample
                       |
                       +-- loop while enough fixed time remains
        |
        v
Game.backgroundWork(searchFrameBudgetMs)   // encounter search, a few ms, resumable
        |
        v
AudioEngine.update(frame)                  // music and jetpack follow the run
        |
        v
GameRenderer.update, then draw             // DebugRenderer draws over it in the lab view
```

There can be zero, one, or many simulation steps before one render. Gameplay
still receives the same `fixedDt` every time. The search slice uses wall time
and only decides when a result becomes available, never which result.

Two presentation effects change how much wall time reaches the accumulator:
a hit freezes it for a few frames, and a fatal hit slows it briefly. Both
live in `main.ts`. The simulation never sees them; it only receives fewer
fixed steps for a moment.

## one simulation step

`Game.simulate` is the order authority.

1. `Input.update` advances held and released timers.
2. `Difficulty` reads traveled distance and returns world speed.
3. `Player.update` calls `integrateVertical` and resolves corridor contact.
4. `Camera.x` advances by `worldSpeed * dt`.
5. `Spawner` adds due obstacles and the oldest passed obstacle is removed. In
   search mode this means committing every finished encounter whose start is
   inside the spawn horizon, finishing its search synchronously if needed.
6. Coins in reach are collected.
7. `Collision` checks the player against obstacle rectangles.
8. A hit is resolved in this order: while the booster burns or a grace
   period runs, the hazard breaks; else an armed shield absorbs it and starts
   a short grace period; else the hit stores `DeathInfo`, starts the crash
   and changes the game state to `DEAD`.
9. Hazards passed with a few pixels to spare are reported as near misses.
10. `stepCount` advances.

Step 2 has one exception: while the booster burns, world speed is a fixed
high value, and afterwards the extra speed decays back to the difficulty
curve.

While `DEAD`, the step runs `Game.simulateCrash` instead: the body tumbles,
bounces and slides to a stop, the camera follows the slide, and coins it
touches still count. The results screen appears once it has settled.

Telemetry is sampled in `main.ts` after the step. Rendering happens after the
accumulator loop. Drawing never changes the result of a step.

## events

The simulation does not play sounds or spawn particles. Each step appends
what happened to a small list of `GameEvent`s: coin, near miss, hit, smash,
power-up, land, takeoff, bounce, crash end. `main.ts` drains the list after
every step and passes each event to the renderer and the audio engine.
Nothing in an event feeds back into a later step, so a headless run and a
browser run stay identical.

## ghosts

Every searched encounter keeps the recorded flight of each agent profile.
`GhostTrack` replays one profile's flights by camera position: per encounter
it takes the flight that starts closest to where its previous one ended, and
it reports the flight as over where the agent hit a hazard. `GhostLayer`
draws three of them a fixed distance ahead of the player. They are drawing
only: nothing reads them back, and the headless check asserts that a flying
ghost reproduces its recorded flight step for step and never overlaps a
hazard.

Ghosts hide while the booster burns. A flight through moving hazards is only
shown while the run's clock matches the clock it was tested at; after a
booster burst the two differ, so ghosts sit out encounters that contain
moving hazards for the rest of that run.

## state

The game state is small:

```text
READY -- first held input --> RUNNING
RUNNING -- pause ----------> PAUSED
PAUSED -- resume ----------> previous READY or RUNNING state
RUNNING -- hazard hit -----> DEAD
DEAD -- revive ------------> RUNNING, same run
any state -- restart ------> READY
```

Shield, 2X Coins and Booster are picked on the start screen and spent at
`READY -> RUNNING`. Retry from the results screen is a restart followed by
an immediate start, so it begins a bare run with a new seed.

Player state is separate. It reports `THRUSTING`, `FALLING`,
`FLOOR_CONTACT`, or `CEILING_CONTACT`. This keeps run control out of the
vertical physics code.

## coordinates

Canvas y points down.

- positive gravity moves velocity down
- negative thrust acceleration moves velocity up
- negative `vy` means rising
- positive `vy` means falling

Horizontal values use two spaces:

- obstacle `worldX` never changes
- `camera.x` is traveled distance
- `screenX = worldX - camera.x`
- the player uses `playerScreenX`

The player has a useful world speed for design math, but no changing screen x.
This is why distance, spawn position, and reaction time stay simple.

All of these are logical pixels on a fixed 960 x 600 canvas. The window size
never reaches gameplay or drawing code: CSS scales the canvas to fit and
`viewport.ts` applies one context transform, so every window shows the same
view of the world.

## deterministic generation

`Spawner` owns one `SeededRandom` instance. A reset creates it from the chosen
seed. Every obstacle draw uses that stream.

Difficulty for an obstacle is calculated from its world position. It is not
calculated from the render frame that happened to create it. Spacing is drawn
after obstacle geometry. These rules keep random draw order stable when one
fixed frame creates more than one obstacle.

The validator can mark an obstacle as rejected. It does not delete or replace
it. Validation can depend on live player state without changing the seeded
geometry sequence.

Encounter search uses hierarchical seeds instead of one stream:
`hash(masterSeed, encounterIndex)` for each encounter and
`hash(encounterSeed, generation, slot)` for each genome. Every search captures
its inputs (config snapshot, start position, entry states, archive) when it
starts, evaluates a fixed number of candidates, and breaks ties
deterministically. The headless simulation starts on a real camera value and
steps with the live speed rule, so simulated time and camera positions are
values the live game will produce. Same seed + config + budget therefore
produce the same encounters whether the search ran in 0.05 ms slices or in
one synchronous call; the verifier asserts this.

A random restart uses a seed that was chosen one run earlier. On a fatal hit
the spawner starts searching that seed's opening on a second scheduler, and
the restart adopts it if the seed and config still match. This only removes
the wait before the first encounter; the world is the one a fresh search
would build.

## shared physics

`integrateVertical` is used by live play and by trajectory simulation. The
trajectory code copies `(y, vy)` before it runs, so it cannot move the live
player.

This shared function is an important design rule. If gravity, thrust, damping,
or velocity clamps change, the preview and validator use the new values on the
same step.

## collision scope

Obstacle collision is manual AABB overlap. A horizontal broad phase skips
obstacles that cannot touch the player x range. The AABB test is the narrow
phase.

Floor and ceiling contact are handled in `Player`. They clamp y and clear
velocity that points into the surface. Hazards do not use that response. A
hazard hit changes the run to `DEAD` and stores the values needed by the death
overlay.

## verification boundary

`tsconfig.verify.json` emits only `src/config` and `src/game` to
`dist-verify`. `scripts/verify.mjs` imports that output and checks seeded
replay, physics, collision, trajectory bounds, spawn order, validator
behavior, and the encounter search: seed hierarchy, operator bounds,
headless-vs-live parity, entry states, sequence feasibility (including a
jointly impossible transition), agent profiles, search determinism, slicing
independence, search vs random vs weighted at equal budgets, fallback policy,
a pre-searched opening against a fresh one, live generator switching and the
pacing table.

`dist-verify` is generated output. Edit the TypeScript source and run
`npm run verify` instead of editing generated JavaScript.

## change checklist

When a gameplay rule changes:

1. put new live tuning values in `GameplayConfig`
2. keep browser code out of `src/game`; report moments as `GameEvent`s
   instead of calling sound or effects from the simulation
3. keep the fixed step order visible in `Game.simulate`
4. reuse the live integrator for prediction when possible
5. keep seeded draw order explicit
6. add or update a headless check
7. update `MECHANICS.md` when the math changes, `AGENT.md` when the agent
   or evaluators change
8. keep search inputs captured at search start so time slicing cannot leak in

This list is about keeping the lab readable. It is not a framework layer.

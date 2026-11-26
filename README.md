# STARFALL 🚀

**A procedural jetpack adventure across an alien world.**

Starfall is a browser-based endless runner where players pilot an astronaut through a dangerous alien environment using a jetpack. Dodge obstacles, collect coins, activate power-ups, and survive as the challenge gets progressively harder.

The game combines physics-based movement, procedural generation, obstacle encounters, collectible rewards, and power-ups in a fast-paced arcade experience.

## 🎮 Play Starfall

**Play online:** https://sophiaapina.github.io/Starfall/

## ✨ Features

- **Jetpack gameplay:** One-button flight controls with gravity, thrust, and responsive movement.
- **Procedural generation:** Obstacles and coin placements are generated dynamically.
- **Progressive difficulty:** The challenge evolves as the player travels farther.
- **Coin collection:** Gather coins during each run and use them in the in-game shop.
- **Power-ups:**
  - Shield: Absorbs one hit during the run.
  - Revive: Continue the same run after a crash, from the results screen.
  - Double Coins: Every coin is worth double for one run.
  - Booster: Start the run with a short invincible burst that smashes through hazards.
- **Game progression:** Track distance, score, and best runs.
- **Audio:** Menu and in-run music that reacts to the run, a jetpack sound, and feedback sounds for coins, near misses, landings and hits.
- **Visual effects:** Animated game elements, particle effects, and visual feedback.
- **Debug tools:** Inspect physics, collisions, trajectories, and procedural encounters.

## 🚀 Run locally

Requirements:
- Node.js
- npm

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Run simulation checks:

```sh
npm run verify
```

## 🕹️ Controls

| Input | Action |
|---|---|
| Space | Activate jetpack |
| Mouse click | Activate jetpack |
| Touch | Activate jetpack |
| Release input | Let gravity take over |
| 1 / 2 / 3 | On the start screen: pick Shield, 2X Coins or Booster for the next run |
| Space / Enter | After a crash: skip the tumble, then retry |
| Escape | After a crash: back to the start screen. In the shop: close it |
| F9 | Switch between the player view and the tuning lab |
| F1 | Toggle debug overlay |
| F2 | Show colliders |
| F3 | Show physics vectors |
| F4 | Show trajectory preview |
| F5 | Show telemetry graphs |
| F6 | Show encounter information |
| P | Pause / Resume |
| . | Advance one simulation step |
| R | Restart the run |

The debug panel also provides slow motion, simulation speed, physics presets, seed control, and JSON configuration import/export.

## 🪙 Coins and power-ups

Coins are collectible rewards generated throughout the game. Players can accumulate coins and spend them in the shop.

Shield, 2X Coins and Booster are bought in the shop and picked on the start screen before a run; each pick is spent when that run begins. Revive is offered on the results screen after a crash.

## 🌌 Procedural encounter generation

Starfall includes a procedural encounter system designed to create challenging and playable obstacle sequences.

The system uses:
- Procedural obstacle generation.
- Seeded random streams.
- Evolutionary search and candidate evaluation.
- Feasibility validation across multiple player skill profiles.
- Difficulty pacing phases: WARMUP → BUILD → PEAK → RECOVERY.
- Encounter scheduling and buffering.

Each encounter is evaluated before being introduced into the game world.

The debug panel includes an **Encounter Search** section for inspecting the generation process and comparing search strategies.

## 🧪 Development tools

During development, `npm run dev` enables **Candidate Lab · DEV**, a separate inspector for procedural generation.

It allows developers to:
- Generate alternative obstacle configurations.
- Inspect construction witnesses.
- Test candidates using simulated player agents.
- Replay recorded paths and input timelines.
- Compare different generation parameters.

This tool is excluded from production builds.

## 🏗️ Project structure

```text
src/
  config/
    gameplayConfig.ts
    presets.ts

  game/
    Game.ts
    Physics.ts
    Player.ts
    Camera.ts
    World.ts
    Obstacle.ts
    Spawner.ts
    Difficulty.ts
    Validator.ts
    Trajectory.ts
    Collision.ts
    Input.ts
    Random.ts

    procedural/
      Encounter.ts
      EncounterGenome.ts
      RandomStreams.ts
      PatternLibrary.ts
      Pacing.ts
      SequenceValidator.ts
      AgentController.ts
      Fitness.ts
      DiversityArchive.ts
      SearchGenerator.ts
      EncounterScheduler.ts
      CandidateGenerator.ts

  render/
    GameRenderer.ts
    WorldLayer.ts
    HazardKit.ts
    PlayerSprite.ts
    Effects.ts
    Hud.ts
    Menus.ts
    layout.ts
    panels.ts
    images.ts

  audio/
    AudioEngine.ts

  debug/
    DebugRenderer.ts
    DebugPanel.ts
    Telemetry.ts
    TrajectoryPredictor.ts
    CandidateLab.ts

  main.ts
  viewport.ts
  style.css

art/
  player/
  hazards/
  audio/

assets/
  audio/
  background/
  effects/
  environment/
  obstacles/
  player/
  ui/
```

## 📚 Technical documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Project architecture, dependencies, coordinates, and simulation flow.
- [MECHANICS.md](./MECHANICS.md) — Physics equations, gameplay parameters, and procedural generation.
- [AGENT.md](./AGENT.md) — Simulated player agents used to evaluate encounters.
- [TASK_LOG.md](./TASK_LOG.md) — Design and implementation milestones.
- [DEVLOG.md](./DEVLOG.md) — Development history and verification.
- [AGENTS.md](./AGENTS.md) — Original project brief and implementation rules.

## ⚙️ Core engineering principles

- Physics uses a fixed time step (`dt`).
- Rendering does not modify simulation state.
- The player stays at a fixed horizontal screen position.
- Obstacles maintain fixed world-space coordinates.
- Procedural generation uses seeded random streams.
- Trajectory prediction shares the same physics integration as live gameplay.
- Encounter validation checks feasibility without silently modifying obstacle sequences.
- Search results remain deterministic.
- Gameplay tuning values are centralized in `gameplayConfig.ts`.

## 🛠️ Built with

- TypeScript
- HTML5 Canvas
- CSS
- Vite
- Node.js

---

**STARFALL** — Explore the unknown. Master the jetpack. Survive the fall.

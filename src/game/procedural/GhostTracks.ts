/**
 * the test flights of the encounter search, replayed as ghosts
 *
 * Every searched encounter keeps the recorded flight of each agent profile from each entry state.
 * A ghost follows one profile: per encounter it takes the flight that starts closest to where its
 * previous flight ended, so it reads as one pilot crossing the level. Nothing is invented here: a
 * ghost is where the agent was at that camera position, and it stops where the agent hit.
 *
 * Positions are indexed by camera x, never by time, so a replay stays glued to the hazards whatever
 * the live scroll speed is.
 */

import type { AgentProfile } from "./AgentController.js";
import type { TraceFrame } from "./Encounter.js";
import type { RolloutSummary } from "./Fitness.js";
import type { EncounterRecord } from "./SearchGenerator.js";

export interface GhostSample {
  /** index of the encounter this sample comes from */
  encounter: number;
  /** false once the tested flight has hit a hazard; the ghost is gone until the next encounter */
  flying: boolean;
  /** top of the pilot's collider, same convention as Player.y */
  y: number;
  vy: number;
  hold: boolean;
  /** run time at which the test flight was at this camera position; moving hazards were where they are at that time */
  time: number;
  /** camera x and y where the flight ended in a hit; null when it crossed the whole encounter */
  crash: { cameraX: number; y: number; hitId: number } | null;
}

interface Choice {
  rollout: RolloutSummary | null;
  /** where this flight leaves the encounter, for the next one to continue from; null after a hit */
  exitY: number | null;
  /** used when the encounter has no recorded flight (an empty gap) */
  restY: number;
}

export class GhostTrack {
  private choices = new Map<number, Choice>();

  constructor(readonly profile: AgentProfile["name"]) {}

  reset(): void {
    this.choices.clear();
  }

  /**
   * where this ghost is when the camera is at `cameraX`; null outside every encounter given
   * `records` must be consecutive and in order, as the scheduler keeps them
   */
  sample(records: readonly EncounterRecord[], cameraX: number): GhostSample | null {
    const at = records.findIndex((r) => cameraX >= r.startCameraX && cameraX < r.endCameraX);
    if (at < 0) return null;
    this.forget(records[0].index);

    const record = records[at];
    const choice = this.choose(records, at);
    const trace = choice.rollout?.trace;
    if (!trace || trace.length === 0) {
      // an encounter without a flight has no hazards either, so its clock matters to nobody
      return { encounter: record.index, flying: true, y: choice.restY, vy: 0, hold: false, time: record.startTime, crash: null };
    }

    const last = trace[trace.length - 1];
    const crash = last.hitId === null ? null : { cameraX: last.cameraX, y: last.y, hitId: last.hitId };
    if (crash && cameraX >= crash.cameraX) {
      return { encounter: record.index, flying: false, y: crash.y, vy: 0, hold: false, time: last.time, crash };
    }
    const frame = interpolate(trace, cameraX);
    return { encounter: record.index, flying: true, y: frame.y, vy: frame.vy, hold: frame.hold, time: frame.time, crash };
  }

  /** the flight this ghost takes through records[at]; fixed once made, whatever order samples are asked in */
  private choose(records: readonly EncounterRecord[], at: number): Choice {
    const record = records[at];
    const known = this.choices.get(record.index);
    if (known) return known;

    const previous = at > 0 ? this.choose(records, at - 1) : null;
    const flights = (record.rollouts ?? []).filter((r) => r.profile === this.profile && r.trace && r.trace.length > 0);
    const startOf = (r: RolloutSummary) => r.trace![0].y;
    const entryYs = flights.length ? flights.map(startOf) : record.entries.map((e) => e.y);
    // continue from where the last flight ended; a ghost that just crashed, or the first one, takes the middle entry
    const from = previous?.exitY ?? median(entryYs);
    let best = 0;
    for (let i = 1; i < entryYs.length; i++) {
      if (Math.abs(entryYs[i] - from) < Math.abs(entryYs[best] - from)) best = i;
    }

    const rollout = flights[best] ?? null;
    const restY = entryYs[best] ?? from;
    const choice: Choice = { rollout, restY, exitY: rollout ? (rollout.completed ? rollout.exit.y : null) : restY };
    this.choices.set(record.index, choice);
    return choice;
  }

  private forget(oldestIndex: number): void {
    for (const index of this.choices.keys()) {
      if (index < oldestIndex - 1) this.choices.delete(index);
    }
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** the trace at a camera position between two recorded steps; the camera only moves forward, so a binary search finds them */
function interpolate(trace: TraceFrame[], cameraX: number): { y: number; vy: number; hold: boolean; time: number } {
  let lo = 0;
  let hi = trace.length - 1;
  if (cameraX <= trace[0].cameraX) return trace[0];
  if (cameraX >= trace[hi].cameraX) return trace[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid].cameraX <= cameraX) lo = mid;
    else hi = mid;
  }
  const a = trace[lo];
  const b = trace[hi];
  const span = b.cameraX - a.cameraX;
  const t = span > 0 ? (cameraX - a.cameraX) / span : 0;
  // `hold` on a frame is the input that produced it, so between two frames the later one is in force
  return { y: a.y + (b.y - a.y) * t, vy: a.vy + (b.vy - a.vy) * t, hold: b.hold, time: a.time + (b.time - a.time) * t };
}

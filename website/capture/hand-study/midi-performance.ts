import { parseMidi } from "../../../src/midi/parser";
import { planPianoFingerings } from "../../../src/hands/fingeringPlanner";
import { buildTempoMap, tickToSeconds } from "../../../src/tempo/tempoMap";

/** Six seconds of the existing original Lumina miniature, with a one-second lead-in. */
export function planStudyPerformance(bytes: Uint8Array, transpose = 0) {
  const project = parseMidi(bytes);
  const tempo = buildTempoMap(project.tempoMap, project.ticksPerQuarter);
  for (const track of project.tracks) {
    track.notes = track.notes.filter(
      (note) => tickToSeconds(note.startTick, tempo) < 6,
    );
    for (const note of track.notes) note.pitch += transpose;
  }
  // The miniature's accompaniment tops out at E4 and melody starts above it.
  const plan = planPianoFingerings(project, { splitPitch: 67 + transpose });
  const events = project.tracks
    .flatMap((track) =>
      track.notes.map((note) => {
        const assignment = plan.assignments[note.id];
        if (!assignment) throw new Error(`Missing fingering for ${note.id}`);
        return {
          id: note.id,
          pitch: note.pitch,
          finger: assignment.finger - 1,
          hand: note.pitch < 67 + transpose ? "left" : "right",
          start: 1 + tickToSeconds(note.startTick, tempo),
          end: 1 + tickToSeconds(note.endTick, tempo),
          velocity: note.velocity,
        };
      }),
    )
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  // Preserve the source MIDI's two parts. Refine the app's seed fingerings for
  // this mesh's reach, penalizing wrist travel and reserving held fingers.
  for (const hand of ["left", "right"]) {
    const notes = events.filter((e) => e.hand === hand);
    const sign = hand === "left" ? -1 : 1;
    const xFor = (pitch: number) => {
      const semitone = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6][
        pitch % 12
      ];
      return sign * (Math.floor(pitch / 12) * 7 + semitone) * 0.0235;
    };
    type State = {
      cost: number;
      wrist: number;
      chosen: number[];
      active: { finger: number; end: number; anchor: number; pitch: number }[];
    };
    let beam: State[] = [{ cost: 0, wrist: 0, chosen: [], active: [] }];
    for (const note of notes) {
      const next: State[] = [];
      for (const state of beam)
        for (let finger = 0; finger < 5; finger++) {
          const active = state.active.filter((a) => a.end > note.start + 0.001);
          if (
            active.some(
              (a) =>
                a.finger === finger ||
                (finger !== 0 &&
                  a.finger !== 0 &&
                  sign * (note.pitch - a.pitch) * (finger - a.finger) < 0),
            )
          )
            continue;
          const anchor =
            xFor(note.pitch) - [-0.055, -0.024, 0, 0.028, 0.05][finger];
          const anchors = [anchor, ...active.map((a) => a.anchor)];
          const wrist = anchors.reduce((a, b) => a + b, 0) / anchors.length;
          const spread = anchors.reduce((sum, a) => sum + (a - wrist) ** 2, 0);
          const travel = state.chosen.length ? (wrist - state.wrist) ** 2 : 0;
          const cost =
            state.cost +
            travel * 2000 +
            spread * 8000 +
            (finger === note.finger ? 0 : 0.002);
          next.push({
            cost,
            wrist,
            chosen: [...state.chosen, finger],
            active: [
              ...active,
              { finger, end: note.end, anchor, pitch: note.pitch },
            ],
          });
        }
      beam = next.sort((a, b) => a.cost - b.cost).slice(0, 48);
      if (!beam.length)
        throw new Error("No non-conflicting fingering for the MIDI excerpt");
    }
    notes.forEach((note, index) => {
      note.finger = beam[0].chosen[index];
    });
  }
  return {
    events,
    issues: plan.issues,
    duration: Math.max(...events.map((e) => e.end)) + 0.75,
  };
}

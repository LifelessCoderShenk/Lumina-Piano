import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Midi } from "@tonejs/midi";
import { planMidiPerformance } from "./midi-performance";

const source = readFileSync("website/public/media/lumina-miniature.mid");
const original = new Midi(source);
const full = planMidiPerformance(source);
assert.equal(
  full.events.length,
  original.tracks.reduce((sum, track) => sum + track.notes.length, 0),
);
assert(full.duration > 24, "Full MIDI was truncated to the six-second excerpt");
const changes = new Midi();
changes.header.tempos = [
  { ticks: 0, bpm: 120 },
  { ticks: 480, bpm: 60 },
];
changes.header.update();
changes
  .addTrack()
  .addNote({ midi: 72, ticks: 960, durationTicks: 480, velocity: 0.7 });
const tempo = planMidiPerformance(changes.toArray(), { handMode: "split" });
assert(
  Math.abs(tempo.events[0].start - 2.5) < 1e-8,
  "Tempo-change start time is wrong",
);
assert(
  Math.abs(tempo.events[0].end - 3.5) < 1e-8,
  "Tempo-change duration is wrong",
);
assert.equal(tempo.events[0].hand, "right");
const bass = new Midi();
bass.addTrack().addNote({ midi: 36, time: 0, duration: 1, velocity: 0.5 });
assert.equal(
  planMidiPerformance(bass.toArray(), { handMode: "split" }).events[0].hand,
  "left",
);
assert.throws(() => planMidiPerformance(new Uint8Array([1, 2, 3])));
assert.throws(() => planMidiPerformance(new Midi().toArray()));
const outside = new Midi();
outside.addTrack().addNote({ midi: 110, time: 0, duration: 1, velocity: 0.5 });
assert.throws(() => planMidiPerformance(outside.toArray()), /88-key/);
const dense = new Midi();
const track = dense.addTrack();
for (let pitch = 48; pitch < 59; pitch++)
  track.addNote({ midi: pitch, time: 0, duration: 2, velocity: 0.5 });
assert.throws(
  () => planMidiPerformance(dense.toArray()),
  /conflict|fingers|unplayable/i,
);
for (const event of full.events) {
  assert(
    !full.events.some(
      (other) =>
        other !== event &&
        other.hand === event.hand &&
        other.finger === event.finger &&
        other.start < event.end - 0.001 &&
        other.end > event.start + 0.001,
    ),
    "A finger is assigned to overlapping notes",
  );
}
console.log(
  `PASS: full ${full.events.length}-note import, tempo change, left/right-only, invalid/empty/out-of-range/dense files and finger occupancy.`,
);

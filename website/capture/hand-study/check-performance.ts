import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { planStudyPerformance } from "./midi-performance";
import { createHandMotion } from "./hand-motion.mjs";

const bytes = readFileSync("website/public/media/lumina-miniature.mid");
const binary = readFileSync("website/capture/hand-study/right.glb");
const whites = Array.from({ length: 60 }, (_, i) => i + 36).filter(
  (p) => ![1, 3, 6, 8, 10].includes(p % 12),
);
for (const transpose of [0, 2]) {
  const plan = planStudyPerformance(bytes, transpose);
  console.log(
    "Plan",
    transpose,
    plan.events.length,
    "notes",
    JSON.stringify(plan.issues),
  );
  assert.equal(plan.events.length, 24);
  assert.equal(plan.issues.length, 0);
  for (const note of plan.events) {
    assert(note.finger >= 0 && note.finger < 5 && note.end > note.start);
    assert(
      !plan.events.some(
        (other) =>
          other !== note &&
          other.hand === note.hand &&
          other.finger === note.finger &&
          other.start < note.end - 0.001 &&
          other.end > note.start + 0.001,
      ),
      "Overlapping notes share a finger",
    );
  }
  for (const hand of ["left", "right"]) {
    const gltf = await new GLTFLoader().parseAsync(
      binary.buffer.slice(
        binary.byteOffset,
        binary.byteOffset + binary.byteLength,
      ),
      "",
    );
    const keys = new Map(
      Array.from({ length: 60 }, (_, i) => {
        const pitch = i + 36,
          black = !whites.includes(pitch);
        const x =
          (whites.filter((p) => p < pitch).length -
            (black ? 0 : 0.5) -
            whites.length / 2 +
            1) *
          0.0235;
        return [
          pitch,
          {
            x: hand === "left" ? -x : x,
            black,
            mesh: new THREE.Mesh(
              new THREE.BoxGeometry(),
              new THREE.MeshStandardMaterial(),
            ),
          },
        ];
      }),
    );
    const events = plan.events.filter((e) => e.hand === hand);
    const root = new THREE.Scene();
    const motion = createHandMotion(gltf.scene, root, keys, {
      sequences: { performance: events },
    });
    let maximum = 0,
      worstTime = 0,
      step = 0,
      previous;
    for (let frame = 0; frame < Math.ceil(plan.duration * 60); frame++) {
      root.scale.x = 1;
      root.updateMatrixWorld(true);
      const result = motion.sample(frame / 60, "performance");
      assert(result.tips.every((tip) => tip.toArray().every(Number.isFinite)));
      if (hand === "left") {
        root.scale.x = -1;
        root.updateMatrixWorld(true);
        const names = [
          "thumb-tip",
          "index-finger-tip",
          "middle-finger-tip",
          "ring-finger-tip",
          "pinky-finger-tip",
        ];
        names.forEach((name, i) => {
          const actual = gltf.scene
            .getObjectByName(name)!
            .getWorldPosition(new THREE.Vector3());
          const expected = result.tips[i].clone();
          expected.x *= -1;
          assert(
            actual.distanceTo(expected) < 1e-8,
            "Left-hand reflection changed contact geometry",
          );
        });
      }
      if (result.worst > maximum) {
        maximum = result.worst;
        worstTime = frame / 60;
      }
      if (previous)
        step = Math.max(step, previous.distanceTo(result.wristPosition));
      previous = result.wristPosition;
    }
    assert(Number.isFinite(maximum) && Number.isFinite(step));
    console.log(
      JSON.stringify({
        hand,
        transpose,
        notes: events.length,
        maxContactMm: maximum * 1000,
        worstTime,
        maxWristStepMm: step * 1000,
      }),
    );
  }
}

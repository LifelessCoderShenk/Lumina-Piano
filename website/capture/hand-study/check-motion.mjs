import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createHandMotion } from "./hand-motion.mjs";

const bytes = await readFile(new URL("./right.glb", import.meta.url));
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  "",
);
const scene = new THREE.Scene();
const whites = Array.from({ length: 36 }, (_, i) => i + 48).filter(
  (p) => ![1, 3, 6, 8, 10].includes(p % 12),
);
const keys = new Map(
  Array.from({ length: 36 }, (_, i) => {
    const pitch = i + 48,
      black = ![...whites].includes(pitch);
    const x =
      (whites.filter((p) => p < pitch).length -
        (black ? 0 : 0.5) -
        whites.length / 2 +
        1) *
      0.0235;
    return [
      pitch,
      {
        x,
        black,
        mesh: new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial(),
        ),
      },
    ];
  }),
);
const motion = createHandMotion(gltf.scene, scene, keys);
const boneOffsets = [];
gltf.scene.traverse((object) => {
  if (object.isBone) boneOffsets.push([object, object.position.clone()]);
});
for (const exercise of ["scale", "chords", "crossing"]) {
  let maxError = 0,
    worstTime = 0,
    maxWristStep = 0,
    previous;
  for (let frame = 0; frame <= 600; frame++) {
    const result = motion.sample(frame / 60, exercise);
    assert(
      result.tips.every((tip) => tip.toArray().every(Number.isFinite)),
      `${exercise}: invalid fingertip`,
    );
    for (const [bone, offset] of boneOffsets)
      assert(
        bone.position.distanceTo(offset) < 1e-12,
        `${bone.name}: bone length changed`,
      );
    if (result.worst > maxError) {
      maxError = result.worst;
      worstTime = frame / 60;
    }
    if (previous)
      maxWristStep = Math.max(
        maxWristStep,
        result.wristPosition.distanceTo(previous),
      );
    previous = result.wristPosition;
  }
  assert(maxError < 0.003, `${exercise}: contact error exceeds 3 mm`);
  assert(
    maxWristStep < 0.008,
    `${exercise}: wrist advances more than 8 mm in one 60 Hz frame`,
  );
  const expected = motion.sample(4.1, exercise);
  motion.sample(0.4, exercise);
  const replay = motion.sample(4.1, exercise);
  assert(
    expected.wristPosition.distanceTo(replay.wristPosition) < 1e-12,
    "Scrubbing changed wrist pose",
  );
  expected.tips.forEach((tip, i) =>
    assert(
      tip.distanceTo(replay.tips[i]) < 1e-12,
      "Scrubbing changed finger pose",
    ),
  );
  console.log(
    JSON.stringify({
      exercise,
      maxContactMm: maxError * 1000,
      worstTime,
      maxWristStepMm: maxWristStep * 1000,
    }),
  );
}
const rest = motion.sample(0, "scale");
const thumbOffset = rest.tips[0].clone().sub(rest.wristPosition);
assert(
  thumbOffset.y < -0.02 && thumbOffset.y > -0.045,
  "Resting thumb must sit below the wrist, near key level",
);
assert(
  thumbOffset.x > -0.07 && thumbOffset.x < -0.03,
  `Resting thumb must stay beside the palm: ${thumbOffset.toArray()}`,
);
console.log(
  "PASS: 1,803 frames; contact, wrist-step, bone-length, finite-pose, scrub and thumb-rest checks.",
);

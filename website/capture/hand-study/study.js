import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color("#101115");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const viewport = document.querySelector("#viewport");
viewport.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(36, 1, 0.005, 5);
camera.position.set(0.22, 0.43, 0.38);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, -0.025);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xdce8ff, 0x37302a, 2));
const light = new THREE.DirectionalLight(0xffe6d0, 3);
light.position.set(-0.3, 0.65, 0.3);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, {
  left: -0.5,
  right: 0.5,
  top: 0.5,
  bottom: -0.5,
  near: 0.01,
  far: 2,
});
light.shadow.bias = -0.0001;
scene.add(light);
const keys = new Map();
const whitePitches = [];
for (let pitch = 48; pitch <= 83; pitch++)
  if (![1, 3, 6, 8, 10].includes(pitch % 12)) whitePitches.push(pitch);
const keyWidth = 0.0235;
for (let pitch = 48; pitch <= 83; pitch++) {
  const black = [1, 3, 6, 8, 10].includes(pitch % 12);
  const index = whitePitches.filter((p) => p < pitch).length;
  const x =
    (index - (black ? 0 : 0.5) - whitePitches.length / 2 + 1) * keyWidth;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      black ? 0.013 : keyWidth - 0.001,
      black ? 0.016 : 0.012,
      black ? 0.092 : 0.15,
    ),
    new THREE.MeshStandardMaterial({
      color: black ? 0x141619 : 0xe5e3dd,
      roughness: 0.4,
    }),
  );
  mesh.position.set(x, black ? 0.01 : -0.006, black ? -0.105 : -0.075);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  keys.set(pitch, { mesh, x, black });
}
const targets = Array.from({ length: 5 }, () => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.003, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x51cbff }),
  );
  scene.add(mesh);
  return mesh;
});
const loaded = await new GLTFLoader().loadAsync(
  new URL("./right.glb", import.meta.url).href,
);
const model = loaded.scene;
// Source axes: +X dorsal, -Y fingers, +Z toward little finger.
const basis = new THREE.Matrix4().set(
  0,
  0,
  1,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  1,
);
model.quaternion.setFromRotationMatrix(basis);
scene.add(model);
scene.updateMatrixWorld(true);
const wrist = model.getObjectByName("wrist");
const wristBind = wrist.getWorldPosition(new THREE.Vector3());
model.position.sub(wristBind);
scene.updateMatrixWorld(true);
let mesh;
model.traverse((o) => {
  if (o.isSkinnedMesh) {
    mesh = o;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    o.material = new THREE.MeshStandardMaterial({
      color: 0xbd8d72,
      roughness: 0.63,
      metalness: 0,
    });
  }
});
if (!mesh || !wrist) throw new Error("Hand asset has no usable skeleton");
const names = [
  "thumb",
  "index-finger",
  "middle-finger",
  "ring-finger",
  "pinky-finger",
];
const chains = names.map((name, i) => {
  const suffixes =
    i === 0
      ? ["metacarpal", "phalanx-proximal", "phalanx-distal", "tip"]
      : [
          "metacarpal",
          "phalanx-proximal",
          "phalanx-intermediate",
          "phalanx-distal",
          "tip",
        ];
  const bones = suffixes.map((s) => model.getObjectByName(`${name}-${s}`));
  if (bones.some((b) => !b)) throw new Error(`Incomplete ${name} chain`);
  wrist.attach(bones[0]);
  for (let j = 1; j < bones.length; j++) bones[j - 1].attach(bones[j]);
  return bones;
});
scene.updateMatrixWorld(true);
const wristRest = wrist.quaternion.clone();
const wristAxes = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
].map((v) =>
  v.applyQuaternion(wrist.getWorldQuaternion(new THREE.Quaternion()).invert()),
);
const specs = chains.map((chain, i) => {
  const dofs = [];
  // MCP flexion/splay and IP flexion. The thumb has a separate opposition DOF.
  for (let j = i === 0 ? 0 : 1; j < chain.length - 1; j++) {
    const bone = chain[j],
      inv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    dofs.push({
      bone,
      rest: bone.quaternion.clone(),
      axis: new THREE.Vector3(
        i === 0 ? 0 : 1,
        0,
        i === 0 ? 1 : 0,
      ).applyQuaternion(inv),
      angle: 0,
      min: i === 0 ? -1.1 : -1.55,
      max: i === 0 ? 0.4 : 0.12,
      restAngle: i === 0 ? -0.25 : j === 1 ? -0.4 : -0.52,
    });
    if (j === (i === 0 ? 0 : 1))
      dofs.push({
        bone,
        rest: bone.quaternion.clone(),
        axis: new THREE.Vector3(0, 1, 0).applyQuaternion(inv),
        angle: 0,
        min: i === 0 ? -0.8 : -0.24,
        max: i === 0 ? 0.8 : 0.24,
        restAngle: 0,
      });
    if (i === 0 && j === 0)
      dofs.push({
        bone,
        rest: bone.quaternion.clone(),
        axis: new THREE.Vector3(1, 0, 0).applyQuaternion(inv),
        angle: 0,
        min: -0.7,
        max: 0.7,
        restAngle: 0,
      });
  }
  return { chain, dofs, tip: chain.at(-1) };
});
const sourceRest = new Map(
  specs.flatMap((s) => s.dofs.map((d) => [d.bone, d.rest])),
);
function apply(spec) {
  for (const [bone, rest] of sourceRest)
    if (spec.chain.includes(bone)) bone.quaternion.copy(rest);
  for (const d of spec.dofs)
    d.bone.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(d.axis, d.angle),
    );
  wrist.updateMatrixWorld(true);
}
const ease = (t) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const clamp = THREE.MathUtils.clamp;
function sequence(exercise) {
  if (exercise === "chords")
    return [
      [60, 64, 67],
      [62, 65, 69],
      [59, 62, 67],
      [60, 64, 67],
    ].flatMap((chord, n) =>
      chord.map((pitch, j) => ({
        pitch,
        finger: [0, 2, 4][j],
        start: 1 + n * 2,
        end: 2.3 + n * 2,
      })),
    );
  const pitches =
    exercise === "crossing"
      ? [64, 65, 67, 65, 64, 62, 60]
      : [60, 62, 64, 65, 67, 69, 71, 72];
  const fingering =
    exercise === "crossing" ? [2, 0, 1, 0, 2, 1, 0] : [0, 1, 2, 0, 1, 2, 3, 4];
  return pitches.map((pitch, i) => ({
    pitch,
    finger: fingering[i],
    start: 1 + i * 0.82,
    end: 1 + i * 0.82 + 0.67,
  }));
}
function keyContact(pitch, finger = 2) {
  const key = keys.get(pitch);
  return new THREE.Vector3(
    key.x,
    key.black ? 0.025 : 0.007,
    key.black ? -0.09 : [-0.012, -0.055, -0.065, -0.055, -0.035][finger],
  );
}
function solve(spec, target, weight) {
  for (let iter = 0; iter < 18; iter++) {
    for (const d of spec.dofs) {
      const old = d.angle,
        tip = spec.tip.getWorldPosition(new THREE.Vector3()),
        delta = 0.002;
      d.angle = old + delta;
      apply(spec);
      const derivative = spec.tip
        .getWorldPosition(new THREE.Vector3())
        .sub(tip)
        .multiplyScalar(1 / delta);
      const correction =
        target.clone().sub(tip).dot(derivative) /
        (derivative.lengthSq() + 0.00002);
      d.angle = clamp(
        old + clamp(correction, -0.18, 0.18) * weight,
        d.min,
        d.max,
      );
      apply(spec);
    }
  }
  return spec.tip.getWorldPosition(new THREE.Vector3()).distanceTo(target);
}
let time = 0,
  playing = false,
  previous = performance.now(),
  top = false;
function sample(t, exercise = document.querySelector("#exercise").value) {
  const events = sequence(exercise);
  for (const { mesh, black } of keys.values())
    mesh.material.color.setHex(black ? 0x141619 : 0xe5e3dd);
  // A continuous phrase path anticipates the next position. Key presses do not
  // independently drag the palm; thumb-under uses the thumb's own opposition.
  const centers = [];
  for (const event of events) {
    const group = events.filter((e) => e.start === event.start);
    if (centers.some((c) => c.t === event.start - 0.05)) continue;
    centers.push({
      t: event.start - 0.05,
      hold: event.end - 0.1,
      x:
        group.reduce(
          (sum, e) =>
            sum +
            keyContact(e.pitch).x -
            [-0.065, -0.024, 0, 0.028, 0.05][e.finger],
          0,
        ) / group.length,
    });
  }
  let x = centers[0].x;
  for (let i = 1; i < centers.length; i++) {
    if (t >= centers[i].t) x = centers[i].x;
    else {
      x = THREE.MathUtils.lerp(
        x,
        centers[i].x,
        ease((t - centers[i - 1].hold) / (centers[i].t - centers[i - 1].hold)),
      );
      break;
    }
  }
  model.position.x = x - wristBind.x;
  model.position.y = 0.047 - wristBind.y;
  model.position.z = 0.052 - wristBind.z;
  wrist.quaternion.copy(wristRest);
  const pulse = events.reduce(
    (max, e) =>
      Math.max(
        max,
        Math.sin(Math.PI * clamp((t - e.start + 0.22) / 0.5, 0, 1)),
      ),
    0,
  );
  wrist.quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(wristAxes[0], -0.04 + pulse * 0.05),
  );
  // Roll follows the phrase direction rather than an unrelated idle oscillation.
  const direction = centers.find((c) => c.t > t);
  const roll = direction ? clamp((direction.x - x) * 1.2, -0.06, 0.06) : 0;
  wrist.quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(wristAxes[2], roll),
  );
  wrist.updateMatrixWorld(true);
  let worst = 0,
    held = 0;
  const plannedPosition = model.position.clone();
  for (let pass = 0; pass < 6; pass++) {
    const correction = new THREE.Vector3();
    let contactWeight = 0;
    worst = 0;
    held = 0;
    specs.forEach((spec, i) => {
      for (const d of spec.dofs) d.angle = d.restAngle;
      apply(spec);
      const rest = spec.tip.getWorldPosition(new THREE.Vector3());
      let target = rest,
        weight = 0,
        active = false;
      const upcoming = events
        .filter(
          (e) => e.finger === i && t >= e.start - 0.3 && t <= e.end + 0.26,
        )
        .at(-1);
      if (upcoming) {
        active = t >= upcoming.start && t <= upcoming.end;
        weight =
          t < upcoming.start
            ? ease((t - upcoming.start + 0.3) / 0.3)
            : t > upcoming.end
              ? 1 - ease((t - upcoming.end) / 0.26)
              : 1;
        target = rest.clone().lerp(keyContact(upcoming.pitch, i), weight);
        if (active)
          keys.get(upcoming.pitch).mesh.material.color.setHex(0x8faec4);
        const error = solve(spec, target, 1);
        correction.add(
          target
            .clone()
            .sub(spec.tip.getWorldPosition(new THREE.Vector3()))
            .multiplyScalar(weight),
        );
        contactWeight += weight;
        if (active) {
          worst = Math.max(worst, error);
          held++;
        }
      }
      targets[i].visible =
        document.querySelector("#targets").checked && weight > 0;
      targets[i].position.copy(target);
    });
    if (pass < 5 && contactWeight > 0) {
      // Solve the palm and fingers together; keep the wrist inside a small envelope
      // around the phrase path instead of stretching finger bones to reach a key.
      correction.multiplyScalar(0.7 / Math.max(1, contactWeight));
      model.position.add(correction);
      const displacement = model.position.clone().sub(plannedPosition);
      displacement.clampLength(0, 0.05);
      model.position.copy(plannedPosition).add(displacement);
      model.updateMatrixWorld(true);
    }
  }
  mesh.skeleton.update();
  document.querySelector("#error").textContent = held
    ? `Contact error: ${(worst * 1000).toFixed(1)} mm`
    : "Rest / transition";
  return { worst, held };
}
document.querySelector("#status").textContent = "Prototype · not production";
let auditing = false;
document.querySelector("#audit").onclick = async () => {
  auditing = true;
  playing = false;
  document.querySelector("#play").textContent = "Play";
  const inputs = [...document.querySelectorAll("button, input, select")];
  inputs.forEach((input) => {
    input.disabled = true;
  });
  const report = document.querySelector("#audit-result");
  const results = [];
  try {
    for (const exercise of ["scale", "chords", "crossing"]) {
      let maximum = 0;
      let worstTime = 0;
      for (let frame = 0; frame <= 100; frame++) {
        const result = sample(frame / 10, exercise);
        if (result.worst > maximum) {
          maximum = result.worst;
          worstTime = frame / 10;
        }
        if (frame % 10 === 0) {
          report.textContent = `Checking ${exercise}: ${frame}%`;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      results.push(
        `${exercise}: ${(maximum * 1000).toFixed(1)} mm at ${worstTime.toFixed(1)} s`,
      );
    }
    report.textContent = `Maximum held-contact error at 0.1 s intervals — ${results.join("; ")}. This measures reach, not naturalness or collisions.`;
  } finally {
    auditing = false;
    inputs.forEach((input) => {
      input.disabled = false;
    });
    sample(time);
  }
};
document.querySelector("#play").onclick = () => {
  if (time === 10) time = 0;
  playing = !playing;
  document.querySelector("#play").textContent = playing ? "Pause" : "Play";
};
document.querySelector("#time").oninput = (e) => {
  time = Number(e.target.value);
  playing = false;
  document.querySelector("#play").textContent = "Play";
};
document.querySelector("#exercise").onchange = () => {
  time = 0;
};
document.querySelector("#view").onclick = () => {
  top = !top;
  camera.position.set(...(top ? [0, 0.65, 0.001] : [0.22, 0.43, 0.38]));
  document.querySelector("#view").textContent = top
    ? "Angled view"
    : "Top view";
};
function resize() {
  const width = viewport.clientWidth,
    height = innerHeight * 0.6;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
let lastSample = "";
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  if (auditing) return;
  if (playing) {
    time = Math.min(
      10,
      time + dt * Number(document.querySelector("#speed").value),
    );
    if (time === 10) {
      playing = false;
      document.querySelector("#play").textContent = "Play";
    }
  }
  document.querySelector("#time").value = String(time);
  const sampleKey = `${time}:${document.querySelector("#exercise").value}:${document.querySelector("#targets").checked}`;
  if (sampleKey !== lastSample) {
    sample(time);
    lastSample = sampleKey;
  }
  controls.update();
  renderer.render(scene, camera);
});

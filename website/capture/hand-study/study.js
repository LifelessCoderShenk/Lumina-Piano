import { createHandMotion } from "./hand-motion.mjs";
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
const loaded = await new GLTFLoader().loadAsync(
  new URL("./right.glb", import.meta.url).href,
);
const motion = createHandMotion(loaded.scene, scene, keys);
let time = 0,
  playing = false,
  previous = performance.now(),
  top = false;
function sample(t, exercise = document.querySelector("#exercise").value) {
  const result = motion.sample(
    t,
    exercise,
    document.querySelector("#targets").checked,
  );
  document.querySelector("#error").textContent = result.held
    ? `Contact error: ${(result.worst * 1000).toFixed(1)} mm`
    : "Rest / transition";
  return result;
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
      for (let frame = 0; frame <= 600; frame++) {
        const result = sample(frame / 60, exercise);
        if (result.worst > maximum) {
          maximum = result.worst;
          worstTime = frame / 60;
        }
        if (frame % 60 === 0) {
          report.textContent = `Checking ${exercise}: ${Math.round(frame / 6)}%`;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      results.push(
        `${exercise}: ${(maximum * 1000).toFixed(1)} mm at ${worstTime.toFixed(1)} s`,
      );
    }
    report.textContent = `Maximum held-contact error at 60 samples/second — ${results.join("; ")}. This measures reach, not naturalness or collisions.`;
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

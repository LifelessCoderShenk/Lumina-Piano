import { createHandMotion } from "./hand-motion.mjs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { planStudyPerformance } from "./midi-performance";

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
camera.position.set(0.22, 0.82, 0.74);
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
for (let pitch = 21; pitch <= 108; pitch++)
  if (![1, 3, 6, 8, 10].includes(pitch % 12)) whitePitches.push(pitch);
const keyWidth = 0.0235;
for (let pitch = 21; pitch <= 108; pitch++) {
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
const midiResponse = await fetch(
  new URL("../../public/media/lumina-miniature.mid", import.meta.url),
);
if (!midiResponse.ok)
  throw new Error("Could not load the original Lumina MIDI");
const midiBytes = new Uint8Array(await midiResponse.arrayBuffer());
const performances = {
  performance: planStudyPerformance(midiBytes),
  blackkeys: planStudyPerformance(midiBytes, 2),
};
const sequencesFor = (hand) =>
  Object.fromEntries(
    Object.entries(performances).map(([name, performance]) => [
      name,
      performance.events.filter((event) => event.hand === hand),
    ]),
  );
const motion = createHandMotion(loaded.scene, scene, keys, {
  sequences: sequencesFor("right"),
});
const leftAsset = await new GLTFLoader().loadAsync(
  new URL("./right.glb", import.meta.url).href,
);
const leftRoot = new THREE.Group();
scene.add(leftRoot);
// Mirror the same licensed mesh and solve in its unmirrored coordinate frame.
const leftKeys = new Map(
  [...keys].map(([pitch, key]) => [pitch, { ...key, x: -key.x }]),
);
const leftMotion = createHandMotion(leftAsset.scene, leftRoot, leftKeys, {
  sequences: sequencesFor("left"),
});
leftRoot.visible = false;
const durationFor = (exercise) => performances[exercise]?.duration ?? 10;
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
  const performance = performances[exercise];
  leftRoot.visible = !!performance;
  if (performance) {
    leftRoot.scale.x = 1;
    leftRoot.updateMatrixWorld(true);
    const left = leftMotion.sample(
      t,
      exercise,
      document.querySelector("#targets").checked,
    );
    leftRoot.scale.x = -1;
    leftRoot.updateMatrixWorld(true);
    result.worst = Math.max(result.worst, left.worst);
    result.held += left.held;
    for (const { mesh, black } of keys.values())
      mesh.material.color.setHex(black ? 0x141619 : 0xe5e3dd);
    for (const event of performance.events)
      if (t >= event.start && t < event.end)
        keys
          .get(event.pitch)
          .mesh.material.color.setHex(
            event.hand === "left" ? 0xd5ad80 : 0x8faec4,
          );
  }
  document.querySelector("#error").textContent = result.held
    ? `Contact error: ${(result.worst * 1000).toFixed(1)} mm`
    : "Rest / transition";
  return result;
}

document.querySelector("#status").textContent = "Prototype · not production";
document.querySelector("#time").max = String(
  durationFor(document.querySelector("#exercise").value),
);
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
    for (const exercise of [
      "scale",
      "chords",
      "crossing",
      "performance",
      "blackkeys",
    ]) {
      let maximum = 0;
      let worstTime = 0;
      const frames = Math.ceil(durationFor(exercise) * 60);
      for (let frame = 0; frame <= frames; frame++) {
        const result = sample(frame / 60, exercise);
        if (result.worst > maximum) {
          maximum = result.worst;
          worstTime = frame / 60;
        }
        if (frame % 60 === 0) {
          report.textContent = `Checking ${exercise}: ${Math.round((frame / frames) * 100)}%`;
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
  if (time >= durationFor(document.querySelector("#exercise").value)) time = 0;
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
  document.querySelector("#time").max = String(
    durationFor(document.querySelector("#exercise").value),
  );
};
document.querySelector("#view").onclick = () => {
  top = !top;
  camera.position.set(...(top ? [0, 1.24, 0.001] : [0.22, 0.82, 0.74]));
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
let importWorker = null;
let importTimer = null;
let fileReadVersion = 0;
const importStatus = document.querySelector("#import-status");
function stopImport() {
  importWorker?.terminate();
  importWorker = null;
  clearTimeout(importTimer);
  importTimer = null;
  document.querySelector("#cancel-import").hidden = true;
}
function importMidi(bytes, name) {
  stopImport();
  if (bytes.byteLength > 10 * 1024 * 1024) {
    importStatus.textContent = "Choose a MIDI file smaller than 10 MB.";
    return;
  }
  const splitPitch = Number(document.querySelector("#split-pitch").value);
  if (!Number.isInteger(splitPitch) || splitPitch < 21 || splitPitch > 108) {
    importStatus.textContent =
      "Split note must be a whole MIDI pitch from 21 to 108.";
    return;
  }
  playing = false;
  document.querySelector("#play").textContent = "Play";
  importStatus.textContent = `Planning ${name}… Current preview is preserved until this succeeds.`;
  document.querySelector("#cancel-import").hidden = false;
  const worker = new Worker(new URL("./midi-worker.ts", import.meta.url), {
    type: "module",
  });
  importWorker = worker;
  worker.onmessage = ({ data }) => {
    if (worker !== importWorker) return;
    stopImport();
    if (data.error) {
      importStatus.textContent = data.error;
      return;
    }
    const result = data.result;
    performances.imported = result;
    motion.setSequence(
      "imported",
      result.events.filter((e) => e.hand === "right"),
    );
    leftMotion.setSequence(
      "imported",
      result.events.filter((e) => e.hand === "left"),
    );
    let option = document.querySelector('#exercise option[value="imported"]');
    if (!option) {
      option = document.createElement("option");
      option.value = "imported";
      document.querySelector("#exercise").append(option);
    }
    option.textContent = `MIDI · ${name}`;
    document.querySelector("#exercise").value = "imported";
    document.querySelector("#time").max = String(result.duration);
    time = 0;
    lastSample = "";
    importStatus.textContent = `Loaded ${name}: ${result.events.length} notes, full performance. One-second lead-in; MIDI tempo changes preserved. Hand reach is still experimental.`;
  };
  worker.onerror = () => {
    if (worker !== importWorker) return;
    stopImport();
    importStatus.textContent =
      "MIDI planning failed. The previous preview is still available.";
  };
  importTimer = setTimeout(() => {
    if (worker !== importWorker) return;
    stopImport();
    importStatus.textContent =
      "Planning exceeded one minute. Try a shorter MIDI or a different hand split.";
  }, 60000);
  worker.postMessage(
    {
      bytes,
      options: {
        handMode: document.querySelector("#hand-mode").value,
        splitPitch,
      },
    },
    [bytes],
  );
}
document.querySelector("#midi-file").onchange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const version = ++fileReadVersion;
  stopImport();
  if (file.size > 10 * 1024 * 1024) {
    importStatus.textContent = "Choose a MIDI file smaller than 10 MB.";
    event.target.value = "";
    return;
  }
  try {
    const bytes = await file.arrayBuffer();
    if (version !== fileReadVersion) return;
    importMidi(bytes, file.name);
  } catch {
    if (version !== fileReadVersion) return;
    importStatus.textContent =
      "Could not read this file. Please select it again.";
  }
  event.target.value = "";
};
document.querySelector("#full-demo").onclick = () => {
  fileReadVersion++;
  importMidi(midiBytes.slice().buffer, "Lumina miniature");
};
document.querySelector("#cancel-import").onclick = () => {
  fileReadVersion++;
  stopImport();
  importStatus.textContent =
    "Import cancelled. The previous preview is preserved.";
};
const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  if (auditing) return;
  if (playing) {
    time = Math.min(
      durationFor(document.querySelector("#exercise").value),
      time + dt * Number(document.querySelector("#speed").value),
    );
    if (time >= durationFor(document.querySelector("#exercise").value)) {
      playing = false;
      document.querySelector("#play").textContent = "Play";
    }
  }
  document.querySelector("#time").value = String(time);
  document.querySelector("#clock").textContent =
    `${formatTime(time)} / ${formatTime(durationFor(document.querySelector("#exercise").value))}`;
  const sampleKey = `${time}:${document.querySelector("#exercise").value}:${document.querySelector("#targets").checked}`;
  if (sampleKey !== lastSample) {
    sample(time);
    lastSample = sampleKey;
  }
  controls.update();
  renderer.render(scene, camera);
});

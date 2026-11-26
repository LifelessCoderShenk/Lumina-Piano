import { build } from "../../node_modules/rolldown/dist/index.mjs";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = new URL("../capture/hand-study/", import.meta.url);
const output = new URL("../public/demos/hands/", import.meta.url);
await mkdir(output, { recursive: true });
const code = (await readFile(new URL("study.js", source), "utf8"))
  .replace("../../public/media/lumina-miniature.mid", "../../media/lumina-miniature.mid")
  .replace("./midi-worker.ts", "./midi-worker.js")
  .replace("Prototype · not production", "")
  .replace("camera.position.set(0.22, 0.82, 0.74)", "camera.position.set(0, 1.24, 0.001)")
  .replace("top = false", "top = true")
  .replace("controls.enableDamping = true;", "controls.enableDamping = true; controls.enableRotate = false; controls.enablePan = false; controls.enableZoom = false;")
  .replace("innerHeight * 0.6", "Math.min(420, innerHeight * 0.66)")
  .replace(" notes, full performance. One-second lead-in; MIDI tempo changes preserved. Hand reach is still experimental.", " notes.");
await build({
  input: fileURLToPath(new URL("study.js", source)),
  plugins: [{ name: "website-demo", load(id) {
    if (id.replaceAll("\\", "/").endsWith("/hand-study/study.js")) return code;
  } }],
  output: { file: fileURLToPath(new URL("study.js", output)), format: "esm", minify: true },
});
await build({
  input: fileURLToPath(new URL("midi-worker.ts", source)),
  output: { file: fileURLToPath(new URL("midi-worker.js", output)), format: "esm", minify: true },
});
let html = await readFile(new URL("index.html", source), "utf8");
html = html
  .replace('Hand motion study</h1>', 'Generated hands</h1>')
  .replace('Load full Lumina MIDI', 'Load sample')
  .replace(/(<label\s*>Hands)/, '<details><summary>MIDI options</summary>$1')
  .replace('<button id="cancel-import"', '</details><button id="cancel-import"')
  .replace("Imported hand model · constrained joints · silent prototype", "")
  .replace(/Files stay on this computer\. Silent preview · 88 keys · up to 4,000\s+notes\./, "")
  .replace(/<p class="note">\s*Evaluation only\.[\s\S]*?<\/p>/, "")
  .replace('<label><input type="checkbox" id="targets"', '<details><summary>Motion diagnostics</summary><label><input type="checkbox" id="targets"')
  .replace('id="audit">Check built-in exercises</button>', 'id="audit">Check built-in exercises</button></details>')
  .replace(/<output id="clock" aria-label="Playback position"><\/output\s*>/, '')
  .replace('<details><summary>Motion diagnostics', '<output id="clock" aria-label="Playback position"></output><details><summary>Motion diagnostics');
html = html.replace("</style>", `
      body { background: #0b0b0d; font: 14px system-ui; }
      header { display: none; }
      canvas { height: auto; }
      #viewport { overflow: hidden; border-block: 1px solid #ffffff12; }
      section.note { padding: 16px 20px; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
      footer { padding: 16px 20px; gap: 14px; }
      footer details, #view { display: none; }
      #import-status:empty, #audit-result:empty { display: none; }
      #exercise { max-width: 210px; }
      button, select { background: #17171b; border-color: #ffffff25; border-radius: 20px; }
      #play { min-width: 76px; background: #f5f5f7; color: #0b0b0d; }
      input[type="file"] { max-width: 220px; }
      #time { accent-color: #a8cee8; }

      summary { cursor: pointer; padding: 10px 0; color: #aab0bc; }
      details[open] { padding-bottom: 12px; }
      input, select { max-width: 100%; box-sizing: border-box; }
      input[type="range"] { width: min(250px, 55vw); }
      :focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
      @media(max-width: 600px) {
        header, footer { padding: 16px; }
        .note { padding-left: 16px; padding-right: 16px; }
        section.note { display: grid; gap: 12px; }
      }
    </style>`);
await writeFile(new URL("index.html", output), html.replace(/^[ \t]+$/gm, ""));
for (const file of ["right.glb", "LICENSE.md"])
  await copyFile(new URL(file, source), new URL(file, output));
console.log("Built standalone silent hand demo in public/demos/hands");

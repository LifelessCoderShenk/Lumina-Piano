import { build } from "../../node_modules/esbuild/lib/main.js";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = new URL("../capture/hand-study/", import.meta.url);
const output = new URL("../public/demos/hands/", import.meta.url);
await mkdir(output, { recursive: true });
const code = (await readFile(new URL("study.js", source), "utf8"))
  .replace("../../public/media/lumina-miniature.mid", "../../media/lumina-miniature.mid")
  .replace("./midi-worker.ts", "./midi-worker.js")
  .replace("Prototype · not production", "Experimental")
  .replace(" notes, full performance. One-second lead-in; MIDI tempo changes preserved. Hand reach is still experimental.", " notes.");
await build({
  stdin: { contents: code, resolveDir: fileURLToPath(source), sourcefile: "study.js" },
  bundle: true, format: "esm", minify: true, target: "es2022",
  outfile: fileURLToPath(new URL("study.js", output)), legalComments: "linked",
});
await build({
  entryPoints: [fileURLToPath(new URL("midi-worker.ts", source))],
  bundle: true, format: "esm", minify: true, target: "es2022",
  outfile: fileURLToPath(new URL("midi-worker.js", output)), legalComments: "linked",
});
let html = await readFile(new URL("index.html", source), "utf8");
html = html
  .replace("Imported hand model · constrained joints · silent prototype", "Silent MIDI preview")
  .replace(/Files stay on this computer\. Silent preview · 88 keys · up to 4,000\s+notes\./, "Your MIDI stays in your browser.")
  .replace(/<p class="note">\s*Evaluation only\.[\s\S]*?<\/p>/, "")
  .replace('<label><input type="checkbox" id="targets"', '<details><summary>Motion diagnostics</summary><label><input type="checkbox" id="targets"')
  .replace('id="audit">Check built-in exercises</button>', 'id="audit">Check built-in exercises</button></details>');
html = html.replace("</style>", `
      header { gap: 12px; flex-wrap: wrap; }
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

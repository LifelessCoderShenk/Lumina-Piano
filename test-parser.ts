import fs from "fs";
import { parseMidi } from "./src/midi/parser";

const file = fs.readFileSync("./test-midis/moonlight.mid");

const projectData = parseMidi(file);

console.log(JSON.stringify(projectData, null, 2));
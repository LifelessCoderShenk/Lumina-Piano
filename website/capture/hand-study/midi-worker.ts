import { planMidiPerformance } from "./midi-performance";

self.onmessage = (event) => {
  try {
    const result = planMidiPerformance(
      new Uint8Array(event.data.bytes),
      event.data.options,
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Unable to read this MIDI file.",
    });
  }
};

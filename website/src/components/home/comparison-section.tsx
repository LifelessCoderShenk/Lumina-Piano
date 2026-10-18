import styles from "./comparison-section.module.css";

const comparisonTopics = [
  {
    feature: "Rerecord just a passage",
    lumina: "Select the mistake, hear a lead-in, and record a replacement. Keep the rest of your take.",
    others: "Check for passage replacement—not just whole-take or multitrack recording.",
  },
  {
    feature: "Keep your best takes",
    lumina: "Save, name, and favorite takes. Continue an unfinished take without starting again.",
    others: "Check whether takes can be named, favorited, and continued.",
  },
  {
    feature: "Fix notes without rerecording",
    lumina: "Edit pitch, timing, length, and velocity. Quantize selected notes and undo changes.",
    others: "Check for pitch, timing, duration, and velocity editing after recording.",
  },
  {
    feature: "From playing to printed score",
    lumina: "Turn captured MIDI into sheet music, correct the notes, and export a printable PDF.",
    others: "Displaying a score or importing MusicXML does not necessarily include score correction and PDF export.",
  },
  {
    feature: "Bring camera and sound together",
    lumina: "Import footage and a soundtrack, or record your performance. Adjust sync between video, audio, and falling notes.",
    others: "Check whether camera footage, audio, and MIDI can be synchronized in one app.",
  },
  {
    feature: "More than one recording angle",
    lumina: "Add multiple cameras and audio inputs in the transcription workspace, with individual framing, levels, and sync controls.",
    others: "Check camera and audio-input limits for the recording mode you need.",
  },
  {
    feature: "A look you can reuse",
    lumina: "Choose six note styles, animated shimmer, particles, glow, and backgrounds. Save your own visual presets.",
    others: "Compare the available note styles, effects, and reusable preset controls.",
  },
  {
    feature: "One performance, several outputs",
    lumina: "Export video, MIDI, MP3, and PDF through the app’s creation workflows. Main visualizer exports support up to 4K at 60 fps.",
    others: "Supported formats vary. Check video, audio, MIDI, and printable-score export separately.",
  },
];

export function ComparisonSection() {
  return (
    <section id="comparison" className={styles.section} aria-labelledby="comparison-title">
      <div className={styles.container}>
        <h2 id="comparison-title">Keep the performance. Refine the details.</h2>
        <p id="comparison-description" className={styles.intro}>
          Start with the workflow you need. Here is what Lumina includes and what to check when evaluating others.
        </p>
        <div className={styles.scroll} role="region" aria-label="Piano app comparison table" tabIndex={0}>
          <table aria-describedby="comparison-description">
            <caption className="sr-only">Lumina Piano capabilities and what to check in other piano apps.</caption>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col" className={styles.lumina}>Lumina Piano</th>
                <th scope="col">Others</th>
              </tr>
            </thead>
            <tbody>
              {comparisonTopics.map((topic) => (
                <tr key={topic.feature}>
                  <th scope="row">{topic.feature}</th>
                  <td className={styles.lumina}>{topic.lumina}</td>
                  <td>{topic.others}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}><a href="/showcase#note-correction" className="underline underline-offset-4">Hear a real before-and-after note correction</a></p>
        <p className={styles.mobileHint}>Scroll sideways to view the comparison.</p>
        <p className={styles.note}>
          “Others” covers a range of piano apps; capabilities vary by product and version.
          Transcription uses MIDI input, not audio-to-note recognition.
          Transcription video exports are currently 720p at 30 fps.
        </p>
      </div>
    </section>
  );
}

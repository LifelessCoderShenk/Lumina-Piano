/** Lumina content fitted to the reviewed reference structure. */
export const referenceContent = {
  title: "Bring your piano\nperformances to life.",
  intro:
    "Visualize your playing, refine MIDI recordings, and create piano videos with camera, audio, and sheet music in one desktop app.",
  rows: [
    {
      id: "video",
      title: "Performance video",
      lead: "Turn your piano playing into a finished video.",
      points: [
        "Start with a MIDI file or recorded performance",
        "Combine falling notes, camera footage, and audio",
        "Export a piano video to keep or share",
      ],
      media: "export",
    },
    {
      id: "record",
      title: "Record or import",
      lead: "Begin with a piece you already have—or play something new.",
      points: [
        "Connect a MIDI keyboard or digital piano",
        "Capture the notes and timing of your performance",
        "Open MIDI files and MusicXML scores",
      ],
      media: "record",
    },
    {
      id: "edit",
      title: "Note editing",
      lead: "Correct a mistake without recording the whole piece again.",
      points: [
        "Move, resize, or remove MIDI notes",
        "Adjust pitch, timing, and velocity",
        "Review changes with undo and redo",
      ],
      media: "edit",
    },
    {
      id: "score",
      title: "Sheet music",
      lead: "Bring your performance onto the page.",
      points: [
        "Generate notation from a MIDI performance",
        "Review the score and correct notes",
        "Export your sheet music as a PDF",
      ],
      media: "score",
    },
    {
      id: "style",
      title: "Visual settings",
      lead: "Choose a look that fits the music you play.",
      points: [
        "Set note colors and visual styles",
        "Adjust glow, particles, and lighting",
        "Choose backgrounds and save your visual presets",
      ],
      media: "style",
    },
    {
      id: "camera",
      title: "Camera footage",
      lead: "Keep your playing at the center of the video.",
      points: [
        "Record a camera performance or import footage",
        "Position and resize the camera view",
        "Combine piano audio with your microphone recording",
      ],
      media: "record",
    },
  ],
} as const;

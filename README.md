Desktop piano visualizer and learning app built with Electron, React, and PixiJS

Features:
Create Mode:
- Load any midi file and watch it visualized
- Note rendering with bloom, particle effects, and hit effects
- Note editor with all functions
- Export options
  Learn Mode:
  Listen- play any song at a custom tempo with falling notes and fingering
  Learn songs note by note
  Play along with falling note and track accuracy
  

Usage Instructions:
Download repo
Run npm install in the project directory
Run npm run dev in the project directory



https://github.com/user-attachments/assets/cad89e93-0595-466e-8713-de4208e78581



Record Mode → Transcription:
- Open Record and choose Performance video or Transcription from the recording hub. Create remains the wide Falling Keys workspace action, while Transcription uses the same left sidebar for Takes, Notation, and Inputs & camera. Device choices carry between both recorders, and stopped transcription takes remain ready after switching views.
- Set BPM and meter, then Record. Click and drag across the on-screen piano keys, or select a MIDI input and play your keyboard. Sustain-pedal CC64 is captured along with key releases and original note timing and velocity.
- While recording, the latest eight measures refresh at most every 80 ms. Stop shows the full performance.
- Open Notation, recording & webcam for tempo/key estimation, manual overrides, eighth/sixteenth grids and triplets, staff split, chord tolerance, short-note filtering, count-in, and metronome. Unquantized performance keeps raw timing and uses sixteenth-note notation for readability. Estimation is a starting point; check BPM and key by ear.
- Pause/Resume excludes pauses from the performance clock. Stop, focus loss, and device failure safely release held notes. A stopped take and its edits recover locally after changing modes or restarting; the last webcam take is stored in IndexedDB when available. Cameras and microphones are off on restoration.
- After Stop, use Play review and Correct notes. Select notes in the score or piano roll, Shift-click for multiple selection, drag to move, or drag the right edge to resize. Arrow keys adjust pitch/time; Shift + left/right changes duration. Exact pitch/start/duration fields, deletion, selected-note quantization, and undo/redo support cleanup without rerecording. Suspicious short or quiet isolated notes are flagged.
- Continue take plays a one-, two-, or four-bar lead-in before appending. Select passage opens a draggable, quantization-snapped punch range; a complete punch-in creates a new take while an early stop leaves the original unchanged. Every attempt stays in the Takes panel for naming, favoriting, playback comparison, selection, deletion, and undo-delete.
- Enable the optional webcam before Record. Choose devices, microphone inclusion, crop, mirror, size, and corner, or drag/resize the dark-framed overlay. Permission denial leaves note recording available. Video follows Record/Stop and Pause/Resume. Review and export have independent piano/microphone volume controls; microphone volume above 100% is applied on export.
- Choose PDF sheet music, MIDI, MP3 audio, MP4, or WebM performance video and click Export. The project title supplies the filename. MIDI/audio/video can use edited or original performance timing; notation settings never overwrite the original take.
- PDF creates paginated A4 grand-staff notation with two or three bars per line, four lines per full page, and embedded music fonts. MIDI preserves performance timing, channels, and velocity. MP3 renders a local piano-like synthesizer; it does not record the keyboard's own audio.
- Performance video renders the score and keyboard at 1280×720/30 fps with timestamped frames, optional recorded webcam, synthesized piano, and optional microphone mix. Webcam placement uses the final overlay settings. A one-second audio tail follows the take. Video export can run slower than playback; this does not stretch the performance. PDF never includes the camera.
- Restart the Electron development app after updating to load the new PDF export bridge.

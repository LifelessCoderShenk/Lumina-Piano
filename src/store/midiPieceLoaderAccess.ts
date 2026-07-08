interface MidiPieceLoaderAccess {
  loadMidiFileFromPath: (filePath: string) => Promise<boolean>
  warmUpAudioAndStartPlayback: () => Promise<void>
}

let midiPieceLoaderAccess: null | MidiPieceLoaderAccess = null

export function registerMidiPieceLoader(access: MidiPieceLoaderAccess): void {
  midiPieceLoaderAccess = access
}

export function getMidiPieceLoader(): MidiPieceLoaderAccess {
  if (midiPieceLoaderAccess == null) {
    throw new Error('MIDI piece loader is unavailable.')
  }

  return midiPieceLoaderAccess
}

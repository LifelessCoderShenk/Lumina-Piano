/*
INPUT: Transcription configuration patches, capture lifecycle commands, and captured MIDI notes.
OUTPUT: Zustand state/actions for the dedicated Transcriptor mode.
PURPOSE: Persists only the current in-memory transcription session and its engraving controls; exports are handled separately from capture state.
*/

import type { StateCreator } from 'zustand'

import { createTranscriptionDefaults } from '../defaults'
import { normalizeTranscriptionSettings } from '../../transcription/settings'
import type { AppActions, AppStore, TranscriptionSlice } from '../types'

type TranscriptionStoreSlice = TranscriptionSlice & Pick<
  AppActions,
  'clearTranscription' | 'setTranscriptionNotes' | 'setTranscriptionPhase' | 'setTranscriptionSettings'
>

export const createTranscriptionSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  TranscriptionStoreSlice
> = (set) => ({
  ...createTranscriptionDefaults(),

  setTranscriptionSettings: (patch) => {
    set((state) => {
      state.transcriptionSettings = normalizeTranscriptionSettings({ ...state.transcriptionSettings, ...patch })
      if (patch.bpm != null && Number.isFinite(patch.bpm)) {
        state.transcriptionSettings.bpm = Math.min(300, Math.max(20, Math.round(patch.bpm)))
      }
      if (patch.meter === '3/4' || patch.meter === '4/4' || patch.meter === '6/8') {
        state.transcriptionSettings.meter = patch.meter
      }
      if (typeof patch.chordNamesEnabled === 'boolean') {
        state.transcriptionSettings.chordNamesEnabled = patch.chordNamesEnabled
      }
      if (typeof patch.keyLabelsEnabled === 'boolean') {
        state.transcriptionSettings.keyLabelsEnabled = patch.keyLabelsEnabled
      }
      if (patch.midiDeviceId === null || typeof patch.midiDeviceId === 'string') {
        state.transcriptionSettings.midiDeviceId = patch.midiDeviceId
      }
      if (patch.cameraDeviceId === null || typeof patch.cameraDeviceId === 'string') {
        const video = state.transcriptionSettings.mediaSources?.find((source) => source.kind === 'video')
        if (video) video.deviceId = patch.cameraDeviceId
      }
      if (patch.microphoneDeviceId === null || typeof patch.microphoneDeviceId === 'string') {
        const audio = state.transcriptionSettings.mediaSources?.find((source) => source.kind === 'audio')
        if (audio) audio.deviceId = patch.microphoneDeviceId
      }
    })
  },

  setTranscriptionPhase: (phase) => {
    set((state) => {
      state.transcriptionPhase = phase
    })
  },

  setTranscriptionNotes: (notes) => {
    set((state) => {
      state.transcriptionNotes = [...notes]
    })
  },

  clearTranscription: () => {
    set((state) => {
      state.transcriptionNotes = []
      state.transcriptionPhase = 'idle'
    })
  },
})

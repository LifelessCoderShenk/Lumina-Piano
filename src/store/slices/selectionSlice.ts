import type { StateCreator } from 'zustand'

import type { AppActions, AppStore, SelectionSlice } from '../types'
import { validateNoteIds, validateOptionalString } from '../validation'

type SelectionStoreSlice =
  & SelectionSlice
  & Pick<AppActions, 'selectNotes' | 'addToSelection' | 'clearSelection' | 'setHoveredNote'>

export const createSelectionSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  SelectionStoreSlice
> = (set) => ({
  selectedNoteIds: new Set<string>(),
  hoveredNoteId: null,

  selectNotes: (noteIds) => {
    validateNoteIds(noteIds)

    set((state) => {
      state.selectedNoteIds = new Set(noteIds)
    })
  },

  addToSelection: (noteIds) => {
    validateNoteIds(noteIds)

    set((state) => {
      state.selectedNoteIds = new Set([...state.selectedNoteIds, ...noteIds])
    })
  },

  clearSelection: () => {
    set((state) => {
      state.selectedNoteIds = new Set<string>()
    })
  },

  setHoveredNote: (noteId) => {
    validateOptionalString(noteId, 'hoveredNoteId')

    set((state) => {
      state.hoveredNoteId = noteId
    })
  },
})

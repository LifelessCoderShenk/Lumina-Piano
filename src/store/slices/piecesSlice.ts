import type { StateCreator } from 'zustand'

import type { AppActions, AppStore, PiecesSlice } from '../types'
import { validatePiece, validateTrackId } from '../validation'

type PiecesStoreSlice =
  & PiecesSlice
  & Pick<AppActions, 'addPiece' | 'clearLoadPieceError' | 'removePiece'>

export const createPiecesSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  PiecesStoreSlice
> = (set) => ({
  pieces: [],
  currentPieceId: null,
  loadPieceError: null,

  addPiece: (piece) => {
    validatePiece(piece)

    set((state) => {
      const existingIndex = state.pieces.findIndex((candidate) => candidate.id === piece.id)
      if (existingIndex >= 0) {
        state.pieces[existingIndex] = piece
        return
      }

      state.pieces.push(piece)
    })
  },

  removePiece: (id) => {
    validateTrackId(id)

    set((state) => {
      state.pieces = state.pieces.filter((piece) => piece.id !== id)
      if (state.currentPieceId === id) {
        state.currentPieceId = null
      }
    })
  },

  clearLoadPieceError: () => {
    set((state) => {
      state.loadPieceError = null
    })
  },
})

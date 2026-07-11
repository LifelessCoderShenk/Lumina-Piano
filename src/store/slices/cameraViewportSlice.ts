import type { StateCreator } from 'zustand'

import {
  DEFAULT_VIEWPORT_HEIGHT,
  DEFAULT_VIEWPORT_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../defaults'
import type { AppActions, AppStore, CameraSlice } from '../types'
import { clamp, normalizePositiveFiniteOrFallback, validateFiniteStateNumber } from '../validation'

type CameraViewportStoreSlice =
  & CameraSlice
  & Pick<AppActions, 'setZoom' | 'setPan' | 'setRenderScale' | 'setViewportSize'>

export const createCameraViewportSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  CameraViewportStoreSlice
> = (set) => ({
  worldZoom: 1,
  panX: 0,
  panY: 0,
  renderScale: 1,
  viewportWidth: DEFAULT_VIEWPORT_WIDTH,
  viewportHeight: DEFAULT_VIEWPORT_HEIGHT,

  setZoom: (zoom) => {
    const normalizedZoom = clamp(normalizePositiveFiniteOrFallback(zoom, 1), MIN_ZOOM, MAX_ZOOM)

    set((state) => {
      state.worldZoom = normalizedZoom
    })
  },

  setPan: (panX, panY) => {
    validateFiniteStateNumber(panX, 'panX')
    validateFiniteStateNumber(panY, 'panY')

    set((state) => {
      state.panX = panX
      state.panY = panY
    })
  },

  setRenderScale: (scale) => {
    validateFiniteStateNumber(scale, 'renderScale')

    set((state) => {
      state.renderScale = Math.max(0, scale)
    })
  },

  setViewportSize: (width, height) => {
    validateFiniteStateNumber(width, 'viewportWidth')
    validateFiniteStateNumber(height, 'viewportHeight')

    set((state) => {
      state.viewportWidth = Math.max(0, Math.round(width))
      state.viewportHeight = Math.max(0, Math.round(height))
    })
  },
})

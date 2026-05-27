import * as PIXI from 'pixi.js'

import { cameraSystem } from '../camera/CameraSystem'
import {
  DeleteNotesCommand,
  MoveNotesCommand,
  QuantizeNotesCommand,
  ResizeNotesCommand,
  clipboard,
  commandHistory,
} from '../commands/index'
import type { Note } from '../midi/types'
import { spatialIndex } from '../spatial/SpatialIndex'
import { getAppState, subscribeToStore, useAppStore } from '../store/store'
import {
  HANDLE_HEIGHT,
  type LocatedNote,
  type MarqueeStateLike,
  drawDashedRect,
  drawSelectionOutline,
  findNoteAtScreenPoint,
  findNoteById,
  getNotesInScreenRect,
  getMarqueeScreenRect,
  noteToScreenRect,
} from './noteEditorHelpers'

type PointerOptions = {
  ctrlKey?: boolean
}

export type EditorMode = 'idle' | 'hovering' | 'dragging_note' | 'dragging_handle' | 'marquee'
export type EditorCursor = 'default' | 'grab' | 'grabbing' | 'ns-resize' | 'crosshair'

export interface DragState {
  mode: 'note' | 'handle_top' | 'handle_bottom'
  startScreenX: number
  startScreenY: number
  startWorldX: number
  startWorldY: number
  noteIds: string[]
  originalPositions: Map<string, NoteSnapshot>
  accumulatedDeltaPitch: number
  accumulatedDeltaTicks: number
}

export interface MarqueeState extends MarqueeStateLike {}

export interface ContextMenuState {
  x: number
  y: number
  noteIds: string[]
}

export class NoteEditorError extends Error {
  constructor(
    message: string,
    public code: 'NOT_INITIALIZED' | 'ALREADY_INITIALIZED' | 'INVALID_LAYER',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'NoteEditorError'
  }
}

type NoteSnapshot = {
  pitch: number
  startTick: number
  endTick: number
  visualEndTick: number
}

export class NoteEditorController {
  private overlayGraphics: PIXI.Graphics | null = null
  private hoveredNoteId: string | null = null
  private dragState: DragState | null = null
  private marqueeState: MarqueeState | null = null
  private isInitialized = false
  private overlayLayer: PIXI.Container | null = null
  private unsubscribeStore: (() => void) | null = null
  private currentCursor: EditorCursor = 'crosshair'
  private contextMenuHandler: ((state: ContextMenuState | null) => void) | null = null
  private cursorHandler: ((cursor: EditorCursor) => void) | null = null
  private renderRequestHandler: (() => void) | null = null

  init(overlayLayer: PIXI.Container): void {
    if (this.isInitialized) {
      throw new NoteEditorError('NoteEditorController has already been initialized.', 'ALREADY_INITIALIZED')
    }

    if (!(overlayLayer instanceof PIXI.Container)) {
      throw new NoteEditorError('NoteEditorController requires a valid overlay layer.', 'INVALID_LAYER', overlayLayer)
    }

    this.overlayLayer = overlayLayer
    this.overlayGraphics = new PIXI.Graphics()
    this.overlayLayer.addChild(this.overlayGraphics)
    this.isInitialized = true
    this.unsubscribeStore = subscribeToStore((state, previousState) => {
      if (
        state.currentTick !== previousState.currentTick ||
        state.selectedNoteIds !== previousState.selectedNoteIds ||
        state.hoveredNoteId !== previousState.hoveredNoteId ||
        state.projectData !== previousState.projectData
      ) {
        this.drawSelectionOverlay(state.currentTick)
      }
    })

    this.drawSelectionOverlay(getAppState().currentTick)
  }

  destroy(): void {
    this.unsubscribeStore?.()
    this.unsubscribeStore = null

    if (this.overlayGraphics != null && this.overlayGraphics.parent != null) {
      this.overlayGraphics.parent.removeChild(this.overlayGraphics)
    }

    this.overlayGraphics?.destroy()
    this.overlayGraphics = null
    this.overlayLayer = null
    this.dragState = null
    this.marqueeState = null
    this.hoveredNoteId = null
    this.isInitialized = false
  }

  setContextMenuHandler(handler: ((state: ContextMenuState | null) => void) | null): void {
    this.contextMenuHandler = handler
  }

  setCursorHandler(handler: ((cursor: EditorCursor) => void) | null): void {
    this.cursorHandler = handler
    if (handler != null) {
      handler(this.currentCursor)
    }
  }

  setRenderRequestHandler(handler: (() => void) | null): void {
    this.renderRequestHandler = handler
  }

  onMouseMove(screenX: number, screenY: number, options: PointerOptions = {}): void {
    this.assertInitialized()
    const currentTick = getAppState().currentTick
    const world = cameraSystem.screenToWorld(screenX, screenY)

    if (this.dragState != null) {
      this.updateDragState(world.x, world.y)
      this.setCursor(this.dragState.mode === 'note' ? 'grabbing' : 'ns-resize')
      this.drawSelectionOverlay(currentTick)
      this.renderRequestHandler?.()
      return
    }

    if (this.marqueeState != null) {
      this.marqueeState.currentWorldX = world.x
      this.marqueeState.currentWorldY = world.y
      useAppStore.getState().setHoveredNote(null)
      this.hoveredNoteId = null
      this.setCursor('crosshair')
      this.drawSelectionOverlay(currentTick)
      this.renderRequestHandler?.()
      return
    }

    this.updateHoverState(screenX, screenY, options)
  }

  onMouseDown(
    screenX: number,
    screenY: number,
    button: 0 | 2,
    options: PointerOptions = {},
  ): void {
    this.assertInitialized()
    const ctrlKey = Boolean(options.ctrlKey)
    const world = cameraSystem.screenToWorld(screenX, screenY)
    const hitNote = findNoteAtScreenPoint(screenX, screenY, getAppState().currentTick)

    if (button === 2) {
      this.handleContextMenu(screenX, screenY, hitNote)
      return
    }

    this.contextMenuHandler?.(null)

    if (hitNote != null) {
      const selectionState = getAppState().selectedNoteIds
      if (!selectionState.has(hitNote.note.id)) {
        if (ctrlKey) {
          useAppStore.getState().addToSelection([hitNote.note.id])
        } else {
          useAppStore.getState().selectNotes([hitNote.note.id])
        }
      }

      const selectedNoteIds = [...getAppState().selectedNoteIds]
      const mode = this.getDragModeForPoint(hitNote.note, screenX, screenY, getAppState().currentTick)

      this.dragState = {
        accumulatedDeltaPitch: 0,
        accumulatedDeltaTicks: 0,
        mode,
        noteIds: selectedNoteIds,
        originalPositions: this.createOriginalPositions(selectedNoteIds),
        startScreenX: screenX,
        startScreenY: screenY,
        startWorldX: world.x,
        startWorldY: world.y,
      }

      this.setHoveredNote(hitNote.note.id)
      this.setCursor(mode === 'note' ? 'grabbing' : 'ns-resize')
      this.drawSelectionOverlay(getAppState().currentTick)
      this.renderRequestHandler?.()
      return
    }

    if (!ctrlKey) {
      useAppStore.getState().clearSelection()
    }

    this.marqueeState = {
      currentWorldX: world.x,
      currentWorldY: world.y,
      startWorldX: world.x,
      startWorldY: world.y,
    }
    this.setHoveredNote(null)
    this.setCursor('crosshair')
    this.drawSelectionOverlay(getAppState().currentTick)
    this.renderRequestHandler?.()
  }

  onMouseUp(screenX: number, screenY: number, options: PointerOptions = {}): void {
    this.assertInitialized()
    const ctrlKey = Boolean(options.ctrlKey)
    const world = cameraSystem.screenToWorld(screenX, screenY)

    if (this.dragState != null) {
      this.updateDragState(world.x, world.y)
      this.commitDrag()
      this.dragState = null
      this.updateHoverState(screenX, screenY, options)
      this.drawSelectionOverlay(getAppState().currentTick)
      this.renderRequestHandler?.()
      return
    }

    if (this.marqueeState != null) {
      this.marqueeState.currentWorldX = world.x
      this.marqueeState.currentWorldY = world.y

      const notesInRegion = getNotesInScreenRect(
        getMarqueeScreenRect(this.marqueeState),
        getAppState().currentTick,
      )
      const noteIds = notesInRegion.map((locatedNote) => locatedNote.note.id)

      if (ctrlKey) {
        useAppStore.getState().addToSelection(noteIds)
      } else {
        useAppStore.getState().selectNotes(noteIds)
      }

      this.marqueeState = null
      this.updateHoverState(screenX, screenY, options)
      this.drawSelectionOverlay(getAppState().currentTick)
      this.renderRequestHandler?.()
      return
    }

    this.updateHoverState(screenX, screenY, options)
  }

  onMouseLeave(): void {
    this.assertInitialized()
    this.setHoveredNote(null)
    this.setCursor('default')
  }

  drawSelectionOverlay(currentTick: number): void {
    this.assertInitialized()
    const graphics = this.requireGraphics()

    graphics.clear()

    const selectedIds = [...getAppState().selectedNoteIds]
    for (const noteId of selectedIds) {
      const locatedNote = findNoteById(noteId)
      if (locatedNote == null) {
        continue
      }

      const previewNote = this.getPreviewNote(noteId, locatedNote.note)
      const rect = noteToScreenRect(previewNote, currentTick)
      if (rect == null) {
        continue
      }
      drawSelectionOutline(graphics, rect)
    }

    if (this.marqueeState != null) {
      const marqueeRect = getMarqueeScreenRect(this.marqueeState)
      drawDashedRect(graphics, marqueeRect.x, marqueeRect.y, marqueeRect.w, marqueeRect.h)
    }

  }

  deleteSelectedNotes(): void {
    const selectedNoteIds = [...getAppState().selectedNoteIds]
    if (selectedNoteIds.length === 0) {
      return
    }

    commandHistory.execute(new DeleteNotesCommand(selectedNoteIds))
    this.contextMenuHandler?.(null)
  }

  duplicateSelectedNotes(): void {
    const selectedNoteIds = [...getAppState().selectedNoteIds]
    if (selectedNoteIds.length === 0) {
      return
    }

    clipboard.copy(selectedNoteIds)
    const projectData = getAppState().projectData
    const offset = Math.max(1, Math.floor((projectData?.ticksPerQuarter ?? 480) / 4))
    const command = clipboard.paste(getAppState().currentTick + offset)
    if (command != null) {
      commandHistory.execute(command)
    }

    this.contextMenuHandler?.(null)
  }

  quantizeSelectedNotes(): void {
    const selectedNoteIds = [...getAppState().selectedNoteIds]
    const projectData = getAppState().projectData
    if (selectedNoteIds.length === 0 || projectData == null) {
      return
    }

    commandHistory.execute(new QuantizeNotesCommand(selectedNoteIds, Math.floor(projectData.ticksPerQuarter / 4)))
    this.contextMenuHandler?.(null)
  }

  private handleContextMenu(
    screenX: number,
    screenY: number,
    hitNote: LocatedNote | null,
  ): void {
    if (hitNote == null) {
      useAppStore.getState().clearSelection()
      this.contextMenuHandler?.(null)
      return
    }

    if (!getAppState().selectedNoteIds.has(hitNote.note.id)) {
      useAppStore.getState().selectNotes([hitNote.note.id])
    }

    this.contextMenuHandler?.({
      noteIds: [...getAppState().selectedNoteIds],
      x: screenX,
      y: screenY,
    })
  }

  private updateDragState(worldX: number, worldY: number): void {
    if (this.dragState == null) {
      return
    }

    if (this.dragState.mode === 'note') {
      this.dragState.accumulatedDeltaPitch = Math.round(worldX - this.dragState.startWorldX)
      this.dragState.accumulatedDeltaTicks = Math.round(worldY - this.dragState.startWorldY)
      return
    }

    this.dragState.accumulatedDeltaPitch = 0
    this.dragState.accumulatedDeltaTicks = Math.round(worldY - this.dragState.startWorldY)
  }

  private commitDrag(): void {
    if (this.dragState == null) {
      return
    }

    if (this.dragState.mode === 'note') {
      if (this.dragState.accumulatedDeltaPitch !== 0 || this.dragState.accumulatedDeltaTicks !== 0) {
        commandHistory.execute(
          new MoveNotesCommand(
            this.dragState.noteIds,
            this.dragState.accumulatedDeltaPitch,
            this.dragState.accumulatedDeltaTicks,
          ),
        )
      }
      return
    }

    if (this.dragState.accumulatedDeltaTicks === 0) {
      return
    }

    if (this.dragState.mode === 'handle_top') {
      commandHistory.execute(
        new ResizeNotesCommand(this.dragState.noteIds, this.dragState.accumulatedDeltaTicks, 0),
      )
      return
    }

    commandHistory.execute(
      new ResizeNotesCommand(this.dragState.noteIds, 0, this.dragState.accumulatedDeltaTicks),
    )
  }

  private updateHoverState(screenX: number, screenY: number, _options: PointerOptions): void {
    if (!spatialIndex.isBuilt() || getAppState().projectData == null) {
      this.setHoveredNote(null)
      this.setCursor('crosshair')
      return
    }

    const hitNote = findNoteAtScreenPoint(screenX, screenY, getAppState().currentTick)

    if (hitNote == null) {
      this.setHoveredNote(null)
      this.setCursor('crosshair')
      return
    }

    this.setHoveredNote(hitNote.note.id)

    const dragMode = this.getDragModeForPoint(hitNote.note, screenX, screenY, getAppState().currentTick)
    this.setCursor(dragMode === 'note' ? 'grab' : 'ns-resize')
  }

  private setHoveredNote(noteId: string | null): void {
    if (this.hoveredNoteId === noteId) {
      return
    }

    this.hoveredNoteId = noteId
    useAppStore.getState().setHoveredNote(noteId)
  }

  private setCursor(cursor: EditorCursor): void {
    if (this.currentCursor === cursor) {
      return
    }

    this.currentCursor = cursor
    this.cursorHandler?.(cursor)
  }

  private createOriginalPositions(noteIds: string[]): Map<string, NoteSnapshot> {
    const originalPositions = new Map<string, NoteSnapshot>()

    for (const noteId of noteIds) {
      const locatedNote = findNoteById(noteId)
      if (locatedNote == null) {
        continue
      }

      originalPositions.set(noteId, {
        endTick: locatedNote.note.endTick,
        pitch: locatedNote.note.pitch,
        startTick: locatedNote.note.startTick,
        visualEndTick: locatedNote.note.visualEndTick,
      })
    }

    return originalPositions
  }

  private getDragModeForPoint(
    note: Note,
    screenX: number,
    screenY: number,
    currentTick: number,
  ): DragState['mode'] {
    const rect = noteToScreenRect(note, currentTick)
    if (rect == null) {
      return 'note'
    }
    const withinHorizontalBounds = screenX >= rect.x && screenX <= rect.x + rect.w

    if (withinHorizontalBounds && Math.abs(screenY - rect.y) <= HANDLE_HEIGHT) {
      return 'handle_top'
    }

    if (withinHorizontalBounds && Math.abs(screenY - (rect.y + rect.h)) <= HANDLE_HEIGHT) {
      return 'handle_bottom'
    }

    return 'note'
  }

  private getPreviewNote(noteId: string, note: Note): Note {
    if (this.dragState == null || !this.dragState.noteIds.includes(noteId)) {
      return note
    }

    const original = this.dragState.originalPositions.get(noteId)
    const projectData = getAppState().projectData
    if (original == null || projectData == null) {
      return note
    }

    if (this.dragState.mode === 'note') {
      const clampedStartTick = clampTick(
        original.startTick + this.dragState.accumulatedDeltaTicks,
        0,
        projectData.totalTicks,
      )
      const appliedDeltaTicks = clampedStartTick - original.startTick

      return {
        ...note,
        endTick: original.endTick + appliedDeltaTicks,
        pitch: clampPitch(original.pitch + this.dragState.accumulatedDeltaPitch),
        startTick: clampedStartTick,
        visualEndTick: original.visualEndTick + appliedDeltaTicks,
      }
    }

    const nextEndTick = clampTick(
      original.endTick + (this.dragState.mode === 'handle_bottom' ? this.dragState.accumulatedDeltaTicks : 0),
      1,
      projectData.totalTicks,
    )
    const nextStartTick = clampTick(
      original.startTick + (this.dragState.mode === 'handle_top' ? this.dragState.accumulatedDeltaTicks : 0),
      0,
      nextEndTick - 1,
    )
    const appliedEndDelta = nextEndTick - original.endTick
    const nextVisualEndTick = clampTick(
      original.visualEndTick + appliedEndDelta,
      nextStartTick + 1,
      projectData.totalTicks,
    )

    return {
      ...note,
      endTick: Math.max(nextStartTick + 1, nextEndTick),
      startTick: nextStartTick,
      visualEndTick: Math.max(nextStartTick + 1, nextVisualEndTick),
    }
  }

  private requireGraphics(): PIXI.Graphics {
    if (this.overlayGraphics == null) {
      throw new NoteEditorError('NoteEditorController has not been initialized.', 'NOT_INITIALIZED')
    }

    return this.overlayGraphics
  }

  private assertInitialized(): void {
    if (!this.isInitialized || this.overlayGraphics == null || this.overlayLayer == null) {
      throw new NoteEditorError('NoteEditorController has not been initialized.', 'NOT_INITIALIZED')
    }
  }
}

function clampPitch(value: number): number {
  return Math.min(127, Math.max(0, Math.round(value)))
}

function clampTick(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export const noteEditorController = new NoteEditorController()

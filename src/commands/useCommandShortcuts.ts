import { useEffect } from 'react'

import { getAppState, useAppStore } from '../store/store'
import { clipboard } from './index'
import { commandHistory } from './index'
import { DeleteNotesCommand } from './DeleteNotesCommand'

export function useCommandShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      if ((event.ctrlKey && event.key === 'y') || (event.ctrlKey && event.shiftKey && event.key === 'Z')) {
        event.preventDefault()
        commandHistory.redo()
        return
      }

      if (event.ctrlKey && event.key === 'z') {
        event.preventDefault()
        commandHistory.undo()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNoteIds = [...getAppState().selectedNoteIds]
        if (selectedNoteIds.length > 0) {
          commandHistory.execute(new DeleteNotesCommand(selectedNoteIds))
        }
        return
      }

      if (event.ctrlKey && event.key === 'c') {
        clipboard.copy([...getAppState().selectedNoteIds])
        return
      }

      if (event.ctrlKey && event.key === 'v') {
        const command = clipboard.paste(getAppState().currentTick)
        if (command != null) {
          commandHistory.execute(command)
        }
        return
      }

      if (event.ctrlKey && event.key === 'a') {
        event.preventDefault()
        const projectData = getAppState().projectData
        if (projectData != null) {
          const allIds = projectData.tracks.flatMap((track) => track.notes.map((note) => note.id))
          useAppStore.getState().selectNotes(allIds)
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [])
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

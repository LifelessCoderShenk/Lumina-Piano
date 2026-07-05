import React, { useState, useRef, useEffect } from 'react'
import cx from 'classnames'
import { getAppState, useAppStore, useProjectData, useSelection } from '../../store/store'
import { commandHistory } from '../../commands'
import { DeleteNotesCommand } from '../../commands/DeleteNotesCommand'
import { cameraSystem } from '../../camera/CameraSystem'
import { openAndLoadMidiFile } from '../../midi/loadMidiProject'
import styles from './MenuBar.module.css'

interface MenuBarProps {
  onExportClick: () => void
}

export function MenuBar({ onExportClick }: MenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { projectData } = useProjectData()
  const { selectedNoteIds } = useSelection()

  // Click outside to close menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMenuClick = (menu: string) => {
    setActiveMenu(activeMenu === menu ? null : menu)
  }

  const handleItemClick = (action: () => void) => {
    action()
    setActiveMenu(null)
  }

  const getCenterX = () => getAppState().viewportWidth / 2
  const getCenterY = () => getAppState().viewportHeight / 2

  const menus = {
    FILE: [
      { label: 'Open MIDI File...', action: () => {
        console.log('[MenuBar] Open MIDI File clicked')
        void openAndLoadMidiFile().catch((error: unknown) => {
          console.error('MIDI load error:', error)
          useAppStore.getState().setErrorMessage('Failed to load MIDI file.')
        })
      } },
      { divider: true },
      { label: 'Export Video...', action: onExportClick },
      { divider: true },
      { label: 'Quit', action: () => window.electronAPI?.window.close() },
    ],
    EDIT: [
      { label: 'Undo', action: () => commandHistory.undo() },
      { label: 'Redo', action: () => commandHistory.redo() },
      { divider: true },
      { label: 'Select All', action: () => {
        if (!projectData) return
        const allNoteIds = projectData.tracks.flatMap(t => t.notes.map(n => n.id))
        useAppStore.getState().selectNotes(allNoteIds)
      } },
      { label: 'Delete Selected', action: () => {
        if (selectedNoteIds.size > 0) {
          commandHistory.execute(new DeleteNotesCommand(Array.from(selectedNoteIds)))
        }
      } },
    ],
    VIEW: [
      { label: 'Zoom In', action: () => cameraSystem.zoom(1.25, getCenterX(), getCenterY()) },
      { label: 'Zoom Out', action: () => cameraSystem.zoom(0.8, getCenterX(), getCenterY()) },
      { label: 'Reset Zoom', action: () => useAppStore.getState().setZoom(1) },
    ],
    WINDOW: [
      { label: 'Minimize', action: () => window.electronAPI?.window.minimize() },
      { label: 'Maximize', action: () => window.electronAPI?.window.maximize() },
    ],
    HELP: [
      { label: 'About Lumina Piano', action: () => alert('Lumina Piano v1.0.0') },
    ],
  }

  return (
    <div className={styles.menuBar} ref={menuRef}>
      {Object.entries(menus).map(([title, items]) => (
        <div key={title} className={styles.menuContainer}>
          <button
            className={cx(styles.menuButton, { [styles.active]: activeMenu === title })}
            onClick={() => handleMenuClick(title)}
            onMouseEnter={() => {
              if (activeMenu && activeMenu !== title) setActiveMenu(title)
            }}
          >
            {title}
          </button>
          
          {activeMenu === title && (
            <div className={styles.dropdown}>
              {items.map((item, index) => (
                item.divider ? (
                  <div key={index} className={styles.divider} />
                ) : (
                  <button
                    key={index}
                    className={styles.menuItem}
                    onClick={() => handleItemClick(item.action!)}
                  >
                    {item.label}
                  </button>
                )
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

import React, { useState } from 'react'
import cx from 'classnames'
import { NoteProperties } from './NoteProperties'
import { EffectsPanel } from './EffectsPanel'
import styles from './Inspector.module.css'

type Tab = 'props' | 'fx' | 'hist'

export function Inspector() {
  const [activeTab, setActiveTab] = useState<Tab>('props')

  return (
    <div className={styles.inspector}>
      <div className={styles.header}>
        <div className={styles.title}>INSPECTOR</div>
        <div className={styles.subtitle}>
          {activeTab === 'props' && 'Note Properties'}
          {activeTab === 'fx' && 'Global Effects'}
          {activeTab === 'hist' && 'History'}
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={cx(styles.tab, { [styles.active]: activeTab === 'props' })}
          onClick={() => setActiveTab('props')}
        >
          Props
        </button>
        <button
          className={cx(styles.tab, { [styles.active]: activeTab === 'fx' })}
          onClick={() => setActiveTab('fx')}
        >
          FX
        </button>
        <button
          className={cx(styles.tab, { [styles.active]: activeTab === 'hist' })}
          onClick={() => setActiveTab('hist')}
        >
          Hist
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'props' && <NoteProperties />}
        {activeTab === 'fx' && <EffectsPanel />}
        {activeTab === 'hist' && <div className={styles.empty}>History coming soon</div>}
      </div>
    </div>
  )
}

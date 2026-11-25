import React from 'react'
import styles from './ControlSection.module.css'

/** Native disclosure keeps every control available without presenting them all at once. */
export function ControlSection({ title, description, defaultOpen = false, children }: {
  title: string
  description?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details className={styles.section} open={defaultOpen || undefined}>
      <summary className={styles.summary}>
        <span>{title}{description ? <small>{description}</small> : null}</span>
      </summary>
      <div className={styles.content}>{children}</div>
    </details>
  )
}

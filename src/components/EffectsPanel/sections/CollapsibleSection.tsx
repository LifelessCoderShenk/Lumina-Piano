import React, { useEffect, useRef, useState } from 'react'

import styles from './CollapsibleSection.module.css'

export interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  className?: string
  contentClassName?: string
  titleClassName?: string
  defaultExpanded?: boolean
}

export function CollapsibleSection({
  title,
  children,
  className,
  contentClassName,
  titleClassName,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    if (contentRef.current != null) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [children, expanded])

  return (
    <section className={className}>
      <button
        className={styles.headerButton}
        type="button"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={expanded ? styles.chevronExpanded : styles.chevronCollapsed}>
          {expanded ? '\u2228' : '\u203A'}
        </span>
        <span className={titleClassName}>{title}</span>
      </button>
      <div className={styles.body} style={{ maxHeight: expanded ? `${contentHeight}px` : '0px' }}>
        <div ref={contentRef} className={contentClassName}>
          {children}
        </div>
      </div>
    </section>
  )
}

import type { ButtonHTMLAttributes, ReactNode } from 'react'

import styles from './TransportButton.module.css'

interface TransportButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  isActive?: boolean
  ariaLabel: string
}

export function TransportButton({
  ariaLabel,
  className,
  disabled,
  icon,
  isActive = false,
  type = 'button',
  ...rest
}: TransportButtonProps) {
  const classes = [
    styles.button,
    isActive ? styles.buttonActive : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      aria-label={ariaLabel}
      className={classes}
      disabled={disabled}
      type={type}
      {...rest}
    >
      <span className={styles.icon}>{icon}</span>
    </button>
  )
}

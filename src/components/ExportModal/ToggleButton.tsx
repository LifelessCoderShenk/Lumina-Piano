import styles from './ToggleButton.module.css'

export interface ToggleButtonProps {
  label: string
  selected: boolean
  disabled?: boolean
  onClick(): void
}

export function ToggleButton({
  disabled = false,
  label,
  onClick,
  selected,
}: ToggleButtonProps) {
  const className = [
    styles.button,
    selected ? styles.selected : '',
    disabled ? styles.disabled : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={className}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

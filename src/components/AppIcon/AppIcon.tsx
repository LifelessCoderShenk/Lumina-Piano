import type { LucideIcon, LucideProps } from 'lucide-react'

export type AppIconSize = 16 | 18 | 20 | 24

interface AppIconProps extends Omit<LucideProps, 'absoluteStrokeWidth' | 'color' | 'fill' | 'size' | 'stroke' | 'strokeWidth'> {
  icon: LucideIcon
  size?: AppIconSize
}

/** The single visual contract for UI icons: outlined, currentColor, and legible at every tier. */
export function AppIcon({ icon: Icon, size = 20, ...props }: AppIconProps) {
  return (
    <Icon
      {...props}
      aria-hidden="true"
      absoluteStrokeWidth
      fill="none"
      size={size}
      stroke="currentColor"
      strokeWidth={1.75}
    />
  )
}

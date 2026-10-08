import { Play } from 'lucide-react'
import { render } from '@testing-library/react'
import { expect, it } from 'vitest'

import { AppIcon } from './AppIcon'

it('renders the shared outlined 24-viewBox icon contract', () => {
  const { container } = render(<AppIcon icon={Play} size={18} />)
  const icon = container.querySelector('svg')

  expect(icon?.getAttribute('aria-hidden')).toBe('true')
  expect(icon?.getAttribute('viewBox')).toBe('0 0 24 24')
  expect(icon?.getAttribute('fill')).toBe('none')
  expect(icon?.getAttribute('stroke')).toBe('currentColor')
  expect(icon?.getAttribute('width')).toBe('18')
  expect(icon?.getAttribute('height')).toBe('18')
})

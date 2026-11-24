import { createElement as h, useId, type ReactNode, type SVGProps } from 'react'

import { cn } from '../lib/utils.ts'
import { useRedrawn } from '../redraw/redraw.ts'
import { HAND, type Stroke } from './brush.ts'
import type { Glyph } from './glyphs.ts'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  readonly size?: number | string
}

export type Icon = (props: IconProps) => React.JSX.Element

const maskId = (id: string): string => `omne-icon-${id}`

const ink = (stroke: Stroke, mask?: string): ReactNode =>
  h('path', { key: stroke.ink, d: stroke.ink, mask })

function drawn(stroke: Stroke, id: string): ReactNode {
  const trail = { d: stroke.trail, fill: 'none', stroke: 'white', strokeWidth: HAND.width + 1 }
  return h(
    'g',
    { key: stroke.ink },
    h(
      'mask',
      { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 24, height: 24 },
      h('path', { ...trail, 'data-icon-rest': '' }),
      h('path', { ...trail, 'data-icon-motion': 'draw', pathLength: 1 }),
    ),
    ink(stroke, `url(#${id})`),
  )
}

function movingStrokes(glyph: Glyph, id: string): ReactNode {
  if (glyph.motion === 'draw') {
    return glyph.moving.map((stroke, index) => drawn(stroke, `${id}-${index}`))
  }
  if (glyph.moving.length === 0) return false
  const [x, y] = glyph.origin ?? [12, 12]
  return h(
    'g',
    {
      'data-icon-motion': glyph.motion === 'none' ? undefined : glyph.motion,
      style: { transformOrigin: `${x}px ${y}px` },
    },
    glyph.moving.map(stroke => ink(stroke)),
  )
}

const names = new Set<string>()

export const iconNames = (): readonly string[] => [...names].sort()

export function defineIcon(name: string, glyph: Glyph): Icon {
  names.add(name)
  function GlyphIcon({ size = 24, className, ...props }: IconProps): React.JSX.Element {
    const id = maskId(useId())
    return useRedrawn('icon', name, { name, size, className }, () =>
      h(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'currentColor',
          'aria-hidden': 'true',
          'data-icon': name,
          className: cn('omne-icon', className),
          ...props,
        },
        glyph.still.map(stroke => ink(stroke)),
        movingStrokes(glyph, id),
      ),
    )
  }
  GlyphIcon.displayName = `Icon(${name})`
  return GlyphIcon
}

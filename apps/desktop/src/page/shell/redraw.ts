import {
  defineRenderPoint,
  type Declared,
  type RenderDrawer,
  type RenderPoint,
} from '@omne-harness/shell-contract'
import { iconNames, type Redraw, type RedrawKind } from '@omne-harness/ui-kit'
import type { ReactNode } from 'react'

/** One icon of the set as a host draws it: its name, and the size and class it was asked for with. */
export type IconSubject = Readonly<{
  name: string
  size: number | string
  className: string | undefined
}>

const ICON_EXAMPLE = [
  '{"point":"shell.icon","key":"send","module":"send-icon.js","export":"icon"}',
  'send-icon.js:',
  'export const icon = ({ React }) => ({ subject }) =>',
  "  React.createElement('svg', { viewBox: '0 0 24 24', width: subject.size, height: subject.size, fill: 'currentColor', 'aria-hidden': 'true', className: subject.className },",
  "    React.createElement('path', { d: 'M3 20 21 12 3 4v6l11 2-11 2z' }))",
].join('\n')

export const iconPoint: RenderPoint<IconSubject> = defineRenderPoint({
  name: 'shell.icon',
  key: 'the name of the icon: OmneExtensionPoints show shell.icon lists the names',
  summary:
    'How one icon is drawn everywhere the interface shows it, by its name: in the sidebar, on a button, in a list.',
  subject:
    'the icon as it is asked for: name; size, a number of pixels or a CSS length; className, the classes to put on the root, or none',
  example: ICON_EXAMPLE,
})

type Through = (
  shell: RenderDrawer,
  key: string,
  subject: object,
  builtIn: () => ReactNode,
) => ReactNode

const THROUGH: Readonly<Record<RedrawKind, Through | undefined>> = {
  icon: (shell, key, subject, builtIn) =>
    iconPoint.draw(shell, key, subject as IconSubject, builtIn),
  piece: undefined,
}

/** The points the shell declares for what the shared kit draws by name. */
export const redrawPoints: readonly Declared[] = [iconPoint]

/** The names a point of the kit draws by; none for a point that is not one of them. */
export function redrawKeys(point: string): readonly string[] | undefined {
  return point === iconPoint.name ? iconNames() : undefined
}

/** Draws what the kit asks for through the points of the shell. */
export function redrawThrough(shell: RenderDrawer): Redraw {
  return (kind, key, subject, builtIn) => {
    const through = THROUGH[kind]
    return through === undefined ? builtIn() : through(shell, key, subject, builtIn)
  }
}

export type RedrawRelay = Readonly<{ draw: Redraw; bind(source: Redraw): () => void }>

/** Stands at the root of the page before the shell is there: until one is bound, the kit draws its own. */
export function redrawRelay(): RedrawRelay {
  let source: Redraw | undefined
  return {
    draw: (kind, key, subject, builtIn) =>
      source === undefined ? builtIn() : source(kind, key, subject, builtIn),
    bind(next) {
      source = next
      return () => {
        if (source === next) source = undefined
      }
    },
  }
}

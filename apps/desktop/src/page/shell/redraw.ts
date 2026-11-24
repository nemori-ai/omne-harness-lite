import {
  defineRenderPoint,
  type Declared,
  type RenderDrawer,
  type RenderPoint,
} from '@omne-harness/shell-contract'
import { iconNames, PIECES, type Redraw, type RedrawKind } from '@omne-harness/ui-kit'
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

const PIECE_EXAMPLE = [
  '{"point":"shell.piece","key":"loading","module":"loading.js","export":"loading"}',
  'loading.js:',
  'export const loading = ({ React }) => ({ subject, generic }) =>',
  "  subject.counted ? generic() : React.createElement('span', { 'aria-hidden': 'true', className: subject.className }, '…')",
].join('\n')

export const piecePoint: RenderPoint<object> = defineRenderPoint({
  name: 'shell.piece',
  key: `one of the shared pieces of the interface: ${PIECES.join(', ')}`,
  summary:
    'How one shared piece of the interface is drawn wherever a page shows it: the loading mark, an empty state, a notice in a page, the body of the figure of the agent.',
  subject:
    'what the page asks the piece to show. loading: size (sm or md), active, counted, className. empty-state: title, hint, action, role, className. inline-notice: tone, title, body, detail, action. figure: size in pixels, phase (seated or flying), hover, doing (idle, thinking, looking, writing or background), waiting, the count of what waits for the person; the shell still places the figure, moves it and takes the press',
  example: PIECE_EXAMPLE,
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
  piece: (shell, key, subject, builtIn) => piecePoint.draw(shell, key, subject, builtIn),
}

/** The points the shell declares for what the shared kit draws by name. */
export const redrawPoints: readonly Declared[] = [iconPoint, piecePoint]

/** The names a point of the kit draws by; none for a point that is not one of them. */
export function redrawKeys(point: string): readonly string[] | undefined {
  if (point === iconPoint.name) return iconNames()
  return point === piecePoint.name ? PIECES : undefined
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

import { createContext, createElement, Fragment, useContext, type ReactNode } from 'react'

export type RedrawKind = 'icon' | 'piece'

export const PIECES = ['empty-state', 'figure', 'inline-notice', 'loading', 'note'] as const

export type Piece = (typeof PIECES)[number]

export type Redraw = (
  kind: RedrawKind,
  key: string,
  subject: object,
  builtIn: () => ReactNode,
) => ReactNode

const RedrawContext = createContext<Redraw | null>(null)

export const RedrawProvider = RedrawContext.Provider

export function useRedrawn(
  kind: RedrawKind,
  key: string,
  subject: object,
  builtIn: () => React.JSX.Element,
): React.JSX.Element {
  const redraw = useContext(RedrawContext)
  if (redraw === null) return builtIn()
  return createElement(Fragment, null, redraw(kind, key, subject, builtIn))
}

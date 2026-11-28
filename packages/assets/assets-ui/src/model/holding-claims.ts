import type { AttachedItem } from '@omne-harness/shell-contract'
import { ASSETS_HOLDING } from './points.ts'

/** The settings items the `assets.holding` items of a category claim, and when they change. */
export type HoldingClaims = Readonly<{
  of: (category: string) => string
  subscribe: (listener: () => void) => () => void
}>

export const NO_CLAIMS: HoldingClaims = { of: () => '', subscribe: () => () => undefined }

type Attached = Readonly<{
  items: (slot: 'attached') => readonly AttachedItem[]
  subscribe: (slot: 'attached', listener: () => void) => () => void
}>

const claimsOf = (item: AttachedItem): readonly string[] => {
  const { claims } = item as { claims?: unknown }
  return Array.isArray(claims) ? claims.filter(claim => typeof claim === 'string') : []
}

/** Reads the claims off the items the shell holds; `of` answers one line per item, sorted, to compare cheaply. */
export function holdingClaims(shell: Attached): HoldingClaims {
  return {
    of: category => {
      const anchor = `${ASSETS_HOLDING}:${category}`
      const items = shell.items('attached').filter(item => item.anchor === anchor)
      return [...new Set(items.flatMap(claimsOf))].sort().join('\n')
    },
    subscribe: listener => shell.subscribe('attached', listener),
  }
}

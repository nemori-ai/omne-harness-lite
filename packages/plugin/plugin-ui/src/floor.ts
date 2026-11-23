import type { Kept } from './loader.ts'

/** The floor of the application: what it remembers across its runs of what was being loaded, and whether it holds that back. */
export type FloorPort = Readonly<{
  /** Called when loading for a tenant starts: what the last run wanted, and whether the floor holds it back now. */
  rise(tenant: string): Readonly<{ want: readonly string[]; held: boolean }>
  /** Called before each load: from here until `settle`, a run that ends went down while it loaded. */
  want(tenant: string, fiber: string): void
  unwant(tenant: string, fiber: string): void
  settle(tenant: string): void
}>

export const NO_FLOOR: FloorPort = {
  rise: () => ({ want: [], held: false }),
  want: () => undefined,
  unwant: () => undefined,
  settle: () => undefined,
}

const FIBER = /^plugin:(.+)@([^@]+)$/u

export const fiberOf = (name: string, version: string): string => `plugin:${name}@${version}`

/** The plugins the floor holds back, each in the version it holds. */
export function heldOf(fibers: readonly string[]): ReadonlyMap<string, string> {
  return new Map(
    fibers.flatMap(fiber => {
      const match = FIBER.exec(fiber)
      return match === null ? [] : [[match[1] ?? '', match[2] ?? ''] as const]
    }),
  )
}

type Standing = Readonly<{
  wanted: ReadonlySet<string>
  held: ReadonlySet<string>
  loading: boolean
}>

export function standingOf(states: ReadonlyMap<string, Kept>): Standing {
  const wanted = new Set<string>()
  const held = new Set<string>()
  let loading = false
  for (const [name, state] of states) {
    if (state.kind === 'failed') continue
    wanted.add(fiberOf(name, state.version))
    if (state.kind === 'held') held.add(fiberOf(name, state.version))
    if (state.kind !== 'loading') continue
    loading = true
    if (state.over !== undefined) wanted.add(fiberOf(name, state.over))
  }
  return { wanted, held, loading }
}

import type { Kept } from '@omne-harness/plugin-protocol'
import { wearStep, type LookChoice, type Skins } from './wear.ts'

/** Where the choice of a look is remembered, by tenant, as a text the application keeps without reading. It answers null for none kept, and does not throw when it cannot keep one. */
export type LookStore = Readonly<{
  read(tenant: string): string | null
  write(tenant: string, text: string): void
}>

export type SkinNow = Readonly<{ name: string; state: Kept['kind']; reason?: string }>

/** The skins of the tenant on show, the one worn and the choice remembered. `listed` is false until what the tenant is to load was read once. */
export type WearView = Readonly<{
  listed: boolean
  skins: readonly SkinNow[]
  worn: string | undefined
  choice: LookChoice
}>

export type Wear = Readonly<{
  open(tenant: string): void
  /** The skins the list last read names, and what the loader holds now. A skin it holds nothing for yet is still to come up. It is not called while what is to load could not be read. */
  settle(listed: ReadonlySet<string>, states: ReadonlyMap<string, Kept>): void
  close(): void
  view(): WearView | undefined
  choose(choice: LookChoice): void
  watch(listener: () => void): () => void
}>

type Open = Readonly<{
  tenant: string
  choice: LookChoice
  skins: readonly SkinNow[] | undefined
  worn: string | undefined
}>

const NONE: LookChoice = { kind: 'none' }

const LOADING: Kept = { kind: 'loading', version: '', next: 'keep' }

const up = (state: Kept): boolean =>
  state.kind === 'loaded' || (state.kind === 'loading' && state.over !== undefined)

type Listed = Readonly<{ now: readonly SkinNow[]; skins: Skins }>

function listedOf(names: ReadonlySet<string>, states: ReadonlyMap<string, Kept>): Listed {
  const sorted = [...names].sort()
  const stateOf = (name: string): Kept => states.get(name) ?? LOADING
  return {
    now: sorted.map(name => {
      const state = stateOf(name)
      return { name, state: state.kind, ...(state.kind === 'failed' && { reason: state.reason }) }
    }),
    skins: { wanted: names, loaded: new Set(sorted.filter(name => up(stateOf(name)))) },
  }
}

const same = (left: LookChoice, right: LookChoice): boolean =>
  left.kind === right.kind && (left.kind !== 'named' || left.name === (right as typeof left).name)

const viewOf = ({ choice, skins, worn }: Open): WearView => ({
  listed: skins !== undefined,
  skins: skins ?? [],
  worn,
  choice,
})

/** The choice a kept text says. A text that is not one of the three is no choice. */
export function choiceIn(text: string | null): LookChoice {
  let read: unknown
  try {
    read = JSON.parse(String(text))
  } catch {
    return NONE
  }
  const { kind, name } = (read ?? {}) as Record<string, unknown>
  if (kind === 'builtin') return { kind }
  return kind === 'named' && typeof name === 'string' && name !== '' ? { kind, name } : NONE
}

/** A store that lasts as long as this run: what an application that gives none gets. */
export function memoryLookStore(): LookStore {
  const kept = new Map<string, string>()
  return {
    read: tenant => kept.get(tenant) ?? null,
    write: (tenant, text) => void kept.set(tenant, text),
  }
}

/** Keeps the look of the tenant on show: it steps whenever a person chooses or the skins change, and tells the shell which to wear. */
export function createWear(
  deps: Readonly<{ wear: (look: string | undefined) => void; store: LookStore }>,
): Wear {
  const watchers = new Set<() => void>()
  let open: Open | undefined
  let seen: WearView | undefined

  function show(next: Open | undefined): void {
    open = next
    seen = next === undefined ? undefined : viewOf(next)
    deps.wear(next?.worn)
    for (const listener of Array.from(watchers)) listener()
  }

  let skins: Skins | undefined

  function step(from: Open): void {
    if (skins === undefined) return show(from)
    const { worn, choice } = wearStep(from.choice, skins)
    if (!same(choice, from.choice)) deps.store.write(from.tenant, JSON.stringify(choice))
    show({ ...from, worn, choice })
  }

  return {
    open(tenant) {
      skins = undefined
      show({ tenant, choice: choiceIn(deps.store.read(tenant)), skins: undefined, worn: undefined })
    },
    settle(listed, states) {
      if (open === undefined) return
      const { now, skins: next } = listedOf(listed, states)
      skins = next
      step({ ...open, skins: now })
    },
    close() {
      skins = undefined
      show(undefined)
    },
    view: () => seen,
    choose(choice) {
      if (open === undefined) return
      deps.store.write(open.tenant, JSON.stringify(choice))
      step({ ...open, choice })
    },
    watch(listener) {
      watchers.add(listener)
      return () => void watchers.delete(listener)
    },
  }
}

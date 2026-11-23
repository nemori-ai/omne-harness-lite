import {
  UNWANTED,
  stepSide,
  type Member,
  type SideEvent,
  type SideState,
} from '@omne-harness/plugin-protocol'

/** One plugin as the list has it for this side; `fault` is why it cannot be loaded as listed. */
export type Listed = Readonly<{
  name: string
  version: string
  members: readonly Member[]
  fault?: string
}>

export type Outcome =
  | Readonly<{ kind: 'installed'; remove: () => unknown }>
  | Readonly<{ kind: 'failed'; reason: string }>
  | Readonly<{ kind: 'held' }>

export type LoaderDeps = Readonly<{
  install: (listed: Listed) => Promise<Outcome>
  /** What the last process kept: the plugins the floor held back, and in which version. */
  held?: ReadonlyMap<string, string>
}>

export type Loader = Readonly<{
  converge(list: readonly Listed[]): void
  states(): ReadonlyMap<string, SideState>
  held(): ReadonlyMap<string, string>
  watch(listener: () => void): () => void
  idle(): Promise<void>
  stop(): Promise<void>
}>

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

function attempt(install: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return install()
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  }
}

/** Brings what is loaded to what the list has, one plugin at a time, by the table of `stepSide`. */
export function createLoader(deps: LoaderDeps): Loader {
  const sides = new Map<string, SideState>()
  const live = new Map<string, () => unknown>()
  const listeners = new Set<() => void>()
  const work = new Set<Promise<void>>()
  let latest = new Map<string, Listed>()
  let stopped = false
  for (const [name, version] of deps.held ?? []) sides.set(name, { kind: 'held', version })

  const tagOf = (name: string, version: string): string => `${name}\n${version}`

  function track(job: Promise<void>): void {
    const tracked = job.catch(() => undefined).finally(() => work.delete(tracked))
    work.add(tracked)
  }

  const removing = (remove: (() => unknown) | undefined): void =>
    track(
      Promise.resolve()
        .then(remove)
        .then(() => undefined),
    )

  function unload(name: string, version: string): void {
    const tag = tagOf(name, version)
    removing(live.get(tag))
    live.delete(tag)
  }

  function land(name: string, version: string, outcome: Outcome): void {
    if (stopped) return removing(outcome.kind === 'installed' ? outcome.remove : undefined)
    if (outcome.kind === 'installed') {
      live.set(tagOf(name, version), outcome.remove)
      return move(name, { kind: 'done' })
    }
    move(
      name,
      outcome.kind === 'held' ? { kind: 'held' } : { kind: 'broke', reason: outcome.reason },
    )
  }

  /** A load is asked for only in the version the list has last, so the list has the plugin. */
  function listedNow(name: string): Listed {
    const listed = latest.get(name)
    if (listed === undefined) throw new Error(`${name} is not listed`)
    return listed
  }

  function begin(name: string, version: string): void {
    track(
      attempt(() => deps.install(listedNow(name)))
        .catch((error: unknown): Outcome => ({ kind: 'failed', reason: reasonOf(error) }))
        .then(outcome => land(name, version, outcome)),
    )
  }

  function move(name: string, event: SideEvent): void {
    const before = sides.get(name) ?? UNWANTED
    const step = stepSide(before, event)
    if (step.state.kind === 'unwanted') sides.delete(name)
    else sides.set(name, step.state)
    for (const effect of step.effects) {
      if (effect.kind === 'load') begin(name, effect.version)
      else unload(name, effect.version)
    }
    if (step.state !== before) for (const listener of listeners) listener()
  }

  async function idle(): Promise<void> {
    while (work.size > 0) await Promise.all(work)
  }

  return {
    converge(list) {
      if (stopped) return
      latest = new Map(list.map(each => [each.name, each]))
      for (const each of list) move(each.name, { kind: 'listed', version: each.version })
      for (const name of sides.keys()) if (!latest.has(name)) move(name, { kind: 'unlisted' })
    },
    states: () => new Map(sides),
    held: () =>
      new Map(
        [...sides].flatMap(([name, state]) =>
          state.kind === 'held' ? [[name, state.version] as const] : [],
        ),
      ),
    watch(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    idle,
    async stop() {
      stopped = true
      for (const remove of live.values()) removing(remove)
      await idle()
    },
  }
}

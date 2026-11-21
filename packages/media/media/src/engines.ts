import {
  declarationProblem,
  type ConverterEngine,
  type EngineLease,
  type Engines,
} from '@omne-harness/media-contract'

export type EngineRegistration = Readonly<{
  /** Stops the lending of the engine and tells its leases; settles when they are all back. */
  release(): Promise<void>
}>
export type EngineRegistry = Engines &
  Readonly<{ contribute(engine: ConverterEngine): EngineRegistration }>

type Entry = {
  readonly engine: ConverterEngine
  readonly withdrawal: AbortController
  readonly gone: PromiseWithResolvers<void>
  withdrawn: boolean
  leases: number
}

/** The engines of one tree by name: one engine for a name, lent while it is registered. */
export function createEngineRegistry(): EngineRegistry {
  const registered = new Map<string, Entry>()

  function withdraw(entry: Entry): Promise<void> {
    entry.withdrawn = true
    const { name } = entry.engine.declaration
    if (registered.get(name) === entry) registered.delete(name)
    entry.withdrawal.abort()
    if (entry.leases === 0) entry.gone.resolve()
    return entry.gone.promise
  }

  function lend(entry: Entry): EngineLease {
    entry.leases += 1
    let back = false
    return {
      engine: entry.engine,
      withdrawn: entry.withdrawal.signal,
      release() {
        if (back) return
        back = true
        entry.leases -= 1
        if (entry.withdrawn && entry.leases === 0) entry.gone.resolve()
      },
    }
  }

  return {
    contribute(engine) {
      const problem = declarationProblem(engine.declaration)
      if (problem !== null) throw new TypeError(`a converter engine is refused: ${problem}`)
      const { name } = engine.declaration
      if (registered.has(name))
        throw new TypeError(`a converter engine named "${name}" is registered`)
      const entry: Entry = {
        engine,
        withdrawal: new AbortController(),
        gone: Promise.withResolvers<void>(),
        withdrawn: false,
        leases: 0,
      }
      registered.set(name, entry)
      return { release: () => withdraw(entry) }
    },
    borrow(name) {
      const entry = registered.get(name)
      return entry === undefined ? null : lend(entry)
    },
  }
}

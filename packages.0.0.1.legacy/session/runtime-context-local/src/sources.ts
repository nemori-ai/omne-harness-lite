import { randomUUID } from 'node:crypto'
import type {
  ContextRead,
  ContextSource,
  ContextSourceRegistrations,
  ContextScope,
  ContextSourceHandle,
} from '@omne-harness-lite/runtime-context'
import type { ContextState } from './journal.ts'
import { sameScope } from './values.ts'
import { checkedScope } from './scope.ts'

interface Entry {
  readonly source: ContextSource
  readonly jobs: Set<Promise<unknown>>
  readonly generation: string
  dispose(): Promise<void>
}
interface Watch {
  readonly scope: ContextScope
  readonly keys: ReadonlySet<string>
  readonly complete: boolean
  changed: boolean
}
const rejected = <R extends string>(reason: R) => ({ kind: 'rejected', reason }) as const
function valid(source: ContextSource): boolean {
  return (
    typeof source.name === 'string' &&
    Boolean(source.name) &&
    typeof source.read === 'function' &&
    ['persisted', 'reread_source', 'recompute'].includes(source.recovery) &&
    Array.isArray(source.consumers) &&
    source.consumers.length > 0 &&
    source.consumers.every(v => ['model', 'tool', 'extension'].includes(v)) &&
    new Set(source.consumers).size === source.consumers.length &&
    Array.isArray(source.requiredKeys) &&
    source.requiredKeys.every(v => typeof v === 'string' && Boolean(v)) &&
    new Set(source.requiredKeys).size === source.requiredKeys.length
  )
}
/** Owns source generations and their admitted work, independently of session registrations. */
export function createContextSources(deps: {
  readonly active: () => boolean
  readonly state: (
    scope: ContextScope,
  ) => Promise<{ readonly state: ContextState } | Extract<ContextRead, { kind: 'rejected' }>>
  readonly notify: () => void
}) {
  const entries = new Map<string, Entry>(),
    retiring = new Set<Entry>(),
    watches = new Set<Watch>()
  async function observe<T>(entry: Entry, work: () => Promise<T>): Promise<T> {
    const job = Promise.resolve().then(work)
    entry.jobs.add(job)
    try {
      return await job
    } finally {
      entry.jobs.delete(job)
    }
  }
  function changed(scope: ContextScope, keys: readonly string[], registration = false) {
    for (const watch of watches) {
      if (
        sameScope(scope, watch.scope) &&
        ((registration && watch.complete) || keys.some(key => watch.keys.has(key)))
      )
        watch.changed = true
    }
  }
  const registrations: ContextSourceRegistrations = {
    registerSource(input) {
      if (!deps.active()) throw new Error('runtime context owner stopped')
      if (!input || !valid(input)) throw new TypeError('invalid context source')
      if (entries.has(input.name)) throw new Error('duplicate context source')
      const read = input.read.bind(input)
      let drained: Promise<void> | undefined
      const entry: Entry = {
        generation: randomUUID(),
        jobs: new Set(),
        source: Object.freeze({
          name: input.name,
          recovery: input.recovery,
          consumers: Object.freeze([...input.consumers]),
          requiredKeys: Object.freeze([...input.requiredKeys]),
          read(scope, config) {
            if (!deps.active()) return Promise.resolve(rejected('ownerStopped'))
            if (entries.get(entry.source.name) !== entry)
              return Promise.resolve(rejected('sourceUnavailable'))
            return observe(entry, () => read(scope, config))
          },
        } satisfies ContextSource),
        dispose() {
          if (drained) return drained
          if (entries.get(entry.source.name) === entry) {
            entries.delete(entry.source.name)
            deps.notify()
          }
          retiring.add(entry)
          drained = Promise.allSettled([...entry.jobs]).then(() => {
            retiring.delete(entry)
          })
          return drained
        },
      }
      entries.set(entry.source.name, entry)
      deps.notify()
      return Object.freeze({
        generation: entry.generation,
        dispose: entry.dispose,
        invalidate(inputScope, keys) {
          const scope = checkedScope(inputScope)
          if (
            !scope ||
            !Array.isArray(keys) ||
            keys.some(key => typeof key !== 'string' || !key) ||
            new Set(keys).size !== keys.length
          )
            return Promise.resolve(rejected('invalidInput'))
          const captured = [...keys]
          if (!deps.active()) return Promise.resolve(rejected('ownerStopped'))
          if (entries.get(entry.source.name) !== entry)
            return Promise.resolve(rejected('sourceUnavailable'))
          return observe(entry, async () => {
            const current = await deps.state(scope)
            if ('kind' in current) return current
            if (entries.get(entry.source.name) !== entry) return rejected('sourceUnavailable')
            if (
              captured.some(
                key => current.state.registrations.get(key)?.source !== entry.source.name,
              )
            )
              return rejected('invalidInput')
            changed(scope, captured)
            deps.notify()
            return { kind: 'invalidated' } as const
          })
        },
      } satisfies ContextSourceHandle)
    },
  }
  return {
    registrations,
    get(name: string) {
      return entries.get(name)?.source
    },
    generation(source: ContextSource) {
      const entry = entries.get(source.name)
      return entry?.source === source ? entry.generation : undefined
    },
    current(source: ContextSource) {
      return entries.get(source.name)?.source === source
    },
    changed,
    watch(scope: ContextScope, keys: readonly string[], complete: boolean) {
      const watch: Watch = { scope, keys: new Set(keys), complete, changed: false }
      watches.add(watch)
      return {
        changed: () => watch.changed,
        release: () => {
          watches.delete(watch)
        },
      }
    },
    async drain() {
      await Promise.all(
        [...new Set([...entries.values(), ...retiring])].map(entry => entry.dispose()),
      )
    },
  }
}

/** The parts of one cache key. Every part must match for a hit. */
export type ReadCacheKey = Readonly<{
  /** The tenant the trusted binding confirmed for this read. */
  tenant: string
  /** The scope reference text. */
  scope: string
  /** The current eligibility, after following supersession. */
  eligibility: string
  /** The current registration revision of the scope. */
  registration: number
  /** The projection version of the scope. */
  projection: number
}>

export type ReadCacheEvent = 'hit' | 'miss' | 'evicted'

type Entry<V> = Readonly<{ scope: string; eligibility: string; value: V }>

/**
 * A bounded least-recently-used map of read results. It holds no permission: a caller looks it up
 * only after every access check of the read has passed, and discloses only after its own final
 * check. A capacity of 0 keeps nothing.
 */
export function createReadCache<V>(capacity: number, report: (event: ReadCacheEvent) => void) {
  const entries = new Map<string, Entry<V>>()
  const text = (key: ReadCacheKey) =>
    JSON.stringify([key.tenant, key.scope, key.eligibility, key.registration, key.projection])
  function drop(match: (entry: Entry<V>) => boolean) {
    for (const [id, entry] of entries) if (match(entry)) entries.delete(id)
  }
  return {
    get size() {
      return entries.size
    },
    get enabled() {
      return capacity > 0
    },
    get(key: ReadCacheKey): V | undefined {
      if (capacity === 0) return undefined
      const id = text(key)
      const entry = entries.get(id)
      report(entry ? 'hit' : 'miss')
      if (!entry) return undefined
      entries.delete(id)
      entries.set(id, entry)
      return entry.value
    },
    set(key: ReadCacheKey, value: V): void {
      if (capacity === 0) return
      const id = text(key)
      entries.delete(id)
      entries.set(id, { scope: key.scope, eligibility: key.eligibility, value })
      for (const oldest of entries.keys()) {
        if (entries.size <= capacity) break
        entries.delete(oldest)
        report('evicted')
      }
    },
    /** Frees the entries of one scope. Correctness never depends on it: keys carry the projection. */
    dropScope(scope: string): void {
      drop(entry => entry.scope === scope)
    },
    dropEligibility(eligibility: string): void {
      drop(entry => entry.eligibility === eligibility)
    },
    clear(): void {
      entries.clear()
    },
  }
}

export type ReadCache<V> = ReturnType<typeof createReadCache<V>>

import type { UsageSource } from '@omne-harness/usage-contract'
import type { UsageRegistration, UsageSources } from '@omne-harness/usage-cordis-contract'

/** The registry of sources: a second source of a taken name is refused and the first kept. */
export function createUsageSources<P>(): UsageSources<P> {
  const entries: { source: UsageSource<P> }[] = []
  return {
    register(source): UsageRegistration {
      if (entries.some(entry => entry.source.name === source.name))
        return { kind: 'conflict', name: source.name }
      const entry = { source }
      entries.push(entry)
      return {
        kind: 'registered',
        withdraw() {
          const at = entries.indexOf(entry)
          if (at !== -1) entries.splice(at, 1)
        },
      }
    },
    current: () => entries.map(entry => entry.source),
  }
}

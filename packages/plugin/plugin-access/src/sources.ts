import type { PluginSource, SourcePlugin, SourceRead } from './ports.ts'

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' as const })
const ABSENT: SourceRead = Object.freeze({ kind: 'absent', what: 'plugin' })

/** Several sources as one: it offers what each offers, and is unavailable when one of them is. */
export function combineSources(sources: readonly PluginSource[]): PluginSource {
  return {
    async list(asker) {
      const offered: SourcePlugin[] = []
      for (const source of sources) {
        const listed = await source.list(asker).catch(() => UNAVAILABLE)
        if (listed.kind !== 'read') return UNAVAILABLE
        offered.push(...listed.offered)
      }
      return { kind: 'read', offered }
    },
    async read(asker, at) {
      for (const source of sources) {
        const read = await source.read(asker, at).catch(() => UNAVAILABLE)
        if (read.kind !== 'absent' || read.what !== 'plugin') return read
      }
      return ABSENT
    },
    subscribe(tenant, listener) {
      const stops = sources.map(source => source.subscribe(tenant, listener))
      return () => {
        for (const stop of stops) stop()
      }
    },
  }
}

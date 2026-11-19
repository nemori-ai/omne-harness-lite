import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { ServiceKey } from '@omne-harness/shell-contract'

export type Holder<T> = Readonly<{ attach(given: T): () => void }>

// Hands the service under `source` to the holder while both are on the client tree. Either may
// be away: the holder's module then works without what it would be given.
export function handOver<T>(holder: ServiceKey<Holder<T>>, source: ServiceKey<T>): Plugin.Object {
  return {
    name: `hand-over:${source}->${holder}`,
    inject: [holder, source],
    apply(ctx: Context) {
      const lookup = ctx as unknown as { get(name: string): unknown }
      const place = lookup.get(holder) as Holder<T>
      const given = lookup.get(source) as T
      ctx.effect(() => place.attach(given), 'hand-over')
    },
  }
}

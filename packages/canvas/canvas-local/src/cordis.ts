import type { Context } from '@deepseek-ai/cordis'
import { createCanvas } from '@omne-harness/canvas'
import type { CanvasAuthority, CanvasMovers, CanvasOperations } from '@omne-harness/canvas-contract'
import { CanvasService, kindsOn } from '@omne-harness/canvas-cordis-contract/cordis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { parsePolicy } from './policy.ts'
import { createSqlCanvasStore, type CanvasSqlOptions } from './storage/store.ts'

/** What the assembly gives: everything but the storage and the registry, which are injected. */
export type CanvasLocalConfiguration = Readonly<{
  /** Read when the provider loads; missing or invalid, it does not load. */
  policy: unknown
  sql: Pick<CanvasSqlOptions, 'bind'>
  ports: Readonly<{ authority: CanvasAuthority; movers: CanvasMovers }>
}>

class LocalCanvas extends CanvasService {
  readonly look: CanvasOperations['look']
  readonly kinds: CanvasOperations['kinds']
  constructor(ctx: Context, face: CanvasOperations) {
    super(ctx)
    this.look = face.look
    this.kinds = face.kinds
  }
}

/** The canvas over SQL, its kinds read from the registry at each call. */
export function createCanvasLocalPlugin() {
  return {
    name: 'canvas-local',
    inject: [storageKey, dynamisKey],
    async apply(ctx: Context, config: CanvasLocalConfiguration) {
      const policy = parsePolicy(config.policy)
      const store = createSqlCanvasStore({
        storage: ctx.get(storageKey) as SqlStorage,
        bind: config.sql.bind,
      })
      const face = createCanvas({
        store,
        authority: config.ports.authority,
        movers: config.ports.movers,
        kinds: kindsOn(ctx.get(dynamisKey) as DynamisService),
        sheet: policy.sheet,
      })
      await ctx.plugin(LocalCanvas, face).await()
    },
  }
}

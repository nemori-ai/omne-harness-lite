import type { Context } from '@deepseek-ai/cordis'
import { createCanvas } from '@omne-harness/canvas'
import {
  instantSchema,
  type CanvasAuthority,
  type CanvasMovers,
  type CanvasOperations,
} from '@omne-harness/canvas-contract'
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
  readonly lookAway: CanvasOperations['lookAway']
  readonly kinds: CanvasOperations['kinds']
  readonly place: CanvasOperations['place']
  readonly arrange: CanvasOperations['arrange']
  readonly take: CanvasOperations['take']
  readonly pile: CanvasOperations['pile']
  readonly scatter: CanvasOperations['scatter']
  readonly lock: CanvasOperations['lock']
  constructor(ctx: Context, face: CanvasOperations) {
    super(ctx)
    this.look = face.look
    this.lookAway = face.lookAway
    this.kinds = face.kinds
    this.place = face.place
    this.arrange = face.arrange
    this.take = face.take
    this.pile = face.pile
    this.scatter = face.scatter
    this.lock = face.lock
  }
}

const clock = {
  now: () =>
    instantSchema.parse(
      /* wall-clock: clock-source -- the clock of the canvas in this tree: when an arrangement changed */ new Date().toISOString(),
    ),
}

/** The canvas over SQL, its kinds read from the registry at each call, its clock the system's. */
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
        clock,
        config: policy,
      })
      await ctx.plugin(LocalCanvas, face).await()
    },
  }
}

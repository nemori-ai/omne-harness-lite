import type { Context } from '@deepseek-ai/cordis'
import { createCanvas, createCanvasChanges, observed } from '@omne-harness/canvas'
import {
  instantSchema,
  type CanvasAuthority,
  type CanvasChangeFeed,
  type CanvasMovers,
  type CanvasOperations,
} from '@omne-harness/canvas-contract'
import {
  CanvasChangesService,
  CanvasService,
  kindsOn,
} from '@omne-harness/canvas-cordis-contract/cordis'
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

class LocalCanvasChanges extends CanvasChangesService {
  readonly subscribe: CanvasChangeFeed['subscribe']
  constructor(ctx: Context, feed: CanvasChangeFeed) {
    super(ctx)
    this.subscribe = feed.subscribe
  }
}

const clock = {
  now: () =>
    instantSchema.parse(
      /* wall-clock: clock-source -- the clock of the canvas in this tree: when an arrangement changed */ new Date().toISOString(),
    ),
}

/** The canvas over SQL, its kinds read from the registry at each call, its clock the system's. Each
 * commit that changed an arrangement, or may have, is told to the observers of its tenant. */
export function createCanvasLocalPlugin() {
  return {
    name: 'canvas-local',
    inject: [storageKey, dynamisKey],
    async apply(ctx: Context, config: CanvasLocalConfiguration) {
      const policy = parsePolicy(config.policy)
      const changes = createCanvasChanges(error =>
        ctx.logger('canvas-local').warn('a canvas observer threw: %s', error),
      )
      ctx.effect(() => () => changes.close(), 'canvas-local.changes')
      const store = createSqlCanvasStore({
        storage: ctx.get(storageKey) as SqlStorage,
        bind: config.sql.bind,
      })
      const face = createCanvas({
        store: observed(store, changes),
        authority: config.ports.authority,
        movers: config.ports.movers,
        kinds: kindsOn(ctx.get(dynamisKey) as DynamisService),
        clock,
        config: policy,
      })
      await Promise.all([
        ctx.plugin(LocalCanvas, face).await(),
        ctx.plugin(LocalCanvasChanges, changes).await(),
      ])
    },
  }
}

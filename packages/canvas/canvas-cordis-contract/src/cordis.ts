import { Service, type Context } from '@deepseek-ai/cordis'
import {
  kindNameSchema,
  type Admission,
  type AdmitInput,
  type CanvasChangeFeed,
  type CanvasKinds,
  type CanvasOperations,
  type KindDeclaration,
  type KindEntry,
  type KindListing,
  type KindName,
} from '@omne-harness/canvas-contract'
import {
  declare,
  deployment,
  list,
  type Contract,
  type Entry,
  type Instance,
} from '@omne-harness/dynamis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'

/** The point on the server's tree where a domain declares a kind that may be put on the canvas. Its keys are public. */
export const CANVAS_KINDS_POINT = 'canvas.kinds'

export const canvasKindsContract: Contract = Object.freeze({
  name: CANVAS_KINDS_POINT,
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name of the kind, <domain>.<name>',
  gives:
    'when admit is called: the tenant and the subject that act, the identity of the reference, and the holder fixed by the tenant, the canvas and the reference',
  item: Object.freeze({
    kind: 'effect',
    fields: Object.freeze({
      name: 'string',
      label: 'string',
      summary: 'string',
      reference: 'string',
    }),
  }),
  resolve: 'conflict',
  binding: 'run',
  onError:
    'an admit that throws or passes the time limit makes place answer an unavailable basis; one that answers unknown makes it answer unknown; neither puts a record on the canvas',
  version: 1,
  revision: 1,
  keys: 'public',
  conformance: null,
  scopes: {
    only: 'deployment',
    why: 'one-per-process',
    note: 'The canvas asks this point for the whole deployment, not for the tenant who draws, so a kind a tenant put here would not be drawn.',
  } as const,
  summary:
    'The kinds that may be put on the canvas: each item is the one declaration of a kind, with an optional admit asked before a reference of it is put on.',
})

/** @owner packages/canvas/canvas-cordis-contract */
export abstract class CanvasService extends Service implements CanvasOperations {
  static readonly provide = 'canvas'

  /** The service owns the point: while it is there, `canvas.kinds` is declared. */
  constructor(ctx: Context) {
    super(ctx, CanvasService.provide)
    const tree = ctx.get(dynamisKey) as DynamisService
    tree.put([declare(canvasKindsContract)])
  }

  abstract readonly look: CanvasOperations['look']
  abstract readonly lookAway: CanvasOperations['lookAway']
  abstract readonly kinds: CanvasOperations['kinds']
  abstract readonly place: CanvasOperations['place']
  abstract readonly arrange: CanvasOperations['arrange']
  abstract readonly take: CanvasOperations['take']
  abstract readonly pile: CanvasOperations['pile']
  abstract readonly scatter: CanvasOperations['scatter']
  abstract readonly lock: CanvasOperations['lock']
}
export const canvasKey = CanvasService.provide

/** @owner packages/canvas/canvas-cordis-contract */
export abstract class CanvasChangesService extends Service implements CanvasChangeFeed {
  static readonly provide = 'canvasChanges'

  constructor(ctx: Context) {
    super(ctx, CanvasChangesService.provide)
  }

  abstract readonly subscribe: CanvasChangeFeed['subscribe']
}
export const canvasChangesKey = CanvasChangesService.provide

/** How a place holds the batch of a declaration: entered while the batch is not leaving, left once. */
type Hold = Readonly<{ enter(): boolean; exit(): void }>
const HOLD = Symbol('canvas.kinds hold')
type Held = KindDeclaration & { readonly [HOLD]?: Hold }

function entryOf(item: Held, by: Instance): Entry<Held> {
  return {
    point: CANVAS_KINDS_POINT,
    key: item.name,
    id: '',
    scope: deployment,
    rank: 0,
    digest: `${item.name}@${by.fiber}#${by.generation}`,
    item,
  }
}

const NOT_TAKEN: Admission = Object.freeze({ kind: 'basis-unavailable' })

/** Puts one declaration as an effect of the caller. Its batch drains: once it leaves no place takes it and no admit
 * goes to the owner; it goes when the places that took it have their outcome, a time limit passed included. */
export function putKind(ctx: Context, declaration: KindDeclaration): () => unknown {
  if (!kindNameSchema.safeParse(declaration.name).success)
    throw new TypeError(`${JSON.stringify(declaration.name)} is not the name of a kind`)
  // Taken from the caller's context: Cordis gives each caller its own view, so the batch is the caller's.
  const tree = ctx.get(dynamisKey) as DynamisService
  let inFlight = 0
  let leaving = false
  let drained: (() => void) | undefined
  const hold: Hold = {
    enter() {
      if (leaving) return false
      inFlight += 1
      return true
    },
    exit() {
      inFlight -= 1
      if (leaving && inFlight === 0) drained?.()
    },
  }
  const { admit } = declaration
  const handed = async (input: AdmitInput): Promise<Admission> =>
    leaving ? NOT_TAKEN : admit!(input)
  let draining: Promise<void> | undefined
  const drain = (): Promise<void> => {
    leaving = true
    draining ??=
      inFlight === 0 ? Promise.resolve() : new Promise(resolve => void (drained = resolve))
    return draining
  }
  const item: Held = Object.freeze({
    ...declaration,
    ...(admit === undefined ? {} : { admit: handed }),
    [HOLD]: hold,
  })
  const off = tree.put(by => [entryOf(item, by)], { drain })
  return () => drain().then(off)
}

const byName = (left: KindListing, right: KindListing) =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0

export function kindsOn(tree: Pick<DynamisService, 'registry'>): CanvasKinds {
  return {
    read() {
      const listing = list<KindDeclaration>(tree.registry(), CANVAS_KINDS_POINT, null, deployment)
      if (listing.kind !== 'read') return { kind: 'unavailable' }
      const declared = listing.items.map(({ entry }): KindListing => {
        const { label, summary, reference } = entry.item
        return { kind: 'declared', name: entry.key as KindName, label, summary, reference }
      })
      const conflicts = listing.conflicts.map((entries): KindListing => {
        const by = [...new Set(entries.map(entry => entry.instance.fiber))].sort()
        return { kind: 'conflict', name: entries[0]!.key as KindName, by }
      })
      return { kind: 'read', kinds: [...declared, ...conflicts].sort(byName) }
    },

    enter(name): KindEntry {
      const read = () => list<Held>(tree.registry(), CANVAS_KINDS_POINT, name, deployment)
      const listing = read()
      if (listing.kind !== 'read') return { kind: 'unavailable' }
      const [conflict] = listing.conflicts
      if (conflict !== undefined)
        return {
          kind: 'conflict',
          by: [...new Set(conflict.map(entry => entry.instance.fiber))].sort(),
        }
      const item = listing.items[0]?.entry.item
      const hold = item?.[HOLD]
      if (item === undefined || hold?.enter() === false) return { kind: 'undeclared' }
      let left = false
      return {
        kind: 'declared',
        ...(item.admit === undefined ? {} : { admit: item.admit }),
        declared() {
          const again = read()
          return (
            again.kind === 'read' &&
            again.conflicts.length === 0 &&
            again.items[0]?.entry.item === item
          )
        },
        leave() {
          if (left) return
          left = true
          hold?.exit()
        },
      }
    },
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    canvas: CanvasService
    canvasChanges: CanvasChangesService
  }
}

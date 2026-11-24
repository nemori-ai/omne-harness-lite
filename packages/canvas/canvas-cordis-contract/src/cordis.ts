import { Service, type Context } from '@deepseek-ai/cordis'
import {
  kindNameSchema,
  type Admission,
  type AdmitInput,
  type CanvasKinds,
  type CanvasOperations,
  type KindDeclaration,
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
  abstract readonly kinds: CanvasOperations['kinds']
}
export const canvasKey = CanvasService.provide

function entryOf(declaration: KindDeclaration, by: Instance): Entry<KindDeclaration> {
  return {
    point: CANVAS_KINDS_POINT,
    key: declaration.name,
    id: '',
    scope: deployment,
    rank: 0,
    digest: `${declaration.name}@${by.fiber}#${by.generation}`,
    item: Object.freeze({ ...declaration }),
  }
}

const NOT_TAKEN: Admission = Object.freeze({ kind: 'basis-unavailable' })

/**
 * Puts the declaration of one kind on `canvas.kinds` as an effect of the caller: it is there while
 * the caller is. A declaration with `admit` is put in a batch that drains: its admits in flight are
 * counted, none is taken once it leaves, and it is taken off when the count is back at zero.
 */
export function putKind(ctx: Context, declaration: KindDeclaration): () => unknown {
  if (!kindNameSchema.safeParse(declaration.name).success)
    throw new TypeError(`${JSON.stringify(declaration.name)} is not the name of a kind`)
  // Taken from the caller's context: Cordis gives each caller its own view, so the batch is the caller's.
  const tree = ctx.get(dynamisKey) as DynamisService
  const { admit } = declaration
  if (admit === undefined) return tree.put(by => [entryOf(declaration, by)])

  let inFlight = 0
  let leaving = false
  let drained: (() => void) | undefined
  const counted = async (input: AdmitInput): Promise<Admission> => {
    if (leaving) return NOT_TAKEN
    inFlight += 1
    try {
      return await admit(input)
    } finally {
      inFlight -= 1
      if (leaving && inFlight === 0) drained?.()
    }
  }
  const drain = (): Promise<void> => {
    leaving = true
    return inFlight === 0 ? Promise.resolve() : new Promise(resolve => void (drained = resolve))
  }
  return tree.put(by => [entryOf({ ...declaration, admit: counted }, by)], { drain })
}

const byName = (left: KindListing, right: KindListing) =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0

/** The kinds on the registry at the moment of each read. A point that cannot be read is unavailable. */
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
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    canvas: CanvasService
  }
}

import {
  parseLook,
  type CallContext,
  type CanvasAuthority,
  type CanvasKinds,
  type CanvasMovers,
  type CanvasOperations,
  type KindListing,
  type LookAnswer,
  type ReadAnswer,
  type Sheet,
} from '@omne-harness/canvas-contract'
import type { CanvasStore } from './store.ts'

export type CanvasPorts = Readonly<{
  store: CanvasStore
  authority: CanvasAuthority
  /** Who a change is by; a read does not ask it. */
  movers: CanvasMovers
  kinds: CanvasKinds
  /** The sheet as configured; it is given with every read of the canvas. */
  sheet: Sheet
}>

const DENIED = Object.freeze({ kind: 'denied' as const })
const UNAVAILABLE = Object.freeze({ kind: 'basis-unavailable' as const })

type Refusal = typeof DENIED | typeof UNAVAILABLE

/** Asks the authority; a failure to answer is an unavailable basis, never an allowance. */
async function mayRead(authority: CanvasAuthority, ctx: CallContext): Promise<Refusal | null> {
  let answer: Awaited<ReturnType<CanvasAuthority['decide']>>
  try {
    answer = await authority.decide(ctx, 'read')
  } catch {
    return UNAVAILABLE
  }
  if (answer === 'allowed') return null
  return answer === 'denied' ? DENIED : UNAVAILABLE
}

/** The reads of the canvas. A basis that cannot be read answers unavailable, never an empty canvas. */
export function createCanvas(ports: CanvasPorts): CanvasOperations {
  const { store, authority, kinds, sheet } = ports
  return {
    async look(ctx, input): Promise<LookAnswer> {
      const request = parseLook(input)
      if ('invalid' in request) return { kind: 'invalid', where: request.invalid }
      const refused = await mayRead(authority, ctx)
      if (refused !== null) return refused
      let read: Awaited<ReturnType<CanvasStore['look']>>
      try {
        read = await store.look(ctx.tenant, request.ok.canvas)
      } catch {
        return UNAVAILABLE
      }
      if (read.kind !== 'read') return UNAVAILABLE
      return { kind: 'done', value: { sheet, ...read.value } }
    },

    async kinds(ctx): Promise<ReadAnswer<readonly KindListing[]>> {
      const refused = await mayRead(authority, ctx)
      if (refused !== null) return refused
      let read: ReturnType<CanvasKinds['read']>
      try {
        read = kinds.read()
      } catch {
        return UNAVAILABLE
      }
      return read.kind === 'read' ? { kind: 'done', value: read.kinds } : UNAVAILABLE
    },
  }
}

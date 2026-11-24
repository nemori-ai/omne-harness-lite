import type {
  CanvasBody,
  CanvasItemBody,
  CanvasKindBody,
  CanvasProtocol,
} from '@omne-harness/canvas-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'

export type CanvasClient = ClientOf<CanvasProtocol>

/** The one canvas a tenant has. */
export const MAIN_CANVAS = 'main'

/** Why a read gave nothing to draw: refused, or not readable now. Neither is an empty canvas. */
export type Unreadable = 'denied' | 'unavailable'

export type Reading<T> =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'read'; value: T }>
  | Readonly<{ kind: 'unreadable'; reason: Unreadable }>

export const READING = { kind: 'reading' } as const

export const UNREADABLE_TEXT: Readonly<Record<Unreadable, string>> = {
  denied: '没有权限看这张画布。',
  unavailable: '现在读不到画布。',
}

type Answer = Readonly<{ outcome: string; body?: unknown }>

/** A read that did not succeed, and one that never came back, are both something other than what was read. */
async function settled<T>(
  asked: () => Promise<Answer>,
  pick: (body: unknown) => T,
): Promise<Reading<T>> {
  try {
    const answer = await asked()
    if (answer.outcome === 'succeeded') return { kind: 'read', value: pick(answer.body) }
    return { kind: 'unreadable', reason: answer.outcome === 'denied' ? 'denied' : 'unavailable' }
  } catch {
    return { kind: 'unreadable', reason: 'unavailable' }
  }
}

export const readLook = (client: CanvasClient, tenant: TenantId): Promise<Reading<CanvasBody>> =>
  settled(
    () => client.look({ tenant, canvas: MAIN_CANVAS }),
    body => body as CanvasBody,
  )

export const readKinds = (
  client: CanvasClient,
  tenant: TenantId,
): Promise<Reading<readonly CanvasKindBody[]>> =>
  settled(
    () => client.kinds({ tenant }),
    body => (body as { kinds: readonly CanvasKindBody[] }).kinds,
  )

/** A page of the taken records; `next` reads on from here, none when this was the last. */
export type AwayPage = Readonly<{ items: readonly CanvasItemBody[]; next: number | null }>

export const readAway = (
  client: CanvasClient,
  tenant: TenantId,
  limit: number,
  before?: number,
): Promise<Reading<AwayPage>> =>
  settled(
    () =>
      client['look-away']({
        tenant,
        canvas: MAIN_CANVAS,
        limit,
        ...(before === undefined ? {} : { before }),
      }),
    body => body as AwayPage,
  )

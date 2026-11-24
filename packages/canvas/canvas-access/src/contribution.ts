import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import type { CallContext, ReadAnswer } from '@omne-harness/canvas-contract'
import type { CanvasProtocol } from '@omne-harness/canvas-protocol'
import type { TenantId } from '@omne-harness/legal-identity'
import type { CanvasFace, CanvasPrincipals } from './ports.ts'
import { canvasOf, kindOf, tenantTextOf } from './projection.ts'

export type CanvasContributionInput = Readonly<{
  principals: CanvasPrincipals
  face: () => CanvasFace | undefined
}>

type Handlers = AccessContribution<CanvasProtocol>['operations']
type Login = Parameters<CanvasPrincipals['actingFor']>[0]

/** Both carry no body: a refusal to one tenant reads the same as a refusal to any other. */
const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })

type Ready = Readonly<{ outcome: null; face: CanvasFace; ctx: CallContext }>

/** Steps one to three: the login acts for the tenant, the principal is current, the canvas is here. */
async function prepare(
  input: CanvasContributionInput,
  login: Login,
  tenant: TenantId,
): Promise<Ready | typeof DENIED | typeof UNAVAILABLE> {
  const tenantText = tenantTextOf(tenant)
  let issued: Awaited<ReturnType<CanvasPrincipals['actingFor']>>
  try {
    issued = await input.principals.actingFor(login, tenantText)
  } catch {
    return UNAVAILABLE
  }
  if ('refused' in issued) return issued.refused === 'denied' ? DENIED : UNAVAILABLE
  const ctx = input.principals.contextOf(issued.ok, tenantText)
  const face = input.face()
  if (face === undefined) return UNAVAILABLE
  return { outcome: null, face, ctx }
}

/** Step four: a throw, like a read the canvas could not make, is an unavailable basis. */
async function asking<A>(call: () => Promise<A>): Promise<A | typeof UNAVAILABLE> {
  try {
    return await call()
  } catch {
    return UNAVAILABLE
  }
}

function settled<T, D>(answer: ReadAnswer<T> | typeof UNAVAILABLE, done: (value: T) => D) {
  if ('outcome' in answer) return answer
  switch (answer.kind) {
    case 'done':
      return { outcome: 'succeeded' as const, body: done(answer.value) }
    case 'denied':
      return DENIED
    case 'basis-unavailable':
      return UNAVAILABLE
  }
}

/** The handlers of canvas/v1: each takes the canvas at its call and maps what the canvas answers. */
export function createCanvasContribution(
  input: CanvasContributionInput,
): Omit<AccessContribution<CanvasProtocol>, 'protocol'> {
  const look: Handlers['look'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const answer = await asking(() => ready.face.look(ready.ctx, { canvas: body.canvas }))
    if ('kind' in answer && answer.kind === 'invalid')
      return { outcome: 'invalid', body: { reason: answer.where } }
    return settled(answer, canvasOf)
  }

  const kinds: Handlers['kinds'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const answer = await asking(() => ready.face.kinds(ready.ctx))
    return settled(answer, listed => ({ kinds: listed.map(kindOf) }))
  }

  return { operations: { look, kinds }, observations: {} }
}

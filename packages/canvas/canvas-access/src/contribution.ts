import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import type { CallContext, ChangeAnswer } from '@omne-harness/canvas-contract'
import type { CanvasProtocol } from '@omne-harness/canvas-protocol'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  DENIED,
  UNAVAILABLE,
  UNKNOWN,
  awayOf,
  changeOf,
  lookOf,
  placeOf,
  readOf,
} from './answers.ts'
import { createCanvasObservation } from './observe-changes.ts'
import type { CanvasChanges, CanvasFace, CanvasPrincipals } from './ports.ts'
import { kindOf, tenantTextOf } from './projection.ts'

export type CanvasContributionInput = Readonly<{
  principals: CanvasPrincipals
  face: () => CanvasFace | undefined
  changes: () => CanvasChanges | undefined
}>

type Handlers = AccessContribution<CanvasProtocol>['operations']
type Login = Parameters<CanvasPrincipals['actingFor']>[0]
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

/** Step four of a read: a throw, like a read the canvas could not make, is an unavailable basis. */
async function reading<A>(call: () => Promise<A>): Promise<A | typeof UNAVAILABLE> {
  try {
    return await call()
  } catch {
    return UNAVAILABLE
  }
}

/** Step four of a write: after a throw nobody knows whether the arrangement was committed. */
async function committing<A>(call: () => Promise<A>): Promise<A | typeof UNKNOWN> {
  try {
    return await call()
  } catch {
    return UNKNOWN
  }
}

/** The request the canvas reads: the body without the tenant, which the context carries. */
function requestOf(body: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([name]) => name !== 'tenant'))
}

type Input = CanvasContributionInput

const look =
  (input: Input): Handlers['look'] =>
  async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return lookOf(await reading(() => ready.face.look(ready.ctx, { canvas: body.canvas })))
  }

const lookAway =
  (input: Input): Handlers['look-away'] =>
  async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return awayOf(await reading(() => ready.face.lookAway(ready.ctx, requestOf(body))))
  }

const kinds =
  (input: Input): Handlers['kinds'] =>
  async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const answer = await reading(() => ready.face.kinds(ready.ctx))
    return readOf(answer, listed => ({ kinds: listed.map(kindOf) }))
  }

const place =
  (input: Input): Handlers['place'] =>
  async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return placeOf(await committing(() => ready.face.place(ready.ctx, requestOf(body))))
  }

/** The five writes of a batch answer alike; each calls the operation of the canvas it is given. */
const batch =
  (
    input: Input,
    write: (face: CanvasFace, ctx: CallContext, request: object) => Promise<ChangeAnswer>,
  ) =>
  async (call: Readonly<{ principal: Login }>, body: Readonly<{ tenant: TenantId }>) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return changeOf(await committing(() => write(ready.face, ready.ctx, requestOf(body))))
  }

/** The handlers of canvas/v1: each takes the canvas at its call and maps what the canvas answers. */
export function createCanvasContribution(
  input: Input,
): Omit<AccessContribution<CanvasProtocol>, 'protocol'> {
  return {
    operations: {
      look: look(input),
      'look-away': lookAway(input),
      kinds: kinds(input),
      place: place(input),
      arrange: batch(input, (face, ctx, request) => face.arrange(ctx, request)),
      take: batch(input, (face, ctx, request) => face.take(ctx, request)),
      pile: batch(input, (face, ctx, request) => face.pile(ctx, request)),
      scatter: batch(input, (face, ctx, request) => face.scatter(ctx, request)),
      lock: batch(input, (face, ctx, request) => face.lock(ctx, request)),
    },
    observations: { 'observe-changes': createCanvasObservation(input) },
  }
}

import type {
  AccessContribution,
  EndOf,
  FrameOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { StreamFrame } from '@omne-harness/stream-arrival'
import type {
  ToolFailure,
  ToolInvocationRef,
  ToolResultVersion,
  ToolStreamDelta,
  ToolStreamEnd,
  ToolStreamSnapshot,
} from '@omne-harness/tool-contract'
import type { ToolProtocol } from '@omne-harness/tool-protocol'
import type { ToolCallFaces, ToolCallPrincipals } from './ports.ts'
import { callView, jsonOf, resultView } from './view.ts'

export type ToolAccessContributionInput = Readonly<{
  faces: () => ToolCallFaces | undefined
  principals: ToolCallPrincipals
}>

type Contribution = Omit<AccessContribution<ToolProtocol>, 'protocol'>
type ObserveCall = ToolProtocol['observations']['observe-call']
type Frame = StreamFrame<ToolStreamSnapshot, ToolStreamDelta, ToolStreamEnd>
type Refusal = Readonly<{ outcome: 'denied' | 'basis-unavailable' }>
type Reading = Readonly<{ access: Access<Principal>; faces: ToolCallFaces }>

const DENIED: Refusal = Object.freeze({ outcome: 'denied' })
const UNAVAILABLE: Refusal = Object.freeze({ outcome: 'basis-unavailable' })

function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('tool-access: tenant is not a minted TenantId')
  return encoded.value
}

// A reference of another tenant, one the login may not read, one that does not parse and one
// whose call does not exist all reach Tool as one failure or another; each answers `denied`.
function refusalOf(failure: ToolFailure): Refusal {
  return failure.kind === 'unavailable' || failure.kind === 'stale-instance' ? UNAVAILABLE : DENIED
}

async function guarded<T>(read: () => Promise<T>): Promise<T | typeof UNAVAILABLE> {
  try {
    return await read()
  } catch {
    return UNAVAILABLE
  }
}

async function readingOf(
  input: ToolAccessContributionInput,
  login: LoginIdentity,
  tenant: TenantId,
): Promise<Reading | Refusal> {
  let issued: Awaited<ReturnType<ToolCallPrincipals['actingFor']>>
  try {
    issued = await input.principals.actingFor(login, tenantTextOf(tenant))
  } catch {
    return UNAVAILABLE
  }
  if ('refused' in issued) return { outcome: issued.refused }
  const faces = input.faces()
  return faces === undefined ? UNAVAILABLE : { access: { principal: issued.ok, tenant }, faces }
}

function endOf(frame: Extract<Frame, { kind: 'ended' }>): EndOf<ObserveCall> {
  switch (frame.reason) {
    case 'producer-ended':
      return frame.value.reason
    case 'source-closed':
    case 'observer-closed':
      return 'closed'
    case 'stale-stream':
      return 'stale-instance'
    case 'denied':
      return 'denied'
    case 'unavailable':
    case 'capacity':
      return 'unavailable'
  }
}

async function* framesOf(
  source: AsyncIterable<Frame>,
): AsyncGenerator<FrameOf<ObserveCall>, EndOf<ObserveCall>> {
  const iterator = source[Symbol.asyncIterator]()
  try {
    for (;;) {
      const step = await iterator.next()
      if (step.done === true) return 'closed'
      const frame = step.value
      if (frame.kind === 'ended') return endOf(frame)
      if (frame.kind === 'gap') yield { kind: 'gap' }
      else if (frame.kind === 'snapshot')
        yield {
          kind: 'snapshot',
          call: callView(frame.value.state),
          process: jsonOf(frame.value.process),
        }
      else
        yield {
          kind: 'delta',
          call: callView(frame.value.state),
          process: jsonOf(frame.value.blocks),
        }
    }
  } finally {
    await iterator.return?.()
  }
}

async function* settledFrames(
  snapshot: FrameOf<ObserveCall>,
): AsyncGenerator<FrameOf<ObserveCall>, EndOf<ObserveCall>> {
  yield snapshot
  return 'closed'
}

/** The handlers of `tool/v1`: each reads one call of the tenant by its reference, never writes. */
export function createToolAccessContribution(input: ToolAccessContributionInput): Contribution {
  const selectionOf = async (reading: Reading, reference: string) => {
    const selected = await guarded(() =>
      reading.faces.instances.current({
        access: reading.access,
        reference: reference as ToolInvocationRef,
      }),
    )
    if ('outcome' in selected) return selected
    return 'failure' in selected ? refusalOf(selected.failure) : selected.ok
  }

  const readCall: Contribution['operations']['read-call'] = async (call, body) => {
    const reading = await readingOf(input, call.principal, body.tenant)
    if ('outcome' in reading) return reading
    const selection = await selectionOf(reading, body.reference)
    if ('outcome' in selection) return selection
    return { outcome: 'succeeded', body: { call: callView(selection.state) } }
  }

  const readCallResult: Contribution['operations']['read-call-result'] = async (call, body) => {
    const reading = await readingOf(input, call.principal, body.tenant)
    if ('outcome' in reading) return reading
    const page = await guarded(() =>
      reading.faces.queries.readResult({
        ...reading.access,
        reference: body.reference as ToolInvocationRef,
        result: body.result as ToolResultVersion,
        after: body.cursor,
      }),
    )
    if ('outcome' in page) return page
    if ('failure' in page) return refusalOf(page.failure)
    return { outcome: 'succeeded', body: resultView(page.ok) }
  }

  const observeCall: Contribution['observations']['observe-call'] = async (context, open) => {
    const reading = await readingOf(input, context.principal, open.tenant)
    if ('outcome' in reading) return reading
    const selection = await selectionOf(reading, open.reference)
    if ('outcome' in selection) return selection
    if (selection.current === null)
      return {
        outcome: 'succeeded',
        frames: settledFrames({
          kind: 'snapshot',
          call: callView(selection.state),
          process: jsonOf([]),
        }),
      }
    const source = reading.faces.observation.observe({
      ref: selection.current.ref,
      access: reading.access,
      signal: context.signal,
    })
    return { outcome: 'succeeded', frames: framesOf(source) }
  }

  return {
    operations: { 'read-call': readCall, 'read-call-result': readCallResult },
    observations: { 'observe-call': observeCall },
  }
}

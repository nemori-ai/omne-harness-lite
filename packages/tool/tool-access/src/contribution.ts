import type {
  AccessContribution,
  EndOf,
  FrameOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { StreamFrame } from '@omne-harness/stream-arrival'
import {
  encodeToolInvocationRef,
  resolveToolInvocationRef,
  type ToolFailure,
  type ToolInvocationRef,
  type ToolResultVersion,
  type ToolStreamDelta,
  type ToolStreamEnd,
  type ToolStreamSnapshot,
} from '@omne-harness/tool-contract'
import type { ProgramPosition } from '@omne-harness/tool-contract/provider'
import type { ToolCallChild, ToolProtocol } from '@omne-harness/tool-protocol'
import type { ToolCallFaces, ToolCallPrincipals } from './ports.ts'
import { callView, childState, jsonOf, resultView, type ChildProgress } from './view.ts'

export type ToolAccessContributionInput = Readonly<{
  faces: () => ToolCallFaces | undefined
  principals: ToolCallPrincipals
}>

type Contribution = Omit<AccessContribution<ToolProtocol>, 'protocol'>
type ObserveCall = ToolProtocol['observations']['observe-call']
type Frame = StreamFrame<ToolStreamSnapshot, ToolStreamDelta, ToolStreamEnd>
type Refusal = Readonly<{ outcome: 'denied' | 'basis-unavailable' }>
type Reading = Readonly<{ access: Access<Principal>; faces: ToolCallFaces }>

/** One read of the output body answers at most this many bytes. */
const OUTPUT_PART_BYTES = 32_768
/** One page of the positions of a call. */
const CHILDREN_PAGE = 50
const ORDINAL = /^(0|[1-9]\d{0,8})$/
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

  const readCallOutput: Contribution['operations']['read-call-output'] = async (call, body) => {
    const reading = await readingOf(input, call.principal, body.tenant)
    if ('outcome' in reading) return reading
    const output = await guarded(() =>
      reading.faces.queries.readOutput({
        ...reading.access,
        reference: body.reference as ToolInvocationRef,
        after: body.after,
        maxBytes: OUTPUT_PART_BYTES,
      }),
    )
    if ('outcome' in output) return output
    if ('failure' in output) return refusalOf(output.failure)
    return { outcome: 'succeeded', body: output.ok }
  }

  const progressOf = async (reading: Reading, reference: ToolInvocationRef) => {
    const selected = await guarded(() =>
      reading.faces.instances.current({ access: reading.access, reference }),
    )
    if ('outcome' in selected) return 'unread'
    if ('ok' in selected) return selected.ok.state
    const { failure } = selected
    return failure.kind === 'invalid' && failure.reason === 'unknown-call' ? 'missing' : 'unread'
  }

  const childOf = async (reading: Reading, position: ProgramPosition): Promise<ToolCallChild> => {
    const encoded = encodeToolInvocationRef({
      tenant: reading.access.tenant,
      call: position.child,
      admission: position.admission,
    })
    const reference = 'ok' in encoded ? encoded.ok : null
    const handed = position.state === 'handed' && !position.background
    const progress: ChildProgress =
      handed && reference !== null ? await progressOf(reading, reference) : 'unread'
    return {
      ordinal: position.ordinal,
      tool: position.target.name,
      command: position.target.command,
      preview: position.target.preview ?? '',
      state: childState(position, progress),
      child: position.state === 'registered' ? null : reference,
    }
  }

  const listCallChildren: Contribution['operations']['list-call-children'] = async (call, body) => {
    const reading = await readingOf(input, call.principal, body.tenant)
    if ('outcome' in reading) return reading
    if (body.cursor !== null && !ORDINAL.test(body.cursor)) return DENIED
    const after = body.cursor === null ? -1 : Number(body.cursor)
    const selection = await selectionOf(reading, body.reference)
    if ('outcome' in selection) return selection
    const parent = resolveToolInvocationRef(body.reference, body.tenant)
    const children = reading.faces.children()
    if ('failure' in parent) return DENIED
    if (children === undefined) return UNAVAILABLE
    const table = await guarded(() => children.table({ ...reading.access, call: parent.ok.call }))
    if ('outcome' in table) return table
    if ('failure' in table) return refusalOf(table.failure)
    const rest = table.ok.positions.filter(position => position.ordinal > after)
    const page = rest.slice(0, CHILDREN_PAGE)
    const items: ToolCallChild[] = []
    for (const position of page) items.push(await childOf(reading, position))
    const last = page.at(-1)
    const more = rest.length > page.length && last !== undefined
    return { outcome: 'succeeded', body: { items, next: more ? String(last.ordinal) : null } }
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
    operations: {
      'read-call': readCall,
      'read-call-result': readCallResult,
      'read-call-output': readCallOutput,
      'list-call-children': listCallChildren,
    },
    observations: { 'observe-call': observeCall },
  }
}

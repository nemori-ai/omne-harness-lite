import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  closedToPrograms,
  type CallRecord,
  type LedgerDomain,
  type ToolSourceGuard,
} from '@omne-harness/tool'
import {
  decodeToolCallId,
  judgeToolDelivery,
  resolveToolInvocationRef,
  type Access,
  type ConsumerRef,
  type Effect,
  type FixedToolRequest,
  type Reply,
  type ToolCallId,
  type ToolDefiniteFailure,
  type ToolFailure,
  type ToolInvokeRequest,
  type ToolResultData,
  type ToolResultReceiver,
  type ToolResultVersion,
  type ToolTerminal,
} from '@omne-harness/tool-contract'
import {
  fixedRequestReference,
  judgeFixedToolRequest,
  judgeToolInvokeRequest,
  type PositionTarget,
  type ProgramParent,
  type ProgramPosition,
  type ToolChildren,
  type ToolForwardBinding,
  type ToolForwardSourceOutcome,
  type ToolProgramSource,
} from '@omne-harness/tool-contract/provider'
import type { ResolveDefinition } from './definition-resolution.ts'
import {
  forwardCommitted,
  issuedBinding,
  nextSourceRevision,
  pinnedOf,
  readIssued,
  sourceDomain,
  sourceKey,
  type StoredForward,
} from './invocation-forwarding.ts'
import type { LocalInvocationSourceInput, PrincipalJson } from './invocation-source.ts'
import { createParentChecks } from './source-parent.ts'

export const TOOL_PROGRAM_OWNER = '@omne-harness/tool-host-local/program-calls'

export const programConsumer = (parent: string, ordinal: number): ConsumerRef => ({
  owner: TOOL_PROGRAM_OWNER,
  work: parent,
  position: String(ordinal),
  purpose: 'program-call',
})

export function programPositionOf(
  consumer: ConsumerRef,
): Readonly<{ parent: ToolCallId; ordinal: number }> | null {
  const parent = decodeToolCallId(consumer.work)
  const ordinal = Number(consumer.position)
  if ('failure' in parent || !Number.isSafeInteger(ordinal) || ordinal < 0) return null
  return canonicalDigest(consumer) === canonicalDigest(programConsumer(parent.ok, ordinal))
    ? { parent: parent.ok, ordinal }
    : null
}

export type ProgramArrival = Readonly<{
  result: ToolResultVersion
  terminal: ToolTerminal
  effect: Effect
  data: ToolResultData
}>

export type ProgramArrivals = Readonly<{
  wait(
    tenant: LedgerDomain['tenant'],
    consumer: ConsumerRef,
    signal: AbortSignal,
  ): Promise<ProgramArrival | null>
  arrived(tenant: LedgerDomain['tenant'], consumer: ConsumerRef, arrival: ProgramArrival): void
}>

export function createProgramArrivals(): ProgramArrivals {
  const waiting = new Map<string, Set<(arrival: ProgramArrival) => void>>()
  const keyOf = (tenant: LedgerDomain['tenant'], consumer: ConsumerRef) =>
    canonicalDigest([tenant.organization.text, tenant.account.text, consumer])
  return {
    wait(tenant, consumer, signal) {
      if (signal.aborted) return Promise.resolve(null)
      const key = keyOf(tenant, consumer)
      return new Promise(resolve => {
        const waiters = waiting.get(key) ?? new Set()
        waiting.set(key, waiters)
        const leave = () => {
          waiters.delete(arrive)
          if (waiters.size === 0) waiting.delete(key)
          signal.removeEventListener('abort', abandon)
        }
        const arrive = (arrival: ProgramArrival) => {
          leave()
          resolve(arrival)
        }
        const abandon = () => {
          leave()
          resolve(null)
        }
        waiters.add(arrive)
        signal.addEventListener('abort', abandon, { once: true })
      })
    },
    arrived(tenant, consumer, arrival) {
      for (const arrive of new Set(waiting.get(keyOf(tenant, consumer)))) arrive(arrival)
    },
  }
}

type Placed<P> = ProgramParent<P> & Readonly<{ ordinal: number; target: ToolInvokeRequest }>

export type PreparedPosition =
  | Readonly<{
      kind: 'prepared'
      parent: CallRecord
      consumer: ConsumerRef
      child: ToolForwardBinding['call']
      admission: ToolForwardBinding['admission']
      request: FixedToolRequest
      requestDigest: string
      target: PositionTarget
    }>
  | Readonly<{ kind: 'association-unknown' }>
  | Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }>

const same = (a: unknown, b: unknown) => canonicalDigest(a) === canonicalDigest(b)
const denied = () => fail({ kind: 'denied' as const, action: 'admit' })
const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'invocation-source',
    diagnostic: 'The original program position cannot be verified.',
  })
const refused = (failure: ToolFailure): Exclude<PreparedPosition, { kind: 'prepared' }> =>
  failure.kind === 'commit-unknown'
    ? { kind: 'association-unknown' }
    : { kind: 'rejected', failure: failure as ToolDefiniteFailure }

export const positionTargetOf = (request: FixedToolRequest): PositionTarget => ({
  name: request.availability.definition.name,
  command: request.command,
  digest: canonicalDigest({
    definition: request.availability.definition.adoption,
    command: request.command,
    arguments: request.arguments.effective,
  }),
})

function sourceOf(
  tenant: LedgerDomain['tenant'],
  parent: ToolCallId,
  ordinal: number,
  ids: Pick<ToolForwardBinding, 'call' | 'admission'>,
  requestDigest: string,
): FixedToolRequest['invocation'] {
  return {
    kind: 'programmatic',
    source: {
      owner: TOOL_PROGRAM_OWNER,
      record: `program-position:${parent}:${ordinal}`,
      revision: '1',
      digest: canonicalDigest({
        tenant: [tenant.organization.text, tenant.account.text],
        parent,
        ordinal,
        ...ids,
        requestDigest,
      }),
    },
  }
}

type Identities = (
  tenant: LedgerDomain['tenant'],
  consumer: ConsumerRef,
) => Pick<ToolForwardBinding, 'call' | 'admission'>
type Issuing<P> = Readonly<{
  input: LocalInvocationSourceInput<P>
  identitiesOf: Identities
  resolveDefinition: ResolveDefinition<P>
  parents: ReturnType<typeof createParentChecks<P>>
}>

async function prepare<P>(issuing: Issuing<P>, given: Placed<P>): Promise<PreparedPosition> {
  const { input } = issuing
  const fixed = judgeFixedToolRequest(given.request)
  if ('failure' in fixed)
    return { kind: 'rejected', failure: { kind: 'invalid', ...fixed.failure } }
  if (!Number.isSafeInteger(given.ordinal) || given.ordinal < 0)
    return { kind: 'rejected', failure: { kind: 'invalid', field: 'ordinal', reason: 'range' } }
  const consumer = programConsumer(given.call, given.ordinal)
  const judged = judgeToolInvokeRequest({ ...given.target, consumer })
  if ('failure' in judged)
    return { kind: 'rejected', failure: { kind: 'invalid', ...judged.failure } }
  const parent = { ...given, request: fixed.ok, start: structuredClone(given.start) }
  const checked = await issuing.parents.checkParent(parent, input.programs)
  if ('failure' in checked) return refused(checked.failure)
  const availability = await issuing.resolveDefinition(parent, judged.ok.availability)
  if ('failure' in availability) return { kind: 'rejected', failure: availability.failure }
  const target = { ...judged.ok, availability: availability.ok }
  const { adoption } = target.availability.definition
  const closed = closedToPrograms(target)
  if (closed !== null)
    return { kind: 'rejected', failure: { kind: 'unsupported', adoption, reason: closed } }
  const asParent = [
    target.mode === 'foreground',
    target.batchDecision === null,
    same(pinnedOf(parent.request), pinnedOf(target)),
  ]
  if (asParent.includes(false))
    return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
  const ids = issuing.identitiesOf(parent.tenant, consumer)
  const requestDigest = canonicalDigest(judged.ok)
  const request: FixedToolRequest = {
    ...target,
    invocation: sourceOf(parent.tenant, parent.call, given.ordinal, ids, requestDigest),
  }
  return {
    kind: 'prepared',
    parent: checked.ok,
    consumer,
    child: ids.call,
    admission: ids.admission,
    request,
    requestDigest,
    target: positionTargetOf(request),
  }
}

async function sameSubject<P>(
  input: LocalInvocationSourceInput<P>,
  current: P,
  stored: StoredForward,
): Promise<'allowed' | 'denied' | 'unavailable'> {
  const decoded = input.principalCodec.decode(stored.principal)
  if ('failure' in decoded) return 'unavailable'
  const subject = await input.authority.samePrincipal({ current, original: decoded.ok })
  return subject.kind === 'unavailable' ? 'unavailable' : subject.kind
}

/** The stored source is the one this parent's position was given, by the principal that gave it. */
async function verifyStored<P>(
  issuing: Issuing<P>,
  access: Access<P>,
  stored: StoredForward,
): Reply<CallRecord> {
  const { input } = issuing
  const subject = await sameSubject(input, access.principal, stored)
  if (subject !== 'allowed') return subject === 'denied' ? denied() : unavailable()
  const place = programPositionOf(stored.request.consumer)
  if (place === null) return denied()
  const read = await issuing.parents.readParent({ ...access, call: place.parent })
  if ('failure' in read) return read
  const parent = read.ok
  const { origin, request } = stored
  const ids = issuing.identitiesOf(access.tenant, stored.request.consumer)
  const issued = sourceOf(access.tenant, parent.call, place.ordinal, ids, String(origin.issued))
  const original = [
    origin.ordinal === place.ordinal,
    origin.parent === parent.call,
    origin.admission === parent.admission,
    origin.requestDigest === canonicalDigest(fixedRequestReference(parent.request)),
    same(origin.start, parent.start),
    same(ids, { call: stored.call, admission: stored.admission }),
    typeof origin.issued === 'string',
    same(request.invocation, issued),
    same(pinnedOf(parent.request), pinnedOf(request)),
    closedToPrograms(request) === null,
  ]
  return original.includes(false) ? denied() : succeed(parent)
}

async function positionOf<P>(
  issuing: Issuing<P>,
  tenant: LedgerDomain['tenant'],
  parent: ToolCallId,
  ordinal: number,
): Reply<ProgramPosition | null> {
  const read = await issuing.input.store.read({ kind: 'call', tenant, call: parent })
  if (read.kind !== 'complete') return unavailable()
  const row = read.records.find(row => row.kind === 'position' && row.position.ordinal === ordinal)
  return succeed(row?.kind === 'position' ? row.position : null)
}

type Prepared = Extract<PreparedPosition, { kind: 'prepared' }>

async function recalled<P>(
  issuing: Issuing<P>,
  given: Placed<P>,
  prepared: Prepared,
  known: StoredForward,
): Promise<ToolForwardSourceOutcome> {
  const current = await verifyStored(issuing, given, known)
  if ('failure' in current) return refused(current.failure)
  return same(fixedRequestReference(known.request), fixedRequestReference(prepared.request))
    ? { kind: 'bound', ...issuedBinding(known) }
    : { kind: 'rejected', failure: { kind: 'conflict', operation: known.admission } }
}

function sourceRecord<P>(issuing: Issuing<P>, given: Placed<P>, prepared: Prepared) {
  const { consumer, child: call, admission, request, parent, requestDigest } = prepared
  const value = {
    kind: 'invocation-source',
    call,
    admission,
    requestDigest,
    fixedDigest: canonicalDigest(fixedRequestReference(request)),
    invocation: request.invocation,
    principal: issuing.input.principalCodec.encode(given.principal),
    origin: {
      kind: 'program',
      parent: parent.call,
      admission: parent.admission,
      start: parent.start,
      requestDigest: canonicalDigest(fixedRequestReference(parent.request)),
      ordinal: given.ordinal,
      issued: requestDigest,
    },
  }
  return { kind: 'host', host: { key: sourceKey(consumer), value, request } } as const
}

async function handedTo<P>(
  issuing: Issuing<P>,
  given: Placed<P>,
  prepared: Prepared,
): Reply<boolean> {
  const position = await positionOf(issuing, given.tenant, given.call, given.ordinal)
  if ('failure' in position) return position
  const at = position.ok
  return succeed(
    at !== null &&
      [
        at.state === 'handed',
        at.child === prepared.child,
        at.admission === prepared.admission,
        same(at.target, prepared.target),
      ].every(Boolean),
  )
}

/** TL-65: the source of a position is issued once, and only for a position the table has handed off. */
async function issue<P>(issuing: Issuing<P>, given: Placed<P>): Promise<ToolForwardSourceOutcome> {
  const { store, commitAttempts } = issuing.input
  const prepared = await prepare(issuing, given)
  if (prepared.kind !== 'prepared') return prepared
  const { consumer, child: call, admission, request } = prepared
  const ids = { call, admission }
  for (let attempt = 0; attempt < commitAttempts; attempt++) {
    const found = await readIssued(store, given.tenant, consumer, 'program')
    if ('failure' in found) return { kind: 'association-unknown' }
    if (found.ok.stored !== null) return recalled(issuing, given, prepared, found.ok.stored)
    const handed = await handedTo(issuing, given, prepared)
    if ('failure' in handed) return { kind: 'association-unknown' }
    if (!handed.ok) return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
    const { revision } = found.ok.read
    const commit = await store
      .commit({
        domain: sourceDomain(given.tenant, consumer),
        expected: revision,
        revision: nextSourceRevision(revision),
        writes: [{ kind: 'put', record: sourceRecord(issuing, given, prepared) }],
      })
      .catch(() => null)
    if (commit === null) return { kind: 'issuance-unknown', ...ids }
    const outcome = forwardCommitted(commit, ids, request)
    if (outcome !== null) return outcome
  }
  return { kind: 'association-unknown' }
}

export function createInvocationPrograms<P>(
  input: LocalInvocationSourceInput<P>,
  guard: ToolSourceGuard<P>,
  identitiesOf: Identities,
  resolveDefinition: ResolveDefinition<P>,
) {
  const parents = createParentChecks(input, guard)
  const issuing: Issuing<P> = { input, identitiesOf, resolveDefinition, parents }
  const recoverBinding = async (
    access: Access<P> & Pick<ToolForwardBinding, 'call' | 'admission' | 'request'>,
  ): Reply<{ principal: PrincipalJson }> => {
    const found = await readIssued(input.store, access.tenant, access.request.consumer, 'program')
    if ('failure' in found) return found
    const stored = found.ok.stored
    if (
      stored === null ||
      stored.call !== access.call ||
      stored.admission !== access.admission ||
      !same(fixedRequestReference(stored.request), fixedRequestReference(access.request))
    )
      return denied()
    const checked = await verifyStored(issuing, access, stored)
    return 'failure' in checked ? checked : succeed({ principal: stored.principal })
  }
  const source: ToolProgramSource<P> = {
    resolve: given => issue(issuing, given).catch(() => ({ kind: 'association-unknown' as const })),
  }
  return {
    source,
    prepare: (given: Placed<P>) => prepare(issuing, given),
    recoverBinding,
    arrivals: createProgramArrivals(),
  }
}

export type InvocationPrograms<P> = ReturnType<typeof createInvocationPrograms<P>>

const retainedFailure = (failure: ToolFailure) => {
  if (failure.kind === 'commit-unknown') return fail({ kind: 'outcome-unknown' as const })
  if (failure.kind === 'denied') return fail({ kind: 'denied' as const })
  if (failure.kind === 'conflict') return fail({ kind: 'conflict' as const })
  return fail({ kind: 'unavailable' as const, dependency: 'program-positions' })
}

/** TL-73: saved means the position in the parent's domain recorded the result version. Nothing is copied. */
export function createProgramReceiver<P, B extends ContentBlock>(
  input: LocalInvocationSourceInput<P>,
  arrivals: ProgramArrivals,
): ToolResultReceiver<P, B> {
  type Push = Parameters<ToolResultReceiver<P, B>['push']>[0]
  type Saved = ReturnType<ToolResultReceiver<P, B>['push']>
  const placeOf = async ({ access, delivery }: Push) => {
    const judged = judgeToolDelivery({ tenant: access.tenant, delivery })
    if ('failure' in judged) return fail({ kind: 'invalid' as const, ...judged.failure })
    const place = programPositionOf(delivery.consumer)
    const reference = resolveToolInvocationRef(delivery.key.reference, access.tenant)
    if (place === null || 'failure' in reference) return fail({ kind: 'denied' as const })
    const found = await readIssued(input.store, access.tenant, delivery.consumer, 'program')
    const stored = 'ok' in found ? found.ok.stored : null
    if (stored === null)
      return fail({ kind: 'unavailable' as const, dependency: 'invocation-source' })
    const { call, admission } = reference.ok
    return stored.call === call && stored.admission === admission
      ? succeed(place)
      : fail({ kind: 'denied' as const })
  }
  const save = async (pushed: Push): Saved => {
    const { access, delivery } = pushed
    const place = await placeOf(pushed)
    if ('failure' in place) return place
    const children: ToolChildren<P> | undefined = input.programs?.children()
    if (children === undefined)
      return fail({ kind: 'unavailable', dependency: 'program-positions' })
    const at = { ...access, call: place.ok.parent, ordinal: place.ok.ordinal }
    const evidence = {
      owner: TOOL_PROGRAM_OWNER,
      record: `${sourceKey(delivery.consumer)}/position`,
      revision: '1',
      digest: canonicalDigest(delivery.key),
    }
    const saved = succeed({ key: delivery.key, evidence })
    if (delivery.kind === 'account') return saved
    if (delivery.kind === 'placeholder') {
      const moved = await children.background(at)
      return 'failure' in moved ? retainedFailure(moved.failure) : saved
    }
    const { terminal, effect } = delivery
    const result = delivery.key.result
    const kept = await children.retain({ ...at, result, terminal, effect })
    if ('failure' in kept) return retainedFailure(kept.failure)
    const data = structuredClone(delivery.value.data)
    arrivals.arrived(access.tenant, delivery.consumer, { result, terminal, effect, data })
    return saved
  }
  return {
    async push(pushed) {
      if (pushed.signal.aborted) return fail({ kind: 'cancelled-before-accept' })
      try {
        return await save(pushed)
      } catch {
        return fail({ kind: 'unavailable', dependency: 'program-positions' })
      }
    },
  }
}

// The ToolStartAuthority conformance suite (P04, story 24) and a non-durable double that conforms
// to it, with a variant of the double that also consumes authorization permits at the consumption
// point. The doubles keep their state in memory and declare `durability: 'none'`: they prove
// nothing about a durable provider and must not be assembled into production.
import assert from 'node:assert/strict'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { FixedToolRequest } from './definitions.ts'
import type { Access, DurableEvidence, ToolCallId } from './identity.ts'
import type { ToolStartRecord } from './ports.ts'
import type { ToolFailure } from './results.ts'
import type {
  StartGuard,
  StartPermit,
  StartProgress,
  ToolPermitConsumption,
  ToolPermitRef,
  ToolStartAcceptance,
  ToolStartAuthority,
} from './records.ts'
import {
  completionOf,
  conformanceCase,
  crossTenantAnswers,
  expectKind,
  expectOneOf,
  finalAnswer,
  handle,
  isProgress,
  otherAccessOf,
  refused,
  resendRecalls,
  succeeded,
  type AnswerModel,
  type ConformanceCase,
} from './testing-case.ts'
import {
  adoption,
  callId,
  digestOf,
  evidence,
  fixedRequest,
  identifyingValues,
  memoryAccess,
  memoryOtherAccess,
  mintEvidence,
  operationId,
  startRecord,
  tenantKey,
} from './testing-values.ts'

// ---------------------------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------------------------

/**
 * What the start authority suite needs. A fresh fixture serves one case. `access` is a principal
 * and a tenant that the authority accepts; `request` replaces the built-in fixed request when the
 * provider needs its own. A provider that has no guard resource issues a permit with no guard: the
 * cases that invalidate a guard are then reported not applicable, naming the handle `guard`.
 * `otherAccess` is the access of a second tenant, with a principal of its own: the cases that check
 * that another tenant neither reads nor changes a start of the first are reported not applicable
 * without it. `settle` is for a provider that answers `unknown` to a `consume` or an `inspect` that
 * it can decide later: it resolves only after the authority has decided every start it answered
 * `unknown` for, so that every read of `consume` and `inspect` tells the decision; the suite asks
 * once more after it and never polls. Without `settle`, a case that needs the decision is reported
 * not applicable when the first answer is `unknown`.
 */
export interface ToolStartAuthorityFixture<P> {
  readonly authority: ToolStartAuthority<P>
  readonly access: Access<P>
  readonly otherAccess?: Access<P>
  readonly request?: FixedToolRequest
  /** Resolves after the authority has decided every start it answered `unknown` for, and every read tells it. */
  settle?(): Promise<void>
}

/**
 * The answer model of the start authority (P04): `consume` and `inspect` answer `unknown` when
 * the authority cannot yet prove an exclusion or an acceptance, and the others (`started`,
 * `not-started`, `rejected`) are final for the permit or start that they answer. `prepare`,
 * `invalidate` and `exclude` answer with a permit or evidence and have no progress kind.
 */
export const startAuthorityAnswers = {
  prepare: { clause: 'P04', progress: [] },
  consume: { clause: 'P04', progress: ['unknown'] },
  inspect: { clause: 'P04', progress: ['unknown'] },
  invalidate: { clause: 'P04', progress: [] },
  exclude: { clause: 'P04', progress: [] },
} as const satisfies AnswerModel<keyof ToolStartAuthority<unknown>>

type Start = Extract<ToolStartRecord, { kind: 'start' }>

function scene<P>(fixture: ToolStartAuthorityFixture<P>, access: Access<P> = fixture.access) {
  const { authority } = fixture
  const call: ToolCallId = callId('call-1')
  const callAccess = { ...access, call }
  const start: Start = startRecord(access, call)
  const request = fixture.request ?? fixedRequest()
  const completion = completionOf(fixture, 'settle')
  const tryConsume = (permit: StartPermit, capsule = 'capsule') =>
    authority.consume({ ...callAccess, permit, executorReceipt: evidence(capsule) })
  const tryInspect = () => authority.inspect({ ...callAccess, start })
  /** The final answer of `consume`, or the refusal of it: `unknown` is driven by `settle`. */
  const tryConsumeFinal = (permit: StartPermit, capsule = 'capsule', what = 'consume') =>
    finalAnswer({
      ask: () => tryConsume(permit, capsule),
      row: startAuthorityAnswers.consume,
      completion,
      what,
    })
  return {
    start,
    completion,
    /** What every call of the scene sends: its access and its call. */
    sends: [access, call] as const,
    prepare: async (): Promise<StartPermit> =>
      succeeded(await authority.prepare({ ...callAccess, start, request }), 'prepare'),
    tryPrepare: () => authority.prepare({ ...callAccess, start, request }),
    tryConsume,
    /** One read of `consume`: a decision is not asked for. */
    consume: async (permit: StartPermit, capsule = 'capsule'): Promise<StartProgress> =>
      succeeded(await tryConsume(permit, capsule), 'consume'),
    tryConsumeFinal,
    consumeFinal: async (permit: StartPermit, capsule = 'capsule'): Promise<StartProgress> =>
      succeeded(await tryConsumeFinal(permit, capsule), 'consume'),
    tryInspect,
    /** One read of `inspect`: a decision is not asked for. */
    inspect: async (): Promise<StartProgress> => succeeded(await tryInspect(), 'inspect'),
    /** The final answer of `inspect`: `unknown` is driven by `settle`. */
    inspectFinal: async (): Promise<StartProgress> =>
      succeeded(
        await finalAnswer({
          ask: tryInspect,
          row: startAuthorityAnswers.inspect,
          completion,
          what: 'inspect',
        }),
        'inspect',
      ),
    /**
     * The consume of a permit that must never start: the answer is driven to its end, and a refusal
     * is no start. A permit that the authority refuses outright has no answer to drive.
     */
    neverStarts: async (permit: StartPermit, what: string, capsule = 'capsule'): Promise<void> => {
      const answer = await tryConsumeFinal(permit, capsule, what)
      if ('ok' in answer)
        assert.notEqual(answer.ok.kind, 'started', `${what}: the start was accepted`)
    },
    guardOf: (permit: StartPermit): StartGuard =>
      // A provider without a guard resource issues a permit with no guard (P04): there is nothing
      // to invalidate, so the cases that invalidate report it as not applicable.
      handle<StartGuard>(permit.guards[0], 'guard'),
    tryInvalidate: (guard: StartGuard, operation: string) =>
      authority.invalidate({ ...access, operation: operationId(operation), guard }),
    invalidate: async (permit: StartPermit, operation: string): Promise<DurableEvidence> =>
      succeeded(
        await authority.invalidate({
          ...access,
          operation: operationId(operation),
          guard: handle<StartGuard>(permit.guards[0], 'guard'),
        }),
        'invalidate',
      ),
    exclude: (operation: string, callOf: ToolCallId = call, reason = 'the call was withdrawn') =>
      authority.exclude({
        ...access,
        call: callOf,
        operation: operationId(operation),
        reason,
      }),
    inspectOf: (other: ToolCallId) =>
      authority.inspect({ ...access, call: other, start: startRecord(access, other) }),
  }
}

/** A stale consume must refuse for good, never start, and never stay undecided. */
function assertRefusal(progress: StartProgress, what: string): void {
  expectOneOf(progress, ['rejected', 'not-started'], what)
}

type Fixture<P> = ToolStartAuthorityFixture<P>
const answers = startAuthorityAnswers

async function prepareStartsNothing<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  for (const guard of permit.guards) {
    assert.ok(guard.owner.length > 0, 'the owner of the guard is named')
    assert.ok(guard.resource.length > 0, 'the resource of the guard is named')
    assert.ok(guard.revision.length > 0, 'the revision of the guard is named')
  }
  // A permit alone authorises nothing: no start is reported until a consume is accepted.
  const inspected = await s.inspect()
  assert.ok(
    isProgress(inspected, answers.inspect) || inspected.kind === 'not-started',
    `inspect after prepare: expected not-started or ${answers.inspect.progress.join(' or ')}, got ${inspected.kind}`,
  )
}

async function consumeOnce<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  const first = expectKind(await s.consumeFinal(permit), 'started', 'first consume')
  resendRecalls(
    answers.consume,
    { earlier: first, later: await s.consume(permit) },
    'consume again',
  )
  const concurrent = await Promise.all([s.consume(permit), s.consume(permit)])
  for (const progress of concurrent)
    resendRecalls(answers.consume, { earlier: first, later: progress }, 'concurrent consume')
}

async function secondPermit<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const first = expectKind(await s.consumeFinal(await s.prepare()), 'started', 'first consume')
  const again = await s.tryPrepare()
  // A new permit may be refused outright; if it is issued, the start was accepted once.
  if ('ok' in again) {
    const answer = await s.tryConsumeFinal(again.ok, 'capsule-2')
    if ('ok' in answer)
      resendRecalls(answers.consume, { earlier: first, later: answer.ok }, 'consume')
  }
  resendRecalls(answers.inspect, { earlier: first, later: await s.inspect() }, 'inspect')
}

async function invalidationForbids<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  await s.invalidate(permit, 'revoke-1')
  const refusal = await s.consumeFinal(permit)
  assertRefusal(refusal, 'consume after invalidation')
  expectOneOf(await s.inspectFinal(), ['rejected', 'not-started'], 'inspect after invalidation')
  assertRefusal(await s.consumeFinal(permit), 'second consume after invalidation')
}

async function acceptedStaysInFlight<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  const accepted = expectKind(await s.consumeFinal(permit), 'started', 'consume')
  await s.invalidate(permit, 'revoke-1')
  resendRecalls(answers.inspect, { earlier: accepted, later: await s.inspect() }, 'inspect')
  // A consume that is sent again after the invalidation recalls the acceptance.
  resendRecalls(
    answers.consume,
    { earlier: accepted, later: await s.consume(permit) },
    'consume again',
  )
}

async function inspectRecallsAcceptance<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  const accepted = expectKind(await s.consumeFinal(permit), 'started', 'consume')
  resendRecalls(answers.inspect, { earlier: accepted, later: await s.inspect() }, 'inspect')
}

async function inspectRecallsRejection<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  await s.invalidate(permit, 'revoke-1')
  const refusal = await s.consumeFinal(permit)
  assertRefusal(refusal, 'consume after invalidation')
  // A permanent rejection is recalled as it was. A refusal that is `not-started` excludes only
  // the permit, and the start may be asked again: it must not turn into a start.
  const inspected = await s.inspectFinal()
  if (refusal.kind === 'rejected')
    resendRecalls(answers.inspect, { earlier: refusal, later: inspected }, 'inspect')
  else assertRefusal(inspected, 'inspect after a refusal that was not-started')
}

async function notStartedWithdraws<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  // Nothing was accepted, so the authority tells that the start did not happen; the permit
  // that it issued before cannot start any more.
  expectKind(await s.inspectFinal(), 'not-started', 'inspect of an undecided start')
  await s.neverStarts(permit, 'consume of the withdrawn permit')
}

async function notStartedStartsAnew<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  await s.prepare()
  expectKind(await s.inspectFinal(), 'not-started', 'inspect of an undecided start')
  // Not-started excludes the old permit and nothing else: without a permanent refusal the
  // same start is checked again and may start, once.
  expectKind(
    await s.consumeFinal(await s.prepare(), 'capsule-2'),
    'started',
    'consume of a new permit',
  )
}

async function exclusionForbids<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  succeeded(await s.exclude('exclude-1'), 'exclude')
  await s.neverStarts(permit, 'consume after an exclusion')
  const again = await s.tryPrepare()
  // A new permit may be refused outright; if it is issued it must not start either.
  if ('ok' in again)
    await s.neverStarts(again.ok, 'consume of a new permit after an exclusion', 'capsule-2')
}

async function exclusionCannotOverrule<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  const accepted = expectKind(await s.consumeFinal(permit), 'started', 'consume')
  refused(await s.exclude('exclude-1'), 'exclude after acceptance')
  resendRecalls(answers.inspect, { earlier: accepted, later: await s.inspect() }, 'inspect')
}

async function invalidationResent<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const first = await s.prepare()
  const evidenceOne = await s.invalidate(first, 'revoke-1')
  assert.deepEqual(await s.invalidate(first, 'revoke-1'), evidenceOne)
  const second = await s.prepare()
  assert.deepEqual(await s.invalidate(first, 'revoke-1'), evidenceOne)
  const third = await s.prepare()
  assert.deepEqual(
    third.guards.map(guard => guard.revision),
    second.guards.map(guard => guard.revision),
  )
  expectKind(await s.consumeFinal(third), 'started', 'consume of a permit after a resend')
}

async function invalidationConflict<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const first = await s.prepare()
  const original = await s.invalidate(first, 'revoke-1')
  const second = await s.prepare()
  // The same operation names the guard of the second permit, which is another input.
  const other = refused(
    await s.tryInvalidate(s.guardOf(second), 'revoke-1'),
    'invalidate under the operation of another guard',
  )
  assert.equal(other.kind, 'conflict')
  assert.deepEqual(await s.invalidate(first, 'revoke-1'), original)
  // The refused invalidation moved nothing: the permit that it named still starts.
  expectKind(await s.consumeFinal(second), 'started', 'consume after the conflict')
}

async function exclusionConflict<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.prepare()
  const original = succeeded(await s.exclude('exclude-1'), 'exclude')
  const other = refused(
    await s.exclude('exclude-1', callId('call-1'), 'another reason'),
    'exclude under the operation of another reason',
  )
  assert.equal(other.kind, 'conflict')
  assert.deepEqual(succeeded(await s.exclude('exclude-1'), 'exclude again'), original)
  await s.neverStarts(permit, 'consume after an exclusion under another reason')
}

async function foreignInspect<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const accepted = expectKind(await own.consumeFinal(await own.prepare()), 'started', 'consume')
  // The other tenant names the same call and start: only the acceptance identifies the record.
  await crossTenantAnswers({
    ask: { real: other.tryInspect, ghost: () => other.inspectOf(callId('call-ghost')) },
    row: answers.inspect,
    completion: other.completion,
    identifying: identifyingValues(fixture.access.tenant, accepted.acceptance),
    submitted: [...other.sends, other.start],
    what: 'inspect by another tenant',
  })
  resendRecalls(
    answers.inspect,
    { earlier: accepted, later: await own.inspect() },
    'inspect by the own tenant',
  )
}

async function foreignConsume<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const permit = await own.prepare()
  // The other tenant sends the permit itself, and the permit names the tenant: an answer may echo
  // all of it, so what is left to check is that the two answers read alike.
  await crossTenantAnswers({
    ask: {
      real: () => other.tryConsume(permit),
      ghost: () => other.tryConsume({ ...permit, request: evidence('never-issued') }),
    },
    row: answers.consume,
    completion: other.completion,
    identifying: identifyingValues(fixture.access.tenant),
    submitted: [...other.sends, permit, evidence('capsule')],
    what: 'consume by another tenant',
  })
  expectKind(await own.consumeFinal(permit), 'started', 'consume by the tenant after the attempt')
  const foreignFinal = await other.tryConsumeFinal(permit)
  if ('ok' in foreignFinal)
    assert.notEqual(foreignFinal.ok.kind, 'started', 'the permit was accepted')
}

async function foreignInvalidate<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const permit = await own.prepare()
  const guard = own.guardOf(permit)
  // The other tenant sends the guard itself; the permit request still identifies the record.
  await crossTenantAnswers({
    ask: {
      real: () => other.tryInvalidate(guard, 'revoke-9'),
      ghost: () => other.tryInvalidate({ ...guard, resource: 'ghost-resource' }, 'revoke-10'),
    },
    row: answers.invalidate,
    identifying: identifyingValues(fixture.access.tenant, permit.request),
    submitted: [...other.sends, 'revoke-9', guard],
    what: 'invalidate by another tenant',
  })
  expectKind(await own.consumeFinal(permit), 'started', 'consume by the tenant after the attempt')
}

async function foreignExclude<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const permit = await own.prepare()
  await crossTenantAnswers({
    ask: {
      real: () => other.exclude('exclude-9'),
      ghost: () => other.exclude('exclude-10', callId('call-ghost')),
    },
    row: answers.exclude,
    identifying: identifyingValues(fixture.access.tenant, permit.request),
    submitted: [...other.sends, 'exclude-9', 'the call was withdrawn'],
    what: 'exclude by another tenant',
  })
  expectKind(await own.consumeFinal(permit), 'started', 'consume by the tenant after the attempt')
}

async function foreignPrepare<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const accepted = expectKind(await own.consumeFinal(await own.prepare()), 'started', 'consume')
  // The same call and start of another tenant is a start of its own: it neither joins nor
  // overrules the start of the first tenant.
  const permit = await other.tryPrepare()
  if ('ok' in permit) {
    assert.deepEqual(permit.ok.tenant, otherAccessOf(fixture).tenant, 'the permit names the tenant')
    const answer = await other.tryConsumeFinal(permit.ok, 'capsule-other')
    if ('ok' in answer && answer.ok.kind === 'started')
      assert.notDeepEqual(answer.ok, accepted, 'the start of another tenant is its own')
  }
  resendRecalls(
    answers.inspect,
    { earlier: accepted, later: await own.inspect() },
    'inspect by the own tenant',
  )
}

export function toolStartAuthorityConformance<P>(): readonly ConformanceCase<Fixture<P>>[] {
  const named = (name: string, run: (fixture: Fixture<P>) => Promise<void>) =>
    conformanceCase('P04', name, run)
  const conflict = (name: string, run: (fixture: Fixture<P>) => Promise<void>) =>
    conformanceCase('P01', name, run)
  return [
    named('prepare names the guards it saw and starts nothing', prepareStartsNothing),
    named('consume accepts a permit once and recalls the acceptance', consumeOnce),
    named('a second permit of an accepted start does not accept it again', secondPermit),
    named('an invalidation confirmed before the consume forbids the start', invalidationForbids),
    named('a start accepted before the invalidation stays in flight', acceptedStaysInFlight),
    named('inspect recalls an acceptance', inspectRecallsAcceptance),
    named('inspect recalls a rejection', inspectRecallsRejection),
    named('not-started withdraws the outstanding permit', notStartedWithdraws),
    named('a start answered not-started can start with a new permit', notStartedStartsAnew),
    named('an exclusion forbids the start for good', exclusionForbids),
    named('an exclusion cannot overrule an accepted start', exclusionCannotOverrule),
    named('a resent invalidation is recognised and moves the guard once', invalidationResent),
    conflict(
      'an invalidation operation reused for another guard is a conflict that changes nothing',
      invalidationConflict,
    ),
    conflict(
      'an exclusion operation reused for another reason is a conflict that changes nothing',
      exclusionConflict,
    ),
    named('another tenant learns nothing of a start by inspect', foreignInspect),
    named('another tenant cannot accept the permit of a tenant', foreignConsume),
    named('another tenant cannot invalidate the guard of a tenant', foreignInvalidate),
    named('another tenant cannot exclude the call of a tenant', foreignExclude),
    named('another tenant cannot prepare the start of a tenant', foreignPrepare),
  ]
}

// ---------------------------------------------------------------------------------------------
// The non-durable double
// ---------------------------------------------------------------------------------------------

export interface MemoryToolStartAuthority<P> extends ToolStartAuthority<P> {
  readonly durability: 'none'
}

const FENCE_OWNER = 'conformance-fence'
const FENCE_RESOURCE = 'start-fence'
/** The one guard resource that the in-memory authority applies to every request. */
export const MEMORY_START_GUARD = Object.freeze({ owner: FENCE_OWNER, resource: FENCE_RESOURCE })

type Guard = { revision: number; operation: string | null; evidence: DurableEvidence | null }
type Refusal = Extract<StartProgress, { kind: 'rejected' }>
type Tenant = Access<unknown>['tenant']

const reply = <T>(outcome: Outcome<T, ToolFailure>): Promise<Outcome<T, ToolFailure>> =>
  Promise.resolve(outcome)

function strip(guard: StartGuard): { owner: string; resource: string; revision: string } {
  return { owner: guard.owner, resource: guard.resource, revision: guard.revision }
}

/**
 * What the authorized double asks at the consumption point (SPEC「授权消费点与撤权再核」), after
 * the guards. `admitted` is the revocation recheck of the action of the call; `consume` consumes
 * every permit bound to the call and answers the facts, or the reason it refuses the start.
 */
type MemoryStartAuthorization = Readonly<{
  admitted(tenant: Tenant, call: ToolCallId): boolean
  consume(
    tenant: Tenant,
    call: ToolCallId,
  ):
    | Readonly<{ kind: 'consumed'; facts: readonly ToolPermitConsumption[] }>
    | Readonly<{ kind: 'refused'; reason: string }>
}>

/** The in-memory start authority, and the acceptance records it formed. */
type MemoryStartDomain<P> = Readonly<{
  authority: MemoryToolStartAuthority<P>
  acceptanceOf(acceptance: DurableEvidence): ToolStartAcceptance | null
}>

/**
 * A start authority that keeps its records in memory. Every operation runs to its end before the
 * next one starts, which is the ordering domain of P04 for one process. A permit is stored when
 * it is issued, carries the revision of the one guard it saw, and is accepted once and only while
 * that guard keeps the revision.
 */
export function createMemoryToolStartAuthority<P>(): MemoryToolStartAuthority<P> {
  return buildMemoryStartDomain<P>(null).authority
}

/**
 * The double behind `createMemoryToolStartAuthority`. With an authorization side it also rechecks
 * the admission and consumes the bound permits in the same turn as the acceptance, before it.
 */
function buildMemoryStartDomain<P>(
  authorization: MemoryStartAuthorization | null,
): MemoryStartDomain<P> {
  const acceptances = new Map<string, ToolStartAcceptance>()
  const fences = new Map<string, Guard>()
  const permits = new Map<string, string>()
  const accepted = new Map<string, DurableEvidence>()
  const acceptedCalls = new Set<string>()
  const rejected = new Map<string, Refusal>()
  const callRejected = new Map<string, Refusal>()
  const excluded = new Map<string, DurableEvidence>()
  /** What each invalidation or exclusion operation asked: another input under it is a conflict. */
  const operations = new Map<string, { digest: string; evidence: DurableEvidence }>()
  let minted = 0

  const mint = (kind: string, content: unknown): DurableEvidence => {
    minted += 1
    return mintEvidence(`start-authority/${kind}/${minted}`, content)
  }
  const callKey = (input: { tenant: Tenant; call: ToolCallId }): string =>
    JSON.stringify([tenantKey(input.tenant), input.call])
  const startKey = (input: { tenant: Tenant; call: ToolCallId }, operation: string): string =>
    JSON.stringify([callKey(input), operation])
  const fenceOf = (tenant: Tenant, owner: string, resource: string): Guard => {
    const key = JSON.stringify([tenantKey(tenant), owner, resource])
    let found = fences.get(key)
    if (found === undefined) {
      found = { revision: 0, operation: null, evidence: null }
      fences.set(key, found)
    }
    return found
  }
  const decided = (call: string, start: string): StartProgress | null => {
    const acceptance = accepted.get(start)
    if (acceptance !== undefined) return { kind: 'started', acceptance }
    return rejected.get(start) ?? callRejected.get(call) ?? null
  }

  const authority: ToolStartAuthority<P> = {
    prepare: input => {
      const fence = fenceOf(input.tenant, FENCE_OWNER, FENCE_RESOURCE)
      const seen: StartGuard = {
        owner: FENCE_OWNER,
        resource: FENCE_RESOURCE,
        revision: String(fence.revision),
        evidence: fence.evidence ?? mint('guard', { initial: true }),
        scope: { kind: 'resource' },
      }
      const request = mint('permit', { start: input.start.operation, guard: strip(seen) })
      permits.set(
        startKey(input, input.start.operation),
        digestOf({ guards: [strip(seen)], request }),
      )
      return reply(
        succeed({
          tenant: input.tenant,
          call: input.call,
          operation: input.start.operation,
          adoption: adoption('memory-start-authority'),
          inputDigest: digestOf(input.request),
          start: input.start,
          guards: [seen],
          request,
        }),
      )
    },
    consume: input => {
      const start = startKey(input, input.permit.start.operation)
      const known = decided(callKey(input), start)
      if (known !== null) return reply(succeed(known))
      const presented = digestOf({
        guards: input.permit.guards.map(strip),
        request: input.permit.request,
      })
      if (permits.get(start) !== presented) {
        const exclusion = excluded.get(start)
        return reply(
          exclusion === undefined
            ? fail({ kind: 'invalid', field: 'permit', reason: 'not-issued' })
            : succeed({ kind: 'not-started', exclusion }),
        )
      }
      permits.delete(start)
      const moved = input.permit.guards.some(
        guard =>
          fenceOf(input.tenant, guard.owner, guard.resource).revision !== Number(guard.revision),
      )
      if (moved) {
        const reason = 'a guard was invalidated before the start'
        const refusal: Refusal = {
          kind: 'rejected',
          reason,
          exclusion: mint('rejection', { start }),
        }
        rejected.set(start, refusal)
        return reply(succeed(refusal))
      }
      let authorizations: readonly ToolPermitConsumption[] = []
      if (authorization !== null) {
        const consumed = authorization.admitted(input.tenant, input.call)
          ? authorization.consume(input.tenant, input.call)
          : { kind: 'refused' as const, reason: 'the admission was revoked before the start' }
        if (consumed.kind === 'refused') {
          const refusal: Refusal = {
            kind: 'rejected',
            reason: consumed.reason,
            exclusion: mint('rejection', { start, reason: consumed.reason }),
          }
          rejected.set(start, refusal)
          return reply(succeed(refusal))
        }
        authorizations = consumed.facts
      }
      const acceptance = mint('acceptance', { start, receipt: input.executorReceipt })
      acceptances.set(acceptance.record, {
        tenant: input.tenant,
        call: input.call,
        start: input.permit.start,
        permit: input.permit.request,
        guards: input.permit.guards,
        authorizations,
        executorReceipt: input.executorReceipt,
        acceptance,
      })
      accepted.set(start, acceptance)
      acceptedCalls.add(callKey(input))
      return reply(succeed({ kind: 'started', acceptance }))
    },
    inspect: input => {
      const start = startKey(input, input.start.operation)
      const known = decided(callKey(input), start)
      if (known !== null) return reply(succeed(known))
      // Neither accepted nor rejected: a permit issued before this answer must not be consumed
      // after it, so the permit is withdrawn before the answer is given.
      permits.delete(start)
      const exclusion = excluded.get(start) ?? mint('exclusion', { start })
      excluded.set(start, exclusion)
      return reply(succeed({ kind: 'not-started', exclusion }))
    },
    invalidate: input => {
      const at = JSON.stringify(['invalidate', tenantKey(input.tenant), input.operation])
      const digest = digestOf({ kind: 'invalidate', guard: strip(input.guard) })
      const known = operations.get(at)
      if (known !== undefined)
        return reply(
          known.digest === digest
            ? succeed(known.evidence)
            : fail({ kind: 'conflict', operation: input.operation }),
        )
      const fence = fenceOf(input.tenant, input.guard.owner, input.guard.resource)
      fence.revision += 1
      fence.operation = input.operation
      fence.evidence = mint('invalidation', { guard: fence.revision, operation: input.operation })
      operations.set(at, { digest, evidence: fence.evidence })
      return reply(succeed(fence.evidence))
    },
    exclude: input => {
      const call = callKey(input)
      const at = JSON.stringify(['exclude', tenantKey(input.tenant), input.operation])
      const digest = digestOf({ kind: 'exclude', call: input.call, reason: input.reason })
      const known = operations.get(at)
      if (known !== undefined)
        return reply(
          known.digest === digest
            ? succeed(known.evidence)
            : fail({ kind: 'conflict', operation: input.operation }),
        )
      const existing = callRejected.get(call)
      if (existing !== undefined) return reply(succeed(existing.exclusion))
      if (acceptedCalls.has(call))
        return reply(fail({ kind: 'conflict', operation: input.operation }))
      const exclusion = mint('call-rejection', { call, reason: input.reason })
      callRejected.set(call, { kind: 'rejected', reason: input.reason, exclusion })
      operations.set(at, { digest, evidence: exclusion })
      return reply(succeed(exclusion))
    },
  }
  return Object.freeze({
    authority: Object.freeze({ ...authority, durability: 'none' as const }),
    acceptanceOf: (acceptance: DurableEvidence) => acceptances.get(acceptance.record) ?? null,
  })
}

// ---------------------------------------------------------------------------------------------
// The authorization side of the double (SPEC「授权消费点与撤权再核」)
// ---------------------------------------------------------------------------------------------

/** What the permit ledger holds for a permit: open, consumed with its fact, or no such permit. */
export type ToolPermitReading =
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'consumed'; fact: ToolPermitConsumption }>
  | Readonly<{ kind: 'unknown' }>

/**
 * The handles of the authorization side that the suite drives. `bind` attaches a permit to the
 * start of `call` as the trusted configuration of the provider does, a fresh one without `permit`.
 * `revoke` revokes, at the authorization owner, the admission of the action of `call`. `read` reads
 * the permit at the permit ledger.
 */
export interface ToolStartAuthorizationHandles<P> {
  bind(
    input: Readonly<{ access: Access<P>; call: ToolCallId; permit?: ToolPermitRef }>,
  ): Promise<ToolPermitRef>
  revoke(input: Readonly<{ access: Access<P>; call: ToolCallId }>): Promise<void>
  read(permit: ToolPermitRef): Promise<ToolPermitReading>
}

/**
 * The in-memory start authority with an in-memory authorization side: the handles of the suite,
 * and the acceptance record that `started.acceptance` locates.
 */
export interface MemoryAuthorizedToolStartAuthority<P> extends MemoryToolStartAuthority<P> {
  readonly authorization: ToolStartAuthorizationHandles<P>
  acceptanceOf(acceptance: DurableEvidence): ToolStartAcceptance | null
}

/** The owner named in the consumption position of the double. */
const CONSUMER_OWNER = 'conformance-start-authority'

type Entry = { readonly ref: ToolPermitRef; state: ToolPermitReading }

/**
 * A start authority whose consume rechecks the admission and consumes the bound permits in the same
 * turn as the acceptance (P04). The position of a consumption is the call, so every start of the
 * call recognises its own consumption and every other call meets `already-consumed`.
 */
export function createMemoryAuthorizedToolStartAuthority<
  P,
>(): MemoryAuthorizedToolStartAuthority<P> {
  const permits = new Map<string, Entry>()
  const bindings = new Map<string, ToolPermitRef[]>()
  const revoked = new Set<string>()
  let granted = 0

  const callKey = (tenant: Tenant, call: ToolCallId): string =>
    JSON.stringify([tenantKey(tenant), call])
  const permitKey = (ref: ToolPermitRef): string =>
    JSON.stringify([tenantKey(ref.tenant), ref.permit])

  const domain = buildMemoryStartDomain<P>({
    admitted: (tenant, call) => !revoked.has(callKey(tenant, call)),
    consume: (tenant, call) => {
      const consumer = { owner: CONSUMER_OWNER, work: call, position: call }
      const facts: ToolPermitConsumption[] = []
      for (const ref of bindings.get(callKey(tenant, call)) ?? []) {
        const entry = permits.get(permitKey(ref))
        if (entry === undefined) return { kind: 'refused', reason: 'the permit is unknown' }
        if (entry.state.kind === 'consumed') {
          if (entry.state.fact.consumer.work !== call)
            return { kind: 'refused', reason: 'the permit was consumed by another call' }
          facts.push(entry.state.fact)
          continue
        }
        const fact: ToolPermitConsumption = Object.freeze({
          permit: ref,
          consumer: Object.freeze(consumer),
          evidence: mintEvidence(`permit-consumption/${permitKey(ref)}`, { ref, consumer }),
        })
        entry.state = Object.freeze({ kind: 'consumed', fact })
        facts.push(fact)
      }
      return { kind: 'consumed', facts }
    },
  })

  const authorization: ToolStartAuthorizationHandles<P> = {
    bind: input => {
      let ref = input.permit
      if (ref === undefined) {
        granted += 1
        ref = Object.freeze({ tenant: input.access.tenant, permit: `permit-${granted}` })
        permits.set(permitKey(ref), { ref, state: Object.freeze({ kind: 'open' }) })
      }
      const key = callKey(input.access.tenant, input.call)
      bindings.set(key, [...(bindings.get(key) ?? []), ref])
      return Promise.resolve(ref)
    },
    revoke: input => {
      revoked.add(callKey(input.access.tenant, input.call))
      return Promise.resolve()
    },
    read: permit =>
      Promise.resolve(permits.get(permitKey(permit))?.state ?? Object.freeze({ kind: 'unknown' })),
  }

  return Object.freeze({
    ...domain.authority,
    authorization: Object.freeze(authorization),
    acceptanceOf: domain.acceptanceOf,
  })
}

/** A fresh fixture over a fresh in-memory authority. */
export function memoryToolStartAuthorityFixture(): ToolStartAuthorityFixture<string> {
  return {
    authority: createMemoryToolStartAuthority<string>(),
    access: memoryAccess('tester'),
    otherAccess: memoryOtherAccess('tester-other'),
    // Every answer of the double is decided when the call returns, so nothing is left to land.
    settle: () => Promise.resolve(),
  }
}

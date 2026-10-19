// The ToolEnvironment conformance suite (P03, story 22) and a non-durable double that conforms to
// it. The double keeps its state in memory and declares `durability: 'none'`: it proves nothing
// about a durable provider and must not be assembled into production.
import assert from 'node:assert/strict'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { FixedToolRequest } from './definitions.ts'
import type { Access, DurableEvidence, ToolCallId } from './identity.ts'
import type { ToolEnvironment } from './ports.ts'
import type {
  PreparationProgress,
  PreparationRecord,
  ReleaseProgress,
  ReleaseRecord,
} from './records.ts'
import type { ToolFailure } from './results.ts'
import {
  completionOf,
  conformanceCase,
  crossTenantAnswers,
  expectKind,
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
  callId,
  digestOf,
  evidence,
  fixedRequest,
  identifyingValues,
  memoryAccess,
  memoryOtherAccess,
  mintEvidence,
  preparationRecord,
  releaseRecord,
  tenantKey,
} from './testing-values.ts'

/**
 * What the environment suite needs. A fresh fixture serves one case. The optional handles are
 * the controls of the provider: a case that needs one that is missing is reported not applicable.
 * `allocations` counts the resources the environment allocated. `hold` makes the next preparation
 * answer pending with its allocation deferred; nothing lands before `settle`. `settle` lands the
 * deferred allocations that were not excluded, and, for a provider that answers `pending` or
 * `unknown` to a preparation or a release that it completes later, lands that work too: it
 * resolves only after the deferred work has landed and is visible to every read of the port (the
 * suite asks once more after it and never polls). Without `settle`, a case that needs a final
 * answer is reported not applicable when the first answer is progress. `excludeDeferred` excludes
 * the deferred allocation of one preparation, and resolves when the exclusion holds. `rejectNext`
 * makes the next new preparation fail with a reason. `otherAccess` is the access of a second
 * tenant, with a principal of its own: the cases that check that another tenant neither reads nor
 * changes a record of the first are reported not applicable without it.
 */
export interface ToolEnvironmentFixture<P, E> {
  readonly environment: ToolEnvironment<P, E>
  readonly access: Access<P>
  readonly otherAccess?: Access<P>
  readonly request?: FixedToolRequest
  /** Counts the allocations made so far (a read: nothing is deferred, nothing to wait for). */
  allocations?(): number
  /** Makes the next preparation answer pending: its allocation lands at `settle`, not before. */
  hold?(): void
  /** Resolves after every deferred allocation, preparation and release has landed and is visible to every read. */
  settle?(): Promise<void>
  /** Resolves after the exclusion of the deferred allocation of this preparation holds. */
  excludeDeferred?(preparation: PreparationRecord): Promise<void>
  /** Makes the next new preparation fail with this reason (it takes effect at once). */
  rejectNext?(reason: string): void
}

const UNSETTLED = ['pending', 'unknown']

/**
 * The answer model of the environment port (P03): `pending` and `unknown` keep the original task,
 * so every other kind of a preparation (`prepared`, `excluded`, `rejected`) and of a release
 * (`released`, `rejected`) is final.
 */
export const environmentAnswers = {
  prepare: { clause: 'P03', progress: UNSETTLED },
  inspectPreparation: { clause: 'P03', progress: UNSETTLED },
  release: { clause: 'P03', progress: UNSETTLED },
  inspectRelease: { clause: 'P03', progress: UNSETTLED },
} as const satisfies AnswerModel<keyof ToolEnvironment<unknown, unknown>>

/** What a preparation answer says apart from the reconnect capability, which may be a fresh handle. */
const preparationView = <E>(answer: PreparationProgress<E>): unknown =>
  answer.kind === 'prepared'
    ? {
        kind: 'prepared',
        evidence: answer.environment.evidence,
        preparation: answer.environment.preparation,
      }
    : answer

function scene<P, E>(fixture: ToolEnvironmentFixture<P, E>, access: Access<P> = fixture.access) {
  const { environment } = fixture
  const request = fixture.request ?? fixedRequest()
  const record = (operation = 'prepare-1', call: ToolCallId = callId('call-1')) =>
    preparationRecord(access, call, operation, request)
  const input = (preparation: PreparationRecord) => ({
    ...access,
    call: preparation.call,
    preparation,
  })
  const completion = completionOf(fixture, 'settle')
  const prepare = async (preparation: PreparationRecord): Promise<PreparationProgress<E>> =>
    succeeded(await environment.prepare(input(preparation)), 'prepare')
  const release = (release: ReleaseRecord) =>
    environment.release({ ...access, call: release.call, release })
  const inspect = (preparation: PreparationRecord) =>
    environment.inspectPreparation(input(preparation))
  const inspectRelease = (release: ReleaseRecord) =>
    environment.inspectRelease({ ...access, call: release.call, release })
  /** The final answer of a preparation, whatever its kind (prepared, excluded or rejected). */
  const prepareFinal = (preparation: PreparationRecord): Promise<PreparationProgress<E>> =>
    finalAnswer({
      ask: () => prepare(preparation),
      row: environmentAnswers.prepare,
      completion,
      view: preparationView,
      what: 'prepare',
    })
  return {
    completion,
    /** What every call of the scene sends besides its record: its access. */
    sends: [access] as const,
    record,
    prepare,
    inspect,
    release,
    inspectRelease,
    prepareFinal,
    /** The final answer of `inspectPreparation` for an operation that was asked before. */
    inspectFinal: (preparation: PreparationRecord): Promise<PreparationProgress<E>> =>
      finalAnswer({
        ask: async () => succeeded(await inspect(preparation), 'inspectPreparation'),
        row: environmentAnswers.inspectPreparation,
        completion,
        view: preparationView,
        what: 'inspectPreparation',
      }),
    prepared: async (preparation: PreparationRecord) =>
      expectKind(await prepareFinal(preparation), 'prepared', 'prepare').environment,
    released: async (record: ReleaseRecord) =>
      expectKind(
        await finalAnswer({
          ask: async () => succeeded(await release(record), 'release'),
          row: environmentAnswers.release,
          completion,
          what: 'release',
        }),
        'released',
        'release',
      ),
  }
}

type Fixture<P, E> = ToolEnvironmentFixture<P, E>

async function preparationResent<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const s = scene(fixture)
  const record = s.record()
  const first = await s.prepareFinal(record)
  expectKind(first, 'prepared', 'prepare')
  const resent = await s.prepare(record)
  resendRecalls(
    environmentAnswers.prepare,
    { earlier: preparationView(first), later: preparationView(resent) },
    'resend',
  )
  const concurrent = await Promise.all([s.prepare(record), s.prepare(record)])
  for (const again of concurrent)
    resendRecalls(
      environmentAnswers.prepare,
      { earlier: preparationView(first), later: preparationView(again) },
      'resend',
    )
}

async function resentAllocatesNothing<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const allocations = handle(fixture.allocations, 'allocations')
  const s = scene(fixture)
  const record = s.record()
  await s.prepared(record)
  await s.prepared(record)
  assert.equal(allocations.call(fixture), 1)
}

async function pendingResentAllocatesNothing<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const allocations = handle(fixture.allocations, 'allocations')
  const hold = handle(fixture.hold, 'hold')
  const settle = handle(fixture.settle, 'settle')
  const s = scene(fixture)
  const record = s.record()
  hold.call(fixture)
  const first = await s.prepare(record)
  assert.ok(isProgress(first, environmentAnswers.prepare), 'prepare under hold is progress')
  // The original task is kept: asking again neither lands it nor starts another one. Nothing
  // lands before `settle`, so the answer is still progress.
  const resent = await s.prepare(record)
  assert.ok(
    isProgress(resent, environmentAnswers.prepare),
    'prepare again while pending is progress',
  )
  await settle.call(fixture)
  await s.prepared(record)
  assert.equal(allocations.call(fixture), 1)
}

async function inspectRecallsAllocation<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const s = scene(fixture)
  const record = s.record()
  const first = await s.prepared(record)
  const inspected = expectKind(await s.inspectFinal(record), 'prepared', 'inspectPreparation')
  assert.deepEqual(inspected.environment.evidence, first.evidence)
  assert.deepEqual(inspected.environment.preparation, record)
}

async function inspectClaimsNothing<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const s = scene(fixture)
  const inspected = await s.inspect(s.record())
  if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'prepared')
}

async function resourceOfOneCall<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const s = scene(fixture)
  const first = s.record('prepare-1', callId('call-1'))
  const other = s.record('prepare-1', callId('call-2'))
  const original = await s.prepared(first)
  const inspected = await s.inspect(other)
  if ('ok' in inspected && inspected.ok.kind === 'prepared')
    assert.notDeepEqual(inspected.ok.environment.evidence, original.evidence)
  const foreign = await s.prepared(other)
  assert.notDeepEqual(foreign.evidence, original.evidence)
}

async function pendingKeepsAllocation<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const hold = handle(fixture.hold, 'hold')
  const settle = handle(fixture.settle, 'settle')
  const s = scene(fixture)
  const record = s.record()
  hold.call(fixture)
  const first = await s.prepare(record)
  assert.ok(isProgress(first, environmentAnswers.prepare), 'prepare under hold is progress')
  const pending = succeeded(await s.inspect(record), 'inspectPreparation')
  assert.ok(
    isProgress(pending, environmentAnswers.inspectPreparation),
    'inspectPreparation under hold',
  )
  await settle.call(fixture)
  const landed = succeeded(await s.inspect(record), 'inspectPreparation after landing')
  const prepared = expectKind(landed, 'prepared', 'inspectPreparation after the landing')
  const again = await s.prepared(record)
  assert.deepEqual(again.evidence, prepared.environment.evidence)
}

async function excludedExcludesDeferred<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const hold = handle(fixture.hold, 'hold')
  const settle = handle(fixture.settle, 'settle')
  const excludeDeferred = handle(fixture.excludeDeferred, 'excludeDeferred')
  const s = scene(fixture)
  const record = s.record()
  hold.call(fixture)
  const first = await s.prepare(record)
  assert.ok(isProgress(first, environmentAnswers.prepare), 'prepare under hold is progress')
  await excludeDeferred.call(fixture, record)
  await settle.call(fixture)
  const landed = succeeded(await s.inspect(record), 'inspectPreparation after exclusion')
  const excluded = expectKind(landed, 'excluded', 'inspectPreparation after the exclusion')
  assert.ok(excluded.exclusion.digest.length > 0)
  resendRecalls(
    environmentAnswers.inspectPreparation,
    { earlier: excluded, later: succeeded(await s.inspect(record), 'inspectPreparation again') },
    'inspectPreparation again',
  )
}

async function excludedAllocatesNothing<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const allocations = handle(fixture.allocations, 'allocations')
  const hold = handle(fixture.hold, 'hold')
  const settle = handle(fixture.settle, 'settle')
  const excludeDeferred = handle(fixture.excludeDeferred, 'excludeDeferred')
  const s = scene(fixture)
  const record = s.record()
  hold.call(fixture)
  assert.ok(isProgress(await s.prepare(record), environmentAnswers.prepare), 'prepare under hold')
  await excludeDeferred.call(fixture, record)
  await settle.call(fixture)
  expectKind(succeeded(await s.inspect(record), 'inspectPreparation'), 'excluded', 'inspect')
  assert.equal(allocations.call(fixture), 0, 'the excluded preparation allocated')
}

async function rejectionKept<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const rejectNext = handle(fixture.rejectNext, 'rejectNext')
  const s = scene(fixture)
  const record = s.record()
  rejectNext.call(fixture, 'the image is missing')
  const rejected = expectKind(await s.prepareFinal(record), 'rejected', 'prepare')
  assert.ok(rejected.reason.includes('the image is missing'), 'the rejection names the failure')
  resendRecalls(
    environmentAnswers.inspectPreparation,
    { earlier: rejected, later: succeeded(await s.inspect(record), 'inspectPreparation') },
    'inspectPreparation',
  )
  resendRecalls(
    environmentAnswers.prepare,
    { earlier: rejected, later: await s.prepare(record) },
    'prepare again',
  )
}

async function releaseResent<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const s = scene(fixture)
  const record = s.record()
  const release = releaseRecord(record, 'release-1', (await s.prepared(record)).evidence)
  const first = await s.released(release)
  resendRecalls(
    environmentAnswers.release,
    { earlier: first, later: succeeded(await s.release(release), 'release again') },
    'release again',
  )
}

async function inspectRecallsRelease<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const s = scene(fixture)
  const record = s.record()
  const release = releaseRecord(record, 'release-1', (await s.prepared(record)).evidence)
  const first = await s.released(release)
  resendRecalls(
    environmentAnswers.inspectRelease,
    { earlier: first, later: succeeded(await s.inspectRelease(release), 'inspectRelease') },
    'inspectRelease',
  )
}

async function releaseNeverSubmitted<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const s = scene(fixture)
  const record = s.record()
  const release = releaseRecord(record, 'release-1', evidence('resource'))
  const inspected = await s.inspectRelease(release)
  if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'released')
}

async function preparationConflict<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const s = scene(fixture)
  const record = s.record()
  const original = await s.prepared(record)
  const other = { ...record, inputDigest: 'sha256:another-input' }
  assert.equal(
    refused(
      await fixture.environment.prepare({
        ...fixture.access,
        call: record.call,
        preparation: other,
      }),
      'prepare with another input under the same operation',
    ).kind,
    'conflict',
  )
  const inspected = expectKind(await s.inspectFinal(record), 'prepared', 'inspectPreparation')
  assert.deepEqual(inspected.environment.evidence, original.evidence)
  const allocations = fixture.allocations?.call(fixture)
  if (allocations !== undefined) assert.equal(allocations, 1, 'the conflict allocated')
}

async function releaseConflict<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const s = scene(fixture)
  const record = s.record()
  const release = releaseRecord(record, 'release-1', (await s.prepared(record)).evidence)
  const first = await s.released(release)
  const other = { ...release, inputDigest: 'sha256:another-input' }
  assert.equal(
    refused(await s.release(other), 'release with another input under the same operation').kind,
    'conflict',
  )
  resendRecalls(
    environmentAnswers.inspectRelease,
    { earlier: first, later: succeeded(await s.inspectRelease(release), 'inspectRelease') },
    'inspectRelease after the conflict',
  )
}

async function foreignInspectPreparation<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const original = await own.prepared(own.record())
  // The other tenant asks with the same call and operation: only the evidence identifies the record.
  const asked = other.record()
  await crossTenantAnswers({
    ask: {
      real: () => other.inspect(asked),
      ghost: () => other.inspect(other.record('prepare-ghost')),
    },
    row: environmentAnswers.inspectPreparation,
    completion: other.completion,
    identifying: identifyingValues(fixture.access.tenant, original.evidence),
    submitted: [...other.sends, asked],
    what: 'inspectPreparation by another tenant',
  })
  const again = expectKind(
    await own.inspectFinal(own.record()),
    'prepared',
    'inspectPreparation by the own tenant',
  )
  assert.deepEqual(again.environment.evidence, original.evidence)
}

async function foreignPreparation<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const original = await own.prepared(own.record())
  // The same call and operation of another tenant is a preparation of its own.
  const answer = await other.prepareFinal(other.record())
  if (answer.kind === 'prepared')
    assert.notDeepEqual(answer.environment.evidence, original.evidence)
  const again = await own.prepared(own.record())
  assert.deepEqual(again.evidence, original.evidence)
}

async function foreignRelease<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const record = own.record()
  const resource = (await own.prepared(record)).evidence
  const release = releaseRecord(record, 'release-1', resource)
  // The other tenant sends the resource evidence itself, so only the tenant identifies the record.
  const asked = releaseRecord(other.record(), 'release-1', resource)
  await crossTenantAnswers({
    ask: {
      real: () => other.release(asked),
      ghost: () =>
        other.release(releaseRecord(other.record(), 'release-2', evidence('ghost-resource'))),
    },
    row: environmentAnswers.release,
    completion: other.completion,
    identifying: identifyingValues(fixture.access.tenant),
    submitted: [...other.sends, asked],
    what: 'release by another tenant',
  })
  // Nothing of the own tenant was released.
  const inspected = await own.inspectRelease(release)
  if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'released')
  await own.released(release)
}

async function foreignInspectRelease<P, E>(fixture: Fixture<P, E>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const record = own.record()
  const resource = (await own.prepared(record)).evidence
  const release = releaseRecord(record, 'release-1', resource)
  const first = await own.released(release)
  const asked = releaseRecord(other.record(), 'release-1', resource)
  await crossTenantAnswers({
    ask: {
      real: () => other.inspectRelease(asked),
      ghost: () =>
        other.inspectRelease(
          releaseRecord(other.record(), 'release-ghost', evidence('ghost-resource')),
        ),
    },
    row: environmentAnswers.inspectRelease,
    completion: other.completion,
    identifying: identifyingValues(fixture.access.tenant, first.evidence),
    submitted: [...other.sends, asked],
    what: 'inspectRelease by another tenant',
  })
  resendRecalls(
    environmentAnswers.inspectRelease,
    {
      earlier: first,
      later: succeeded(await own.inspectRelease(release), 'inspectRelease by the own tenant'),
    },
    'inspectRelease by the own tenant',
  )
}

export function toolEnvironmentConformance<P, E>(): readonly ConformanceCase<Fixture<P, E>>[] {
  const named = (name: string, run: (fixture: Fixture<P, E>) => Promise<void>) =>
    conformanceCase('P03', name, run)
  const conflict = (name: string, run: (fixture: Fixture<P, E>) => Promise<void>) =>
    conformanceCase('P01', name, run)
  return [
    named('a preparation resent by its operation returns the original resource', preparationResent),
    named('a resent preparation allocates nothing new', resentAllocatesNothing),
    named(
      'a preparation resent while it is pending allocates nothing new',
      pendingResentAllocatesNothing,
    ),
    named('inspectPreparation recalls the original allocation', inspectRecallsAllocation),
    named(
      'inspectPreparation claims nothing for an operation never prepared',
      inspectClaimsNothing,
    ),
    named('the resource of one call is not answered to another call', resourceOfOneCall),
    named('a pending preparation keeps its allocation until it lands', pendingKeepsAllocation),
    named('an excluded preparation excludes the deferred allocation', excludedExcludesDeferred),
    named(
      'an excluded preparation allocates nothing when the deferred work lands',
      excludedAllocatesNothing,
    ),
    named('a rejected preparation keeps its failure and does not degrade', rejectionKept),
    named('a release resent by its operation returns the original evidence', releaseResent),
    named('inspectRelease recalls the release', inspectRecallsRelease),
    named('inspectRelease of a release never submitted is not released', releaseNeverSubmitted),
    conflict(
      'a preparation operation reused with another input is a conflict that changes nothing',
      preparationConflict,
    ),
    conflict(
      'a release operation reused with another input is a conflict that changes nothing',
      releaseConflict,
    ),
    named(
      'another tenant learns nothing of a preparation by inspectPreparation',
      foreignInspectPreparation,
    ),
    named('another tenant does not receive the resource of a tenant', foreignPreparation),
    named('another tenant cannot release the resource of a tenant', foreignRelease),
    named('another tenant learns nothing of a release by inspectRelease', foreignInspectRelease),
  ]
}

// ---------------------------------------------------------------------------------------------
// The non-durable double
// ---------------------------------------------------------------------------------------------

/** What the double hands out as the reconnect capability of an allocated environment. */
export type MemoryEnvironment = Readonly<{ resource: string }>

export interface MemoryToolEnvironment<P> extends ToolEnvironment<P, MemoryEnvironment> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    allocations(): number
    hold(): void
    settle(): Promise<void>
    excludeDeferred(preparation: PreparationRecord): Promise<void>
    rejectNext(reason: string): void
  }>
}

type Entry =
  | { kind: 'prepared'; progress: PreparationProgress<MemoryEnvironment> }
  | { kind: 'pending'; record: PreparationRecord }
  | { kind: 'excluded'; exclusion: DurableEvidence }
  | { kind: 'rejected'; progress: PreparationProgress<MemoryEnvironment> }

type Tenant = Access<unknown>['tenant']

const reply = <T>(outcome: Outcome<T, ToolFailure>): Promise<Outcome<T, ToolFailure>> =>
  Promise.resolve(outcome)

/**
 * An environment that allocates in memory. A preparation is keyed by tenant, call and operation:
 * a resend answers the original allocation, and a call never sees the resource of another call.
 */
export function createMemoryToolEnvironment<P>(): MemoryToolEnvironment<P> {
  const preparations = new Map<string, Entry>()
  const releases = new Map<string, ReleaseProgress>()
  /** What each operation was asked to do: the same identity with another input is a conflict. */
  const asked = new Map<string, string>()
  let allocated = 0
  let held = false
  let rejection: string | null = null
  let minted = 0

  const key = (tenant: Tenant, call: ToolCallId, operation: string): string =>
    JSON.stringify([tenantKey(tenant), call, operation])
  const mint = (kind: string, content: unknown): DurableEvidence => {
    minted += 1
    return mintEvidence(`environment/${kind}/${minted}`, content)
  }
  const allocate = (record: PreparationRecord): PreparationProgress<MemoryEnvironment> => {
    allocated += 1
    return {
      kind: 'prepared',
      environment: {
        value: { resource: `resource-${allocated}` },
        evidence: mint('resource', { allocation: allocated }),
        preparation: record,
      },
    }
  }
  const answer = (entry: Entry): PreparationProgress<MemoryEnvironment> => {
    switch (entry.kind) {
      case 'prepared':
      case 'rejected':
        return entry.progress
      case 'excluded':
        return { kind: 'excluded', exclusion: entry.exclusion }
      case 'pending':
        return { kind: 'pending', diagnostic: 'the allocation is deferred' }
    }
  }

  const environment: ToolEnvironment<P, MemoryEnvironment> = {
    prepare: input => {
      const record = input.preparation
      const at = key(input.tenant, record.call, record.operation)
      const digest = digestOf({
        kind: 'prepare',
        adoption: record.adoption,
        inputDigest: record.inputDigest,
        purpose: record.purpose,
      })
      if (asked.get(at) !== undefined && asked.get(at) !== digest)
        return reply(fail({ kind: 'conflict', operation: record.operation }))
      asked.set(at, digest)
      const existing = preparations.get(at)
      // An exclusion lets the original operation ask again; every other answer is the original.
      if (existing !== undefined && existing.kind !== 'excluded')
        return reply(succeed(answer(existing)))
      if (rejection !== null) {
        const reason = rejection
        rejection = null
        const progress: PreparationProgress<MemoryEnvironment> = {
          kind: 'rejected',
          reason,
          evidence: mint('rejection', { reason }),
        }
        preparations.set(at, { kind: 'rejected', progress })
        return reply(succeed(progress))
      }
      if (held) {
        held = false
        const entry: Entry = { kind: 'pending', record }
        preparations.set(at, entry)
        return reply(succeed(answer(entry)))
      }
      const entry: Entry = { kind: 'prepared', progress: allocate(record) }
      preparations.set(at, entry)
      return reply(succeed(answer(entry)))
    },
    inspectPreparation: input => {
      const entry = preparations.get(
        key(input.tenant, input.preparation.call, input.preparation.operation),
      )
      return reply(
        succeed(
          entry === undefined
            ? { kind: 'unknown', diagnostic: 'no preparation of this operation was seen' }
            : answer(entry),
        ),
      )
    },
    release: input => {
      const at = key(input.tenant, input.release.call, input.release.operation)
      const digest = digestOf({
        kind: 'release',
        adoption: input.release.adoption,
        inputDigest: input.release.inputDigest,
        preparation: input.release.preparation,
        resource: input.release.resource,
      })
      if (asked.get(`release/${at}`) !== undefined && asked.get(`release/${at}`) !== digest)
        return reply(fail({ kind: 'conflict', operation: input.release.operation }))
      asked.set(`release/${at}`, digest)
      let progress = releases.get(at)
      if (progress === undefined) {
        progress = {
          kind: 'released',
          evidence: mint('release', { resource: input.release.resource }),
        }
        releases.set(at, progress)
      }
      return reply(succeed(progress))
    },
    inspectRelease: input =>
      reply(
        succeed(
          releases.get(key(input.tenant, input.release.call, input.release.operation)) ?? {
            kind: 'unknown',
            diagnostic: 'no release of this operation was seen',
          },
        ),
      ),
  }

  const controls: MemoryToolEnvironment<P>['controls'] = {
    allocations: () => allocated,
    hold: () => {
      held = true
    },
    settle: () => {
      for (const [at, entry] of preparations)
        if (entry.kind === 'pending')
          preparations.set(at, { kind: 'prepared', progress: allocate(entry.record) })
      return Promise.resolve()
    },
    excludeDeferred: preparation => {
      for (const [at, entry] of preparations)
        if (entry.kind === 'pending' && entry.record.operation === preparation.operation)
          preparations.set(at, { kind: 'excluded', exclusion: mint('exclusion', { at }) })
      return Promise.resolve()
    },
    rejectNext: reason => {
      rejection = reason
    },
  }
  return Object.freeze({ ...environment, durability: 'none' as const, controls })
}

/** A fresh fixture over a fresh in-memory environment, with every control handle. */
export function memoryToolEnvironmentFixture(): ToolEnvironmentFixture<string, MemoryEnvironment> {
  const environment = createMemoryToolEnvironment<string>()
  const { controls } = environment
  return {
    environment,
    access: memoryAccess('tester'),
    otherAccess: memoryOtherAccess('tester-other'),
    allocations: controls.allocations,
    hold: controls.hold,
    settle: controls.settle,
    excludeDeferred: controls.excludeDeferred,
    rejectNext: controls.rejectNext,
  }
}

// What the decision bridge suite and the resource response suite share (P06): both ports register
// a business association by call and wait, answer the original operation with `inspectOperation`,
// and take an invalidation that may arrive before the registration lands. The cases that check
// this are written once over a small peer view of the port, and the non-durable doubles of both
// ports keep their operations in the same ledger. Nothing here is exported from the entry.
import assert from 'node:assert/strict'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolOperationId } from './identity.ts'
import type { ExternalOperationResolution } from './records.ts'
import type { Reply, ToolFailure } from './results.ts'
import {
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
  type AnswerRow,
  type Completion,
  type ConformanceCase,
  type TwoTenantFixture,
} from './testing-case.ts'
import { digestOf, evidence, identifyingValues, operationId } from './testing-values.ts'

/**
 * One port seen through the calls that both external-association ports have. `wait` and
 * `operation` are identity texts. `hold`, `settle`, `excludeDeferred` and `invalidations` are the
 * control handles of the provider (see the fixtures); `completion` is `settle` as the completion
 * handle that drives a progress answer. `sends` holds what every call of the peer sends besides its
 * operation, its wait and the evidence that it passes: the access and the call.
 */
export interface ExternalPeer {
  readonly completion: Completion
  readonly sends: readonly unknown[]
  ensure(operation: string, wait?: string): Promise<Outcome<DurableEvidence, ToolFailure>>
  inspect(wait?: string): Promise<Outcome<DurableEvidence, ToolFailure>>
  invalidate(operation: string, wait?: string): Promise<Outcome<DurableEvidence, ToolFailure>>
  inspectOperation(operation: string): Reply<ExternalOperationResolution>
  hold?(): void
  settle?(): Promise<void>
  excludeDeferred?(operation: ToolOperationId): Promise<void>
  invalidations?(): readonly DurableEvidence[]
}

/**
 * The control handles that both external-association fixtures offer. Completion contract: a
 * handle that drives deferred work (`settle`, `excludeDeferred`) resolves only after that work has
 * landed and is visible to every read of the port; the suite asks once more and never polls.
 */
export interface ExternalHandles {
  /** Defers the next new operation: it is not applied and its reply is lost (`commit-unknown`). */
  hold?(): void
  /** Resolves after every deferred operation that was not excluded has landed and is readable. */
  settle?(): Promise<void>
  /** Resolves after the deferred operation of this identity is excluded for good. */
  excludeDeferred?(operation: ToolOperationId): Promise<void>
  /** Lists the registrations that were invalidated, each once (a read, with no deferred work). */
  invalidations?(): readonly DurableEvidence[]
}

/** The handles of a fixture that it offers, each bound to the fixture. */
export function boundHandles(
  fixture: ExternalHandles,
): Pick<ExternalPeer, 'hold' | 'settle' | 'excludeDeferred' | 'invalidations'> {
  const bound: {
    -readonly [K in 'hold' | 'settle' | 'excludeDeferred' | 'invalidations']?: ExternalPeer[K]
  } = {}
  const { hold, settle, excludeDeferred, invalidations } = fixture
  if (hold !== undefined) bound.hold = () => hold.call(fixture)
  if (settle !== undefined) bound.settle = () => settle.call(fixture)
  if (excludeDeferred !== undefined)
    bound.excludeDeferred = operation => excludeDeferred.call(fixture, operation)
  if (invalidations !== undefined) bound.invalidations = () => invalidations.call(fixture)
  return bound
}

/** The success of `outcome` mapped by `change`; a failure is passed on. */
export function mapOk<T, U>(
  outcome: Outcome<T, ToolFailure>,
  change: (value: T) => U,
): Outcome<U, ToolFailure> {
  return 'ok' in outcome ? { ok: change(outcome.ok) } : outcome
}

/** The part of a fixture that the shared cases read: the access of the own tenant and of another. */
export type ExternalFixture = TwoTenantFixture

export type PeerView<F extends ExternalFixture> = (fixture: F, access: F['access']) => ExternalPeer

/** The wait that the cases use unless they name another. */
export const WAIT = 'wait-1'

/** The terminal evidence that an invalidation of a peer passes. */
export const TERMINAL: DurableEvidence = evidence('terminal')

function assertEvidence(value: DurableEvidence, what: string): void {
  assert.ok(value.owner.length > 0, `${what}: the owner of the evidence is named`)
  assert.ok(value.record.length > 0, `${what}: the record of the evidence is named`)
  assert.ok(value.digest.length > 0, `${what}: the digest of the evidence is named`)
}

/**
 * The answer model of the calls that both external-association ports have (P06, P01): `ensure` and
 * `invalidate` answer `commit-unknown` when the reply of a commit is lost, and the operation is then
 * asked again or inspected; `inspectOperation` answers `pending` or `unknown` while the original
 * operation is kept, and `committed` or `excluded` once it is decided. `inspect` reads the
 * association and has no progress kind.
 */
export const externalAnswers = {
  ensure: { clause: 'P06', progress: [], lostReply: ['commit-unknown'] },
  invalidate: { clause: 'P06', progress: [], lostReply: ['commit-unknown'] },
  inspect: { clause: 'P06', progress: [] },
  inspectOperation: { clause: 'P06', progress: ['pending', 'unknown'] },
} as const satisfies AnswerModel

/**
 * The success of an operation that the contract lets the provider answer later (a lost reply,
 * `commit-unknown`): it is driven to its end with the `settle` handle, the operation is asked
 * again, and the provider recalls the original answer. A provider that answers at once never needs
 * the handle.
 */
export async function landed<A>(
  completion: Completion,
  send: () => Promise<Outcome<A, ToolFailure>>,
  row: AnswerRow,
  what: string,
): Promise<A> {
  return succeeded(await finalAnswer({ ask: send, row, completion, what }), what)
}

/**
 * The cases of P06 that hold for every port that registers an association by call and wait.
 * Both suites list them first.
 */
export function externalAssociationCases<F extends ExternalFixture>(
  peerOf: PeerView<F>,
): readonly ConformanceCase<F>[] {
  const answers = externalAnswers
  const peer = (fixture: F) => peerOf(fixture, fixture.access)
  const foreign = (fixture: F) => peerOf(fixture, otherAccessOf(fixture))
  const ensured = (p: ExternalPeer, operation: string, wait?: string) =>
    landed(p.completion, () => p.ensure(operation, wait), answers.ensure, `ensure ${operation}`)
  const invalidated = (p: ExternalPeer, operation: string, wait?: string) =>
    landed(
      p.completion,
      () => p.invalidate(operation, wait),
      answers.invalidate,
      `invalidate ${operation}`,
    )
  /** The decided answer of `inspectOperation`: `pending` and `unknown` are driven by `settle`. */
  const decided = async (p: ExternalPeer, operation: string) =>
    succeeded(
      await finalAnswer({
        ask: () => p.inspectOperation(operation),
        row: answers.inspectOperation,
        completion: p.completion,
        what: `inspectOperation ${operation}`,
      }),
      `inspectOperation ${operation}`,
    )
  return [
    conformanceCase('P06', 'a resent ensure returns the original registration', async fixture => {
      const p = peer(fixture)
      const first = await ensured(p, 'ensure-1')
      assertEvidence(first, 'the registration is evidence of its owner')
      resendRecalls(
        answers.ensure,
        { earlier: { ok: first }, later: await p.ensure('ensure-1') },
        'resent ensure',
      )
      const concurrent = await Promise.all([p.ensure('ensure-1'), p.ensure('ensure-1')])
      for (const again of concurrent)
        resendRecalls(answers.ensure, { earlier: { ok: first }, later: again }, 'concurrent ensure')
    }),

    conformanceCase(
      'P06',
      'inspect recalls the registration that ensure answered',
      async fixture => {
        const p = peer(fixture)
        const registration = await ensured(p, 'ensure-1')
        assert.deepEqual(succeeded(await p.inspect(), 'inspect'), registration)
      },
    ),

    conformanceCase(
      'P06',
      'inspect claims no registration for a wait never ensured',
      async fixture => {
        const answer = await peer(fixture).inspect()
        refused(answer, 'inspect of a wait that was never ensured')
      },
    ),

    conformanceCase('P06', 'two waits of one call have two registrations', async fixture => {
      const p = peer(fixture)
      const one = await ensured(p, 'ensure-1', 'wait-1')
      const two = await ensured(p, 'ensure-2', 'wait-2')
      assert.notDeepEqual(two, one)
      assert.deepEqual(succeeded(await p.inspect('wait-1'), 'inspect wait-1'), one)
      assert.deepEqual(succeeded(await p.inspect('wait-2'), 'inspect wait-2'), two)
    }),

    conformanceCase(
      'P06',
      'a registration of one tenant is not recalled for another',
      async fixture => {
        const own = peer(fixture)
        const other = foreign(fixture)
        const registration = await ensured(own, 'ensure-1')
        const ensuredByOther = await finalAnswer({
          ask: () => other.ensure('ensure-1'),
          row: answers.ensure,
          completion: other.completion,
          what: 'ensure by another tenant',
        })
        if ('ok' in ensuredByOther) assert.notDeepEqual(ensuredByOther.ok, registration)
        assert.deepEqual(succeeded(await own.inspect(), 'inspect'), registration)
      },
    ),

    conformanceCase(
      'P06',
      'another tenant learns nothing of a registration by inspect',
      async fixture => {
        const own = peer(fixture)
        const other = foreign(fixture)
        const registration = await ensured(own, 'ensure-1')
        // The answer for the wait of the own tenant is the answer for a wait that never existed.
        const { ghost } = await crossTenantAnswers({
          ask: { real: () => other.inspect('wait-1'), ghost: () => other.inspect('wait-ghost') },
          row: answers.inspect,
          identifying: [...identifyingValues(fixture.access.tenant, registration), 'ensure-1'],
          submitted: [...other.sends, 'wait-1'],
          what: 'inspect by another tenant',
        })
        refused(ghost, 'inspect of a wait that is none')
        assert.deepEqual(succeeded(await own.inspect(), 'inspect'), registration)
      },
    ),

    conformanceCase(
      'P06',
      'another tenant learns nothing of an operation by inspectOperation',
      async fixture => {
        const own = peer(fixture)
        const other = foreign(fixture)
        const registration = await ensured(own, 'ensure-1')
        // The other tenant asks with the same operation: the receipt identifies the record.
        await crossTenantAnswers({
          ask: {
            real: () => other.inspectOperation('ensure-1'),
            ghost: () => other.inspectOperation('ghost-operation'),
          },
          row: answers.inspectOperation,
          completion: other.completion,
          identifying: identifyingValues(fixture.access.tenant, registration),
          submitted: [...other.sends, 'ensure-1'],
          what: 'inspectOperation by another tenant',
        })
        const byOwner = expectKind(
          await decided(own, 'ensure-1'),
          'committed',
          'inspectOperation by the own tenant',
        )
        assert.deepEqual(byOwner.receipt, registration)
      },
    ),

    conformanceCase(
      'P06',
      'another tenant cannot invalidate the registration of a tenant',
      async fixture => {
        const own = peer(fixture)
        const other = foreign(fixture)
        const invalidations = handle(own.invalidations, 'invalidations')
        const registration = await ensured(own, 'ensure-1')
        // A foreign invalidation whose reply was lost has landed after `settle`, and is still not
        // carried out for the tenant.
        await crossTenantAnswers({
          ask: {
            real: () => other.invalidate('invalidate-1', 'wait-1'),
            ghost: () => other.invalidate('invalidate-2', 'wait-ghost'),
          },
          row: answers.invalidate,
          completion: other.completion,
          identifying: [...identifyingValues(fixture.access.tenant, registration), 'ensure-1'],
          submitted: [...other.sends, 'invalidate-1', 'wait-1', TERMINAL],
          what: 'invalidate by another tenant',
        })
        assert.deepEqual(invalidations(), [], 'the invalidation reached the registration')
        assert.deepEqual(succeeded(await own.inspect(), 'inspect'), registration)
      },
    ),

    conformanceCase(
      'P06',
      'inspectOperation reports an applied ensure as committed',
      async fixture => {
        const p = peer(fixture)
        await ensured(p, 'ensure-1')
        const found = expectKind(
          await decided(p, 'ensure-1'),
          'committed',
          'inspectOperation of an applied ensure',
        )
        assert.equal(found.operation, 'ensure-1')
        assertEvidence(found.receipt, 'the receipt of the original operation')
      },
    ),

    conformanceCase(
      'P06',
      'inspectOperation claims nothing for an operation never sent',
      async fixture => {
        const p = peer(fixture)
        const answer = await p.inspectOperation('never-sent')
        if ('failure' in answer) return
        assert.ok(
          isProgress(answer.ok, answers.inspectOperation) || answer.ok.kind === 'excluded',
          `inspectOperation of an operation never sent: expected progress or excluded, got ${answer.ok.kind}`,
        )
        // An exclusion of an operation that was never seen is a fence: the operation must then
        // never take effect, so a send of it is refused and registers nothing.
        if (answer.ok.kind === 'excluded') {
          refused(await p.ensure('never-sent'), 'ensure of an operation that was excluded')
          refused(await p.inspect(), 'inspect: the excluded ensure registered nothing')
        }
      },
    ),

    conformanceCase('P06', 'a deferred operation stays pending until it lands', async fixture => {
      const p = peer(fixture)
      const hold = handle(p.hold, 'hold')
      const settle = handle(p.settle, 'settle')
      hold()
      const lost = await p.ensure('ensure-1')
      assert.ok(isProgress(lost, answers.ensure), 'a deferred ensure answers a lost reply')
      const pending = succeeded(await p.inspectOperation('ensure-1'), 'inspectOperation')
      assert.ok(
        isProgress(pending, answers.inspectOperation),
        'inspectOperation of a deferred ensure',
      )
      await settle()
      const landedAnswer = succeeded(await p.inspectOperation('ensure-1'), 'inspectOperation')
      expectKind(landedAnswer, 'committed', 'inspectOperation after the ensure landed')
      const registration = await ensured(p, 'ensure-1')
      assert.deepEqual(succeeded(await p.inspect(), 'inspect'), registration)
    }),

    conformanceCase('P06', 'an excluded operation is never applied after all', async fixture => {
      const p = peer(fixture)
      const hold = handle(p.hold, 'hold')
      const settle = handle(p.settle, 'settle')
      const excludeDeferred = handle(p.excludeDeferred, 'excludeDeferred')
      hold()
      await p.ensure('ensure-1')
      await excludeDeferred(operationId('ensure-1'))
      await settle()
      const found = expectKind(
        await decided(p, 'ensure-1'),
        'excluded',
        'inspectOperation of an excluded ensure',
      )
      assertEvidence(found.exclusion, 'the exclusion is evidence')
      refused(await p.inspect(), 'inspect: the excluded ensure registered nothing')
    }),

    conformanceCase('P06', 'a resent invalidation returns the original evidence', async fixture => {
      const p = peer(fixture)
      await ensured(p, 'ensure-1')
      const first = await invalidated(p, 'invalidate-1')
      assertEvidence(first, 'the invalidation is evidence')
      resendRecalls(
        answers.invalidate,
        { earlier: { ok: first }, later: await p.invalidate('invalidate-1') },
        'resent invalidate',
      )
      const found = expectKind(
        await decided(p, 'invalidate-1'),
        'committed',
        'inspectOperation of the invalidation',
      )
      assert.deepEqual(found.receipt, first)
    }),

    conformanceCase(
      'P06',
      'a resent invalidation invalidates the registration once',
      async fixture => {
        const p = peer(fixture)
        const invalidations = handle(p.invalidations, 'invalidations')
        const registration = await ensured(p, 'ensure-1')
        const first = await invalidated(p, 'invalidate-1')
        resendRecalls(
          answers.invalidate,
          { earlier: { ok: first }, later: await p.invalidate('invalidate-1') },
          'resent invalidate',
        )
        assert.deepEqual(invalidations(), [registration])
      },
    ),

    conformanceCase(
      'P06',
      'an invalidation invalidates the registration of its wait only',
      async fixture => {
        const p = peer(fixture)
        const invalidations = handle(p.invalidations, 'invalidations')
        const one = await ensured(p, 'ensure-1', 'wait-1')
        await ensured(p, 'ensure-2', 'wait-2')
        await invalidated(p, 'invalidate-1', 'wait-1')
        assert.deepEqual(invalidations(), [one])
      },
    ),

    conformanceCase(
      'P06',
      'an invalidation that arrives before the registration lands acts on the original registration',
      async fixture => {
        const p = peer(fixture)
        const hold = handle(p.hold, 'hold')
        const settle = handle(p.settle, 'settle')
        const invalidations = handle(p.invalidations, 'invalidations')
        hold()
        await p.ensure('ensure-1')
        await p.invalidate('invalidate-1')
        await settle()
        // The reply of the ensure arrives late and recalls the original registration; the
        // invalidation that was sent before it is then carried out on that registration.
        const registration = await ensured(p, 'ensure-1')
        assert.deepEqual(succeeded(await p.inspect(), 'inspect'), registration)
        await invalidated(p, 'invalidate-1')
        assert.deepEqual(invalidations(), [registration])
        expectKind(
          await decided(p, 'invalidate-1'),
          'committed',
          'inspectOperation of the late invalidation',
        )
      },
    ),

    conformanceCase(
      'P06',
      'inspect only reads and does not take a deferred invalidation as done',
      async fixture => {
        const p = peer(fixture)
        const hold = handle(p.hold, 'hold')
        const settle = handle(p.settle, 'settle')
        const invalidations = handle(p.invalidations, 'invalidations')
        const registration = await ensured(p, 'ensure-1')
        hold()
        await p.invalidate('invalidate-1')
        assert.deepEqual(succeeded(await p.inspect(), 'inspect'), registration)
        assert.deepEqual(succeeded(await p.inspect(), 'second inspect'), registration)
        assert.deepEqual(invalidations(), [])
        assert.ok(
          isProgress(
            succeeded(await p.inspectOperation('invalidate-1'), 'inspectOperation'),
            answers.inspectOperation,
          ),
          'inspectOperation of a deferred invalidation',
        )
        // The deferred invalidation was kept, and it lands on the original registration.
        await settle()
        assert.deepEqual(invalidations(), [registration])
      },
    ),

    conformanceCase(
      'P01',
      'an operation identity reused for another action is a conflict',
      async fixture => {
        const p = peer(fixture)
        const registration = await ensured(p, 'ensure-1')
        const failure = refused(
          await p.invalidate('ensure-1'),
          'invalidate under the operation identity of an ensure',
        )
        assert.equal(failure.kind, 'conflict')
        // The receipt stays bound to the action that the operation was.
        const found = expectKind(
          await decided(p, 'ensure-1'),
          'committed',
          'inspectOperation of the original ensure',
        )
        assert.deepEqual(found.receipt, registration)
      },
    ),

    conformanceCase(
      'P01',
      'a refused reuse of an operation identity has no effect',
      async fixture => {
        const p = peer(fixture)
        const invalidations = handle(p.invalidations, 'invalidations')
        await ensured(p, 'ensure-1')
        refused(await p.invalidate('ensure-1'), 'invalidate under the identity of an ensure')
        assert.deepEqual(invalidations(), [], 'the refused invalidation was carried out')
      },
    ),

    conformanceCase(
      'P01',
      'an operation identity reused for another wait is a conflict',
      async fixture => {
        const p = peer(fixture)
        const registration = await ensured(p, 'ensure-1', 'wait-1')
        const failure = refused(await p.ensure('ensure-1', 'wait-2'), 'ensure of another wait')
        assert.equal(failure.kind, 'conflict')
        // The refused ensure registered nothing.
        refused(await p.inspect('wait-2'), 'inspect: the refused ensure registered nothing')
        assert.deepEqual(succeeded(await p.inspect('wait-1'), 'inspect wait-1'), registration)
      },
    ),

    conformanceCase(
      'P01',
      'an invalidation identity reused for another wait is a conflict that changes nothing',
      async fixture => {
        const p = peer(fixture)
        const invalidations = handle(p.invalidations, 'invalidations')
        const one = await ensured(p, 'ensure-1', 'wait-1')
        await ensured(p, 'ensure-2', 'wait-2')
        const first = await invalidated(p, 'invalidate-1', 'wait-1')
        const failure = refused(
          await p.invalidate('invalidate-1', 'wait-2'),
          'invalidate of another wait under the same identity',
        )
        assert.equal(failure.kind, 'conflict')
        assert.deepEqual(invalidations(), [one], 'the refused invalidation was carried out')
        const found = expectKind(
          await decided(p, 'invalidate-1'),
          'committed',
          'inspectOperation of the original invalidation',
        )
        assert.deepEqual(found.receipt, first)
      },
    ),
  ]
}

// ---------------------------------------------------------------------------------------------
// The operation ledger of the non-durable doubles
// ---------------------------------------------------------------------------------------------

type Operation = {
  readonly operation: ToolOperationId
  readonly digest: string
  state: 'committed' | 'pending' | 'excluded'
  receipt: DurableEvidence | null
  readonly apply: () => DurableEvidence
}

/**
 * The record of what the double did for each operation. An operation runs once: a resend of the
 * same action with the same input answers the original receipt, and the same identity with another
 * action kind or another input is a `conflict` that changes nothing (P01). `hold` defers the next
 * new operation: it answers a lost reply, stays pending, and lands at `settle` unless it was
 * excluded first.
 */
export function createOperationLedger(mint: (kind: string, content: unknown) => DurableEvidence) {
  const operations = new Map<string, Operation>()
  let holding = false
  return {
    hold: (): void => {
      holding = true
    },
    run(
      key: string,
      operation: ToolOperationId,
      action: Readonly<{ kind: string; input: unknown }>,
      apply: () => DurableEvidence,
    ): Outcome<DurableEvidence, ToolFailure> {
      const known = operations.get(key)
      const digest = digestOf(action)
      if (known !== undefined && known.digest !== digest)
        return fail({ kind: 'conflict', operation })
      if (known?.state === 'committed' && known.receipt !== null) return { ok: known.receipt }
      if (known?.state === 'pending') return fail({ kind: 'commit-unknown', operation })
      if (known?.state === 'excluded') return fail({ kind: 'conflict', operation })
      if (holding) {
        holding = false
        operations.set(key, {
          operation,
          digest,
          state: 'pending',
          receipt: null,
          apply,
        })
        return fail({ kind: 'commit-unknown', operation })
      }
      const receipt = apply()
      operations.set(key, {
        operation,
        digest,
        state: 'committed',
        receipt,
        apply,
      })
      return { ok: receipt }
    },
    settle(): void {
      for (const entry of operations.values()) {
        if (entry.state !== 'pending') continue
        entry.receipt = entry.apply()
        entry.state = 'committed'
      }
    },
    exclude(operation: ToolOperationId): void {
      for (const entry of operations.values())
        if (entry.state === 'pending' && entry.operation === operation) {
          entry.state = 'excluded'
          entry.receipt = mint('exclusion', { operation })
        }
    },
    inspect(key: string, operation: ToolOperationId): ExternalOperationResolution {
      const entry = operations.get(key)
      if (entry === undefined)
        return { kind: 'unknown', operation, diagnostic: 'no such operation was seen' }
      if (entry.state === 'committed' && entry.receipt !== null)
        return { kind: 'committed', operation, receipt: entry.receipt }
      if (entry.state === 'excluded' && entry.receipt !== null)
        return { kind: 'excluded', operation, exclusion: entry.receipt }
      return { kind: 'pending', operation, diagnostic: 'the operation is deferred' }
    },
  }
}

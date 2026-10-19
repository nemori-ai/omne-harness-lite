// The ToolResourceResponses conformance suite (P06, P12, story 26) and a non-durable double that
// conforms to it. The double keeps its state in memory and declares `durability: 'none'`: it
// proves nothing about a durable resource owner and must not be assembled into production.
import assert from 'node:assert/strict'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Access, DurableEvidence, ToolCallId, ToolOperationId } from './identity.ts'
import type { ToolResourceResponses, WaitIntent } from './records.ts'
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
  boundHandles,
  createOperationLedger,
  externalAnswers,
  externalAssociationCases,
  landed,
  mapOk,
  TERMINAL,
  WAIT,
  type ExternalHandles,
  type ExternalPeer,
} from './testing-external.ts'
import {
  adoption,
  callId,
  evidence,
  FAR_DEADLINE,
  identifyingValues,
  memoryAccess,
  memoryOtherAccess,
  mintEvidence,
  operationId,
  resourceWait,
  tenantKey,
} from './testing-values.ts'

type ResourceWait = Extract<WaitIntent, { kind: 'resource' }>

/**
 * What the resource response suite needs. A fresh fixture serves one case. `deadline` is the
 * instant that the waits with a deadline carry, in the format of the provider (default: a far
 * future instant, which no provider that reads a real clock considers reached). The optional
 * handles are the controls of the resource owner, and a case that needs one that is missing is
 * reported not applicable. `hold` defers the next new `ensure`, `invalidate` or `expire`: it is not
 * applied and its reply is lost (`commit-unknown`), and `settle` applies the deferred operations
 * that were not excluded (a provider that answers `commit-unknown`, `pending` or `unknown` for an
 * operation that it completes later lands that work too): it resolves only after the deferred work
 * has landed and is visible to every read of the port, and the suite asks once more after it and
 * never polls; without `settle`, a case that needs a final answer is reported not applicable when
 * the first answer is progress. `excludeDeferred` excludes the deferred operation of that
 * operation identity for good, and resolves when the exclusion holds; `invalidations` lists the registrations that were invalidated, each once;
 * `respond` makes the owner answer the registered wait with a value and returns the evidence of
 * that response (the first response of a wait stands); `reachDeadline` makes the owner consider
 * the deadline of the wait reached. `otherAccess` is the access of a second tenant, with a
 * principal of its own: the cases that check that another tenant neither reads nor changes a
 * record of the first are reported not applicable without it.
 */
export interface ToolResourceResponsesFixture<P> extends ExternalHandles {
  readonly responses: ToolResourceResponses<P>
  readonly access: Access<P>
  readonly otherAccess?: Access<P>
  readonly deadline?: string
  /** Resolves with the evidence of the response after the owner answered and `inspect` shows it. */
  respond?(
    input: Readonly<{ call: ToolCallId; wait: ResourceWait; value: JsonValue }>,
  ): Promise<DurableEvidence>
  /** Resolves after the owner considers the deadline of the wait reached, for every later `expire`. */
  reachDeadline?(input: Readonly<{ call: ToolCallId; wait: ResourceWait }>): Promise<void>
}

function peerOf<P>(fixture: ToolResourceResponsesFixture<P>, access: Access<P>): ExternalPeer {
  const { responses } = fixture
  const call = callId('call-1')
  const deadline = fixture.deadline ?? FAR_DEADLINE
  const mutation = (operation: string) => ({ ...access, call, operation: operationId(operation) })
  return {
    ensure: (operation, wait = WAIT) =>
      responses.ensure({ ...mutation(operation), wait: resourceWait(wait, { deadline }) }),
    inspect: async (wait = WAIT) =>
      mapOk(
        await responses.inspect({ ...access, call, wait: resourceWait(wait).wait }),
        found => found.registration,
      ),
    invalidate: (operation, wait = WAIT) =>
      responses.invalidate({
        ...mutation(operation),
        wait: resourceWait(wait).wait,
        terminal: TERMINAL,
      }),
    inspectOperation: operation => responses.inspectOperation(mutation(operation)),
    completion: completionOf(fixture, 'settle'),
    sends: [access, call],
    ...boundHandles(fixture),
  }
}

/**
 * The answer model of the resource responses: the calls of P06 that both external-association
 * ports have, `expire` (P06), whose reply may be lost as `commit-unknown` like that of `ensure`,
 * and `resolve` (P12), which answers the resource value or the expiry, or refuses.
 */
export const resourceResponsesAnswers = {
  ...externalAnswers,
  expire: { clause: 'P06', progress: [], lostReply: ['commit-unknown'] },
  resolve: { clause: 'P12', progress: [] },
} as const satisfies AnswerModel<keyof ToolResourceResponses<unknown>>

const GIVEN_TEXT = 'resource-7'
const GIVEN: JsonValue = { kind: 'string', value: GIVEN_TEXT }

function scene<P>(fixture: ToolResourceResponsesFixture<P>, access: Access<P> = fixture.access) {
  const { responses } = fixture
  const call = callId('call-1')
  const deadline = fixture.deadline ?? FAR_DEADLINE
  const wait = (
    options: Readonly<{ deadline?: string | null; expiry?: 'forbidden' | 'supported' }> = {},
    name: string = WAIT,
  ): ResourceWait => resourceWait(name, { deadline, ...options })
  const mutation = (operation: string) => ({ ...access, call, operation: operationId(operation) })
  const completion = completionOf(fixture, 'settle')
  return {
    wait,
    completion,
    /** What every call of the scene sends: its access and its call. */
    sends: [access, call] as const,
    ensure: (intent: ResourceWait = wait(), operation = 'ensure-1'): Promise<DurableEvidence> =>
      landed(
        completion,
        () => responses.ensure({ ...mutation(operation), wait: intent }),
        resourceResponsesAnswers.ensure,
        'ensure',
      ),
    inspect: async (intent: ResourceWait = wait()) =>
      succeeded(await responses.inspect({ ...access, call, wait: intent.wait }), 'inspect'),
    expire: (intent: ResourceWait, registration: DurableEvidence, operation = 'expire-1') =>
      responses.expire({ ...mutation(operation), wait: intent, registration }),
    /** The final answer of an expire, a refusal included: a lost reply is driven by `settle`. */
    expireFinal: (intent: ResourceWait, registration: DurableEvidence, operation = 'expire-1') =>
      finalAnswer({
        ask: () => responses.expire({ ...mutation(operation), wait: intent, registration }),
        row: resourceResponsesAnswers.expire,
        completion,
        what: 'expire',
      }),
    expired: (
      intent: ResourceWait,
      registration: DurableEvidence,
      operation = 'expire-1',
    ): Promise<DurableEvidence> =>
      landed(
        completion,
        () => responses.expire({ ...mutation(operation), wait: intent, registration }),
        resourceResponsesAnswers.expire,
        'expire',
      ),
    resolve: (intent: ResourceWait, response: DurableEvidence) =>
      responses.resolve({ ...access, call, wait: intent, response }),
    inspectOperation: (operation: string) => responses.inspectOperation(mutation(operation)),
    /** The decided answer of `inspectOperation`: `pending` and `unknown` are driven by `settle`. */
    decided: async (operation: string) =>
      succeeded(
        await finalAnswer({
          ask: () => responses.inspectOperation(mutation(operation)),
          row: resourceResponsesAnswers.inspectOperation,
          completion,
          what: `inspectOperation ${operation}`,
        }),
        `inspectOperation ${operation}`,
      ),
    respond: (intent: ResourceWait, value: JsonValue = GIVEN): Promise<DurableEvidence> =>
      handle(fixture.respond, 'respond').call(fixture, { call, wait: intent, value }),
    reach: (intent: ResourceWait): Promise<void> =>
      handle(fixture.reachDeadline, 'reachDeadline').call(fixture, { call, wait: intent }),
  }
}

export function toolResourceResponsesConformance<P>(): readonly ConformanceCase<
  ToolResourceResponsesFixture<P>
>[] {
  return [
    ...externalAssociationCases<ToolResourceResponsesFixture<P>>(peerOf),

    conformanceCase('P06', 'inspect shows no response before the owner answers', async fixture => {
      const s = scene(fixture)
      const registration = await s.ensure()
      assert.deepEqual(await s.inspect(), { registration, response: null })
    }),

    conformanceCase('P06', 'inspect shows the response that the owner gave', async fixture => {
      handle(fixture.respond, 'respond')
      const s = scene(fixture)
      const intent = s.wait()
      const registration = await s.ensure(intent)
      const response = await s.respond(intent)
      assert.deepEqual(await s.inspect(), { registration, response })
    }),

    conformanceCase(
      'P12',
      'resolve returns the resource value that the owner gave',
      async fixture => {
        handle(fixture.respond, 'respond')
        const s = scene(fixture)
        const intent = s.wait()
        await s.ensure(intent)
        const response = await s.respond(intent)
        const resolved = expectKind(
          succeeded(await s.resolve(intent, response), 'resolve'),
          'resource',
          'resolve of a response',
        )
        assert.deepEqual(resolved.value, GIVEN)
        assert.ok(resolved.source.owner.length > 0, 'the owner of the source is named')
        assert.ok(resolved.source.digest.length > 0, 'the digest of the source is named')
      },
    ),

    conformanceCase('P06', 'resolve refuses a response that was never given', async fixture => {
      const s = scene(fixture)
      const intent = s.wait()
      await s.ensure(intent)
      // Tool never makes up an answer, a timeout included: only the owner's evidence resolves.
      refused(
        await s.resolve(intent, evidence('never-given')),
        'resolve of evidence that is no response',
      )
    }),

    conformanceCase('P06', 'expire is refused while the deadline is not reached', async fixture => {
      const s = scene(fixture)
      const intent = s.wait()
      const registration = await s.ensure(intent)
      refused(await s.expireFinal(intent, registration), 'expire before the deadline')
      assert.deepEqual(await s.inspect(), { registration, response: null })
      const found = await s.inspectOperation('expire-1')
      if ('ok' in found) assert.notEqual(found.ok.kind, 'committed')
    }),

    conformanceCase(
      'P06',
      'expire at the deadline gives an expiry that resolves as expired',
      async fixture => {
        handle(fixture.reachDeadline, 'reachDeadline')
        const s = scene(fixture)
        const intent = s.wait()
        const registration = await s.ensure(intent)
        await s.reach(intent)
        const expiry = await s.expired(intent, registration)
        assert.deepEqual(await s.inspect(), { registration, response: expiry })
        const resolved = expectKind(
          succeeded(await s.resolve(intent, expiry), 'resolve'),
          'expired',
          'resolve of an expiry',
        )
        assert.ok(resolved.source.owner.length > 0, 'the owner of the source is named')
        assert.ok(resolved.source.digest.length > 0, 'the digest of the source is named')
      },
    ),

    conformanceCase('P06', 'a resent expire returns the original expiry', async fixture => {
      handle(fixture.reachDeadline, 'reachDeadline')
      const s = scene(fixture)
      const intent = s.wait()
      const registration = await s.ensure(intent)
      await s.reach(intent)
      const first = await s.expired(intent, registration)
      resendRecalls(
        resourceResponsesAnswers.expire,
        { earlier: { ok: first }, later: await s.expire(intent, registration) },
        'resent expire',
      )
      const found = expectKind(
        await s.decided('expire-1'),
        'committed',
        'inspectOperation of the expire',
      )
      assert.deepEqual(found.receipt, first)
    }),

    conformanceCase('P06', 'expire is refused when an earlier response exists', async fixture => {
      handle(fixture.respond, 'respond')
      handle(fixture.reachDeadline, 'reachDeadline')
      const s = scene(fixture)
      const intent = s.wait()
      const registration = await s.ensure(intent)
      const response = await s.respond(intent)
      await s.reach(intent)
      refused(await s.expireFinal(intent, registration), 'expire after an earlier response')
      assert.deepEqual(await s.inspect(), { registration, response })
      expectKind(
        succeeded(await s.resolve(intent, response), 'resolve'),
        'resource',
        'resolve after the refused expire',
      )
    }),

    conformanceCase('P06', 'expire never expires a wait that has no deadline', async fixture => {
      const s = scene(fixture)
      const intent = s.wait({ deadline: null })
      const registration = await s.ensure(intent)
      refused(await s.expireFinal(intent, registration), 'expire of a wait with no deadline')
      assert.deepEqual(await s.inspect(), { registration, response: null })
    }),

    conformanceCase(
      'P06',
      'expire is unsupported when the contract forbids expiry',
      async fixture => {
        const s = scene(fixture)
        const intent = s.wait({ deadline: null, expiry: 'forbidden' })
        const registration = await s.ensure(intent)
        const failure = refused(
          await s.expireFinal(intent, registration),
          'expire under a contract without expiry',
        )
        assert.equal(failure.kind, 'unsupported')
      },
    ),

    conformanceCase(
      'P06',
      'an expire whose reply was lost is recalled by its operation',
      async fixture => {
        const hold = handle(fixture.hold, 'hold')
        const settle = handle(fixture.settle, 'settle')
        handle(fixture.reachDeadline, 'reachDeadline')
        const s = scene(fixture)
        const intent = s.wait()
        const registration = await s.ensure(intent)
        await s.reach(intent)
        hold.call(fixture)
        const lost = await s.expire(intent, registration)
        assert.ok(
          isProgress(lost, resourceResponsesAnswers.expire),
          'a deferred expire answers a lost reply',
        )
        const unsettled = succeeded(await s.inspectOperation('expire-1'), 'inspectOperation')
        assert.ok(
          isProgress(unsettled, resourceResponsesAnswers.inspectOperation),
          'inspectOperation of the lost expire',
        )
        await settle.call(fixture)
        const found = expectKind(
          succeeded(await s.inspectOperation('expire-1'), 'inspectOperation'),
          'committed',
          'inspectOperation after the expire landed',
        )
        resendRecalls(
          resourceResponsesAnswers.expire,
          { earlier: { ok: found.receipt }, later: await s.expire(intent, registration) },
          'resent expire',
        )
        assert.deepEqual(await s.inspect(), { registration, response: found.receipt })
      },
    ),

    conformanceCase(
      'P06',
      'expire judges the deadline that the wait was registered with',
      async fixture => {
        handle(fixture.reachDeadline, 'reachDeadline')
        const s = scene(fixture)
        const registered = s.wait({ deadline: null })
        const registration = await s.ensure(registered)
        await s.reach(registered)
        // The registration has no deadline, whatever the intent of a later call claims.
        refused(
          await s.expireFinal(s.wait(), registration),
          'expire by a deadline that the registration does not have',
        )
        assert.deepEqual(await s.inspect(), { registration, response: null })
      },
    ),

    conformanceCase(
      'P06',
      'expire judges the expiry support that the wait was registered with',
      async fixture => {
        handle(fixture.reachDeadline, 'reachDeadline')
        const s = scene(fixture)
        const registered = s.wait({ expiry: 'forbidden' })
        const registration = await s.ensure(registered)
        await s.reach(registered)
        // The registered contract forbids expiry, whatever the intent of a later call claims.
        const failure = refused(
          await s.expireFinal(s.wait({ expiry: 'supported' }), registration),
          'expire by an expiry that the registration does not support',
        )
        assert.equal(failure.kind, 'unsupported')
        assert.deepEqual(await s.inspect(), { registration, response: null })
      },
    ),

    conformanceCase(
      'P12',
      'another tenant cannot resolve the response of a tenant',
      async fixture => {
        handle(fixture.respond, 'respond')
        const s = scene(fixture)
        const other = scene(fixture, otherAccessOf(fixture))
        const intent = s.wait()
        const registration = await s.ensure(intent)
        const response = await s.respond(intent)
        // The other tenant sends the response itself; the registration and the value stay hidden.
        const { ghost } = await crossTenantAnswers({
          ask: {
            real: () => other.resolve(intent, response),
            ghost: () => other.resolve(intent, evidence('never-given')),
          },
          row: resourceResponsesAnswers.resolve,
          identifying: [
            ...identifyingValues(fixture.access.tenant, registration),
            'ensure-1',
            GIVEN_TEXT,
          ],
          submitted: [...other.sends, intent, response],
          what: 'resolve by another tenant',
        })
        refused(ghost, 'resolve of evidence that is no response')
        expectKind(
          succeeded(await s.resolve(intent, response), 'resolve'),
          'resource',
          'resolve by the own tenant',
        )
      },
    ),

    conformanceCase('P06', 'another tenant cannot expire the wait of a tenant', async fixture => {
      handle(fixture.reachDeadline, 'reachDeadline')
      const s = scene(fixture)
      const other = scene(fixture, otherAccessOf(fixture))
      const intent = s.wait()
      const registration = await s.ensure(intent)
      await s.reach(intent)
      // Each expire is read to its final answer, so the two answers are final when compared. The
      // other tenant sends the registration itself, so only the tenant and the operation of the
      // tenant identify the wait.
      const { ghost } = await crossTenantAnswers({
        ask: {
          real: () => other.expireFinal(intent, registration),
          ghost: () => other.expireFinal(intent, evidence('ghost-registration'), 'expire-2'),
        },
        row: resourceResponsesAnswers.expire,
        completion: other.completion,
        identifying: [...identifyingValues(fixture.access.tenant), 'ensure-1'],
        submitted: [...other.sends, 'expire-1', intent, registration],
        what: 'expire by another tenant',
      })
      refused(ghost, 'expire of a registration that is none')
      assert.deepEqual(await s.inspect(), { registration, response: null })
      // The deadline of the own tenant is still due: the foreign attempt used nothing up.
      await s.expired(intent, registration)
    }),

    conformanceCase(
      'P01',
      'an expire identity reused for another wait is a conflict that changes nothing',
      async fixture => {
        handle(fixture.reachDeadline, 'reachDeadline')
        const s = scene(fixture)
        const one = s.wait()
        const two = s.wait({}, 'wait-2')
        const registrationOne = await s.ensure(one, 'ensure-1')
        const registrationTwo = await s.ensure(two, 'ensure-2')
        await s.reach(one)
        await s.reach(two)
        const first = await s.expired(one, registrationOne, 'expire-1')
        const failure = refused(
          await s.expire(two, registrationTwo, 'expire-1'),
          'expire of another wait under the same identity',
        )
        assert.equal(failure.kind, 'conflict')
        // The refused expire made no expiry for the other wait, and the first one stands.
        assert.deepEqual(await s.inspect(two), { registration: registrationTwo, response: null })
        const found = expectKind(
          await s.decided('expire-1'),
          'committed',
          'inspectOperation of the original expire',
        )
        assert.deepEqual(found.receipt, first)
      },
    ),
  ]
}

// ---------------------------------------------------------------------------------------------
// The non-durable double
// ---------------------------------------------------------------------------------------------

export interface MemoryToolResourceResponses<P> extends ToolResourceResponses<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    hold(): void
    settle(): Promise<void>
    excludeDeferred(operation: ToolOperationId): Promise<void>
    invalidations(): readonly DurableEvidence[]
    respond(
      input: Readonly<{
        tenant: Access<unknown>['tenant']
        call: ToolCallId
        wait: ResourceWait
        value: JsonValue
      }>,
    ): Promise<DurableEvidence>
    reachDeadline(
      input: Readonly<{ tenant: Access<unknown>['tenant']; call: ToolCallId; wait: ResourceWait }>,
    ): Promise<void>
  }>
}

type Tenant = Access<unknown>['tenant']
type Response =
  | { kind: 'resource'; evidence: DurableEvidence; value: JsonValue }
  | { kind: 'expired'; evidence: DurableEvidence }
/** What the wait declared when it was registered: the owner judges expiry by it, not by a later call. */
type Registered = { deadline: string | null; expiry: 'forbidden' | 'supported' }
type Registration = {
  evidence: DurableEvidence
  readonly intent: Registered
  invalidated: boolean
  response: Response | null
}

const reply = <T>(outcome: Outcome<T, ToolFailure>): Promise<Outcome<T, ToolFailure>> =>
  Promise.resolve(outcome)

const sameEvidence = (left: DurableEvidence, right: DurableEvidence): boolean =>
  left.owner === right.owner && left.record === right.record && left.digest === right.digest

/**
 * Resource responses in memory. A registration is keyed by tenant, call and wait; an operation
 * runs once. The owner answers with `respond`, and `expire` produces the expiry only for a wait
 * with a deadline that was reached and that no earlier response closed: the response that came
 * first stands.
 */
export function createMemoryToolResourceResponses<P>(): MemoryToolResourceResponses<P> {
  const registrations = new Map<string, Registration>()
  const early = new Set<string>()
  const due = new Set<string>()
  const invalidated: DurableEvidence[] = []
  let minted = 0
  const mint = (kind: string, content: unknown): DurableEvidence => {
    minted += 1
    return mintEvidence(`resource-responses/${kind}/${minted}`, content)
  }
  const ledger = createOperationLedger(mint)
  const waitKey = (tenant: Tenant, call: ToolCallId, wait: string): string =>
    JSON.stringify([tenantKey(tenant), call, wait])
  const operationKey = (tenant: Tenant, call: ToolCallId, operation: string): string =>
    JSON.stringify([tenantKey(tenant), call, operation])

  const responses: ToolResourceResponses<P> = {
    inspectOperation: input =>
      reply(
        succeed(
          ledger.inspect(operationKey(input.tenant, input.call, input.operation), input.operation),
        ),
      ),
    ensure: input =>
      reply(
        ledger.run(
          operationKey(input.tenant, input.call, input.operation),
          input.operation,
          { kind: 'ensure', input: { wait: input.wait } },
          () => {
            const key = waitKey(input.tenant, input.call, input.wait.wait)
            let registration = registrations.get(key)
            if (registration === undefined) {
              registration = {
                evidence: mint('registration', { key, request: input.wait.request }),
                intent: { deadline: input.wait.deadline, expiry: input.wait.schemas.expiry },
                invalidated: false,
                response: null,
              }
              registrations.set(key, registration)
              if (early.has(key)) {
                registration.invalidated = true
                invalidated.push(registration.evidence)
              }
            }
            return registration.evidence
          },
        ),
      ),
    inspect: input => {
      const registration = registrations.get(waitKey(input.tenant, input.call, input.wait))
      if (registration === undefined)
        return reply(
          fail({ kind: 'invalid', field: 'wait', reason: 'no registration of this wait' }),
        )
      return reply(
        succeed({
          registration: registration.evidence,
          response: registration.response?.evidence ?? null,
        }),
      )
    },
    expire: input => {
      const key = waitKey(input.tenant, input.call, input.wait.wait)
      const registration = registrations.get(key)
      if (registration === undefined || !sameEvidence(registration.evidence, input.registration))
        return reply(
          fail({
            kind: 'invalid',
            field: 'registration',
            reason: 'not the registration of this wait',
          }),
        )
      if (registration.intent.expiry === 'forbidden')
        return reply(
          fail({
            kind: 'unsupported',
            adoption: adoption('resource-wait'),
            reason: 'the resource contract does not support expiry',
          }),
        )
      if (registration.response?.kind === 'resource')
        return reply(fail({ kind: 'conflict', operation: input.operation }))
      if (
        registration.response === null &&
        (registration.intent.deadline === null || !due.has(key))
      )
        return reply(
          fail({ kind: 'invalid', field: 'deadline', reason: 'the deadline is not reached' }),
        )
      return reply(
        ledger.run(
          operationKey(input.tenant, input.call, input.operation),
          input.operation,
          { kind: 'expire', input: { wait: input.wait, registration: input.registration } },
          () => {
            if (registration.response?.kind === 'expired') return registration.response.evidence
            const expiry = mint('expiry', { key })
            registration.response = { kind: 'expired', evidence: expiry }
            return expiry
          },
        ),
      )
    },
    invalidate: input =>
      reply(
        ledger.run(
          operationKey(input.tenant, input.call, input.operation),
          input.operation,
          { kind: 'invalidate', input: { wait: input.wait, terminal: input.terminal } },
          () => {
            const key = waitKey(input.tenant, input.call, input.wait)
            const registration = registrations.get(key)
            if (registration === undefined) early.add(key)
            else if (!registration.invalidated) {
              registration.invalidated = true
              invalidated.push(registration.evidence)
            }
            return mint('invalidation', { wait: input.wait, terminal: input.terminal })
          },
        ),
      ),
    resolve: input => {
      const response = registrations.get(
        waitKey(input.tenant, input.call, input.wait.wait),
      )?.response
      if (
        response === undefined ||
        response === null ||
        !sameEvidence(response.evidence, input.response)
      )
        return reply(
          fail({ kind: 'invalid', field: 'response', reason: 'not a response of this wait' }),
        )
      return reply(
        succeed(
          response.kind === 'resource'
            ? { kind: 'resource' as const, value: response.value, source: response.evidence }
            : { kind: 'expired' as const, source: response.evidence },
        ),
      )
    },
  }

  const controls: MemoryToolResourceResponses<P>['controls'] = {
    hold: ledger.hold,
    settle: () => {
      ledger.settle()
      return Promise.resolve()
    },
    excludeDeferred: operation => {
      ledger.exclude(operation)
      return Promise.resolve()
    },
    invalidations: () => [...invalidated],
    respond: ({ tenant, call, wait, value }) => {
      const registration = registrations.get(waitKey(tenant, call, wait.wait))
      if (registration === undefined) return Promise.reject(new Error('no registration to answer'))
      registration.response ??= {
        kind: 'resource',
        evidence: mint('response', { wait: wait.wait, value }),
        value,
      }
      return Promise.resolve(registration.response.evidence)
    },
    reachDeadline: ({ tenant, call, wait }) => {
      due.add(waitKey(tenant, call, wait.wait))
      return Promise.resolve()
    },
  }
  return Object.freeze({ ...responses, durability: 'none' as const, controls })
}

/** A fresh fixture over fresh in-memory resource responses, with every control handle. */
export function memoryToolResourceResponsesFixture(): ToolResourceResponsesFixture<string> {
  const responses = createMemoryToolResourceResponses<string>()
  const { controls } = responses
  const access = memoryAccess('tester')
  return {
    responses,
    access,
    otherAccess: memoryOtherAccess('tester-other'),
    hold: controls.hold,
    settle: controls.settle,
    excludeDeferred: controls.excludeDeferred,
    invalidations: controls.invalidations,
    respond: input => controls.respond({ ...input, tenant: access.tenant }),
    reachDeadline: input => controls.reachDeadline({ ...input, tenant: access.tenant }),
  }
}

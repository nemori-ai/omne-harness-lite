import assert from 'node:assert/strict'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Access, DurableEvidence, ToolCallId, ToolWaitId } from './identity.ts'
import type { DecisionValue, ToolDecisionBridge } from './ports.ts'
import type { ToolFailure } from './results.ts'
import {
  completionOf,
  conformanceCase,
  crossTenantAnswers,
  handle,
  otherAccessOf,
  refused,
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
  callId,
  evidence,
  identifyingValues,
  memoryAccess,
  memoryOtherAccess,
  mintEvidence,
  operationId,
  tenantKey,
  waitId,
} from './testing-values.ts'

export interface ToolDecisionBridgeFixture<P> extends ExternalHandles {
  readonly bridge: ToolDecisionBridge<P>
  readonly access: Access<P>
  readonly otherAccess?: Access<P>
  decide?(
    input: Readonly<{ call: ToolCallId; wait: ToolWaitId; value: DecisionValue }>,
  ): Promise<DurableEvidence>
}

function peerOf<P>(fixture: ToolDecisionBridgeFixture<P>, access: Access<P>): ExternalPeer {
  const { bridge } = fixture
  const call = callId('call-1')
  const mutation = (operation: string) => ({ ...access, call, operation: operationId(operation) })
  return {
    ensure: (operation, wait = WAIT) =>
      bridge.ensure({
        ...mutation(operation),
        wait: waitId(wait),
        request: evidence(`${wait}/request`),
      }),
    inspect: async (wait = WAIT) =>
      mapOk(
        await bridge.inspect({ ...access, call, wait: waitId(wait) }),
        found => found.registration,
      ),
    invalidate: (operation, wait = WAIT) =>
      bridge.invalidate({
        ...mutation(operation),
        wait: waitId(wait),
        terminal: TERMINAL,
        cause: 'cancelled',
      }),
    inspectOperation: operation => bridge.inspectOperation(mutation(operation)),
    completion: completionOf(fixture, 'settle'),
    sends: [access, call],
    ...boundHandles(fixture),
  }
}

export const decisionBridgeAnswers = {
  ...externalAnswers,
  resolve: { clause: 'P12', progress: [] },
} as const satisfies AnswerModel<keyof ToolDecisionBridge<unknown>>

const APPROVAL: DecisionValue = { kind: 'answer', value: { kind: 'string', value: 'approve' } }

function scene<P>(fixture: ToolDecisionBridgeFixture<P>, access: Access<P> = fixture.access) {
  const { bridge } = fixture
  const call = callId('call-1')
  const completion = completionOf(fixture, 'settle')
  return {
    call,
    sends: [access, call] as const,
    ensure: (operation = 'ensure-1', wait = WAIT): Promise<DurableEvidence> =>
      landed(
        completion,
        () =>
          bridge.ensure({
            ...access,
            call,
            operation: operationId(operation),
            wait: waitId(wait),
            request: evidence(`${wait}/request`),
          }),
        decisionBridgeAnswers.ensure,
        'ensure',
      ),
    inspect: async (wait = WAIT) =>
      succeeded(await bridge.inspect({ ...access, call, wait: waitId(wait) }), 'inspect'),
    resolve: (decision: DurableEvidence, wait = WAIT) =>
      bridge.resolve({ ...access, call, wait: waitId(wait), decision }),
    decide: (value: DecisionValue, wait = WAIT): Promise<DurableEvidence> =>
      handle(fixture.decide, 'decide').call(fixture, { call, wait: waitId(wait), value }),
  }
}

export function toolDecisionBridgeConformance<P>(): readonly ConformanceCase<
  ToolDecisionBridgeFixture<P>
>[] {
  return [
    ...externalAssociationCases<ToolDecisionBridgeFixture<P>>(peerOf),

    conformanceCase(
      'P06',
      'ensure recalls the registration of the call and wait for another operation',
      async fixture => {
        const s = scene(fixture)
        const first = await s.ensure('ensure-1')
        assert.deepEqual(await s.ensure('ensure-2'), first)
        assert.deepEqual((await s.inspect()).registration, first)
      },
    ),

    conformanceCase('P06', 'inspect shows no decision before the owner decides', async fixture => {
      const s = scene(fixture)
      const registration = await s.ensure()
      assert.deepEqual(await s.inspect(), { registration, decision: null })
    }),

    conformanceCase('P06', 'inspect shows the decision that the owner made', async fixture => {
      handle(fixture.decide, 'decide')
      const s = scene(fixture)
      const registration = await s.ensure()
      const decision = await s.decide(APPROVAL)
      assert.deepEqual(await s.inspect(), { registration, decision })
    }),

    conformanceCase('P12', 'resolve returns the original decision value', async fixture => {
      handle(fixture.decide, 'decide')
      const s = scene(fixture)
      await s.ensure()
      const decision = await s.decide(APPROVAL)
      assert.deepEqual(succeeded(await s.resolve(decision), 'resolve'), APPROVAL)
    }),

    conformanceCase(
      'P12',
      'a no-answer and a declined decision are resolved as they were made',
      async fixture => {
        handle(fixture.decide, 'decide')
        for (const [index, value] of (
          [{ kind: 'no-answer' }, { kind: 'declined' }] as const satisfies readonly DecisionValue[]
        ).entries()) {
          const s = scene(fixture)
          const wait = `wait-${index + 1}`
          await s.ensure(`ensure-${index + 1}`, wait)
          const decision = await s.decide(value, wait)
          assert.deepEqual(succeeded(await s.resolve(decision, wait), 'resolve'), value)
        }
      },
    ),

    conformanceCase('P12', 'resolve refuses a decision that was never made', async fixture => {
      const s = scene(fixture)
      await s.ensure()
      refused(await s.resolve(evidence('never-decided')), 'resolve of evidence that is no decision')
    }),

    conformanceCase(
      'P12',
      'another tenant cannot resolve the decision of a tenant',
      async fixture => {
        handle(fixture.decide, 'decide')
        const s = scene(fixture)
        const other = scene(fixture, otherAccessOf(fixture))
        const registration = await s.ensure()
        const decision = await s.decide(APPROVAL)
        const { ghost } = await crossTenantAnswers({
          ask: {
            real: () => other.resolve(decision),
            ghost: () => other.resolve(evidence('never-decided')),
          },
          row: decisionBridgeAnswers.resolve,
          identifying: [...identifyingValues(fixture.access.tenant, registration), 'ensure-1'],
          submitted: [...other.sends, WAIT, decision],
          what: 'resolve by another tenant',
        })
        refused(ghost, 'resolve of evidence that is no decision')
        assert.deepEqual(succeeded(await s.resolve(decision), 'resolve'), APPROVAL)
      },
    ),

    conformanceCase('P12', 'resolve refuses the decision of another wait', async fixture => {
      handle(fixture.decide, 'decide')
      const s = scene(fixture)
      await s.ensure('ensure-1', 'wait-1')
      await s.ensure('ensure-2', 'wait-2')
      const other = await s.decide(APPROVAL, 'wait-2')
      refused(await s.resolve(other, 'wait-1'), 'resolve of the decision of wait-2 for wait-1')
    }),
  ]
}

export interface MemoryToolDecisionBridge<P> extends ToolDecisionBridge<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    hold(): void
    settle(): Promise<void>
    excludeDeferred(operation: ReturnType<typeof operationId>): Promise<void>
    invalidations(): readonly DurableEvidence[]
    decide(
      input: Readonly<{
        tenant: Access<unknown>['tenant']
        call: ToolCallId
        wait: ToolWaitId
        value: DecisionValue
      }>,
    ): Promise<DurableEvidence>
  }>
}

type Tenant = Access<unknown>['tenant']

const reply = <T>(outcome: Outcome<T, ToolFailure>): Promise<Outcome<T, ToolFailure>> =>
  Promise.resolve(outcome)

export function createMemoryToolDecisionBridge<P>(): MemoryToolDecisionBridge<P> {
  const registrations = new Map<string, { evidence: DurableEvidence; invalidated: boolean }>()
  const decisions = new Map<string, { evidence: DurableEvidence; value: DecisionValue }>()
  const early = new Set<string>()
  const invalidated: DurableEvidence[] = []
  let minted = 0
  const mint = (kind: string, content: unknown): DurableEvidence => {
    minted += 1
    return mintEvidence(`decision-bridge/${kind}/${minted}`, content)
  }
  const ledger = createOperationLedger(mint)
  const waitKey = (tenant: Tenant, call: ToolCallId, wait: ToolWaitId): string =>
    JSON.stringify([tenantKey(tenant), call, wait])
  const operationKey = (tenant: Tenant, call: ToolCallId, operation: string): string =>
    JSON.stringify([tenantKey(tenant), call, operation])
  const invalidate = (key: string): void => {
    const registration = registrations.get(key)
    if (registration === undefined) early.add(key)
    else if (!registration.invalidated) {
      registration.invalidated = true
      invalidated.push(registration.evidence)
    }
  }

  const bridge: ToolDecisionBridge<P> = {
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
          { kind: 'ensure', input: { wait: input.wait, request: input.request } },
          () => {
            const key = waitKey(input.tenant, input.call, input.wait)
            let registration = registrations.get(key)
            if (registration === undefined) {
              registration = {
                evidence: mint('registration', { key, request: input.request }),
                invalidated: false,
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
      const key = waitKey(input.tenant, input.call, input.wait)
      const registration = registrations.get(key)
      if (registration === undefined)
        return reply(
          fail({ kind: 'invalid', field: 'wait', reason: 'no registration of this wait' }),
        )
      return reply(
        succeed({
          registration: registration.evidence,
          decision: decisions.get(key)?.evidence ?? null,
        }),
      )
    },
    invalidate: input =>
      reply(
        ledger.run(
          operationKey(input.tenant, input.call, input.operation),
          input.operation,
          { kind: 'invalidate', input: { wait: input.wait, terminal: input.terminal } },
          () => {
            invalidate(waitKey(input.tenant, input.call, input.wait))
            return mint('invalidation', { wait: input.wait, terminal: input.terminal })
          },
        ),
      ),
    resolve: input => {
      const decided = decisions.get(waitKey(input.tenant, input.call, input.wait))
      const given = input.decision
      if (
        decided === undefined ||
        decided.evidence.owner !== given.owner ||
        decided.evidence.record !== given.record ||
        decided.evidence.digest !== given.digest
      )
        return reply(
          fail({ kind: 'invalid', field: 'decision', reason: 'not a decision of this wait' }),
        )
      return reply(succeed(decided.value))
    },
  }

  const controls: MemoryToolDecisionBridge<P>['controls'] = {
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
    decide: ({ tenant, call, wait, value }) => {
      const key = waitKey(tenant, call, wait)
      if (!registrations.has(key)) return Promise.reject(new Error('no registration to decide'))
      const existing = decisions.get(key)
      if (existing !== undefined) return Promise.resolve(existing.evidence)
      const decided = { evidence: mint('decision', { key, value }), value }
      decisions.set(key, decided)
      return Promise.resolve(decided.evidence)
    },
  }
  return Object.freeze({ ...bridge, durability: 'none' as const, controls })
}

export function memoryToolDecisionBridgeFixture(): ToolDecisionBridgeFixture<string> {
  const bridge = createMemoryToolDecisionBridge<string>()
  const { controls } = bridge
  const access = memoryAccess('tester')
  return {
    bridge,
    access,
    otherAccess: memoryOtherAccess('tester-other'),
    hold: controls.hold,
    settle: controls.settle,
    excludeDeferred: controls.excludeDeferred,
    invalidations: controls.invalidations,
    decide: input => controls.decide({ ...input, tenant: access.tenant }),
  }
}

import assert from 'node:assert/strict'
import {
  decodeAgentExecutionId,
  decodeInputId,
  type AgentJournal,
} from '@omne-harness/agent-contract'
import {
  createMemoryInitializationSource,
  createPolicySessionAccessCheck,
  evidence,
  adoptedInitializationFixture,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  memoryOtherAccess,
  creation,
  operationId,
  type SessionTransactionsFixture,
} from '@omne-harness/session-contract/testing'
import { tenantEquals } from '@omne-harness/legal-identity'
import { createMemorySessionJournal } from '../../src/testing.ts'
import { ok, operation, instance, checkpoint } from './common-journal.ts'

/** Suite evidence is preselected before the actual original Journal publication. */
export function sessionFixture(): SessionTransactionsFixture<string> {
  const initialization = createMemoryInitializationSource(),
    access = memoryAccess('tester')
  // The suite tests transaction semantics; the access policy is one explicit choice: only the
  // fixture's tenant may touch a session. The double's tenant keying refuses the other tenant as
  // well, and J40 observes only that both answers are the same, not which one refused; the scene
  // of participation-access.spec.ts records the check's own conclusion. Tenant and system
  // directories stay open.
  const backend = createMemorySessionJournal({
    initialization,
    accessCheck: createPolicySessionAccessCheck(request =>
      request.target.kind === 'session' &&
      'tenant' in request.access &&
      !tenantEquals(request.access.tenant, access.tenant)
        ? { kind: 'denied' }
        : { kind: 'allowed', evidence: evidence(`access/${request.operation}`) },
    ),
    authorize: () => 'allowed',
  })
  const view = backend.forSession(access)
  return {
    port: backend.transactions,
    access,
    otherAccess: memoryOtherAccess('stranger'),
    creation: creation(),
    operation: operationId,
    initializationGuards: async command => {
      initialization.controls.register(
        command,
        initializationFixtureGuard(
          initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
        ),
      )
      return ok(await initialization.prepare(command))
    },
    publishMessageParticipation: async input => {
      const execution = ok(decodeAgentExecutionId(input.execution)),
        agentOperation = operation(input.operation)
      const loaded = ok(await view.journal.load({ ...access, execution }))
      if (loaded.state.kind === 'ended') throw new Error('original execution already ended')
      if (!loaded.executionAttachment) throw new Error('original attachment unavailable')
      const receipt = ok(
        await view.journal.commit({
          ...access,
          execution,
          operation: agentOperation,
          authority: loaded.executionAttachment,
          expected: loaded.revision,
          checkpoint: loaded.checkpoint,
          state: loaded.state,
          events: [{ kind: 'message', message: input.value.message, source: input.value.source }],
          effects: [],
          replyAdmission: null,
          caller: {
            kind: 'message',
            message: input.value.message,
            source: input.value.source,
            admission: input.value.admission,
          },
        }),
      )
      const resolution = ok(
        await view.journal.query({ ...access, execution, operation: agentOperation }),
      )
      assert.equal(resolution.kind, 'committed')
      if (resolution.kind !== 'committed') throw new Error('original Agent receipt unavailable')
      assert.deepEqual(resolution.receipt, receipt)
      assert.equal(ok(await view.journal.load({ ...access, execution })).revision, receipt.revision)
      return {
        execution,
        operation: agentOperation,
        joint: 'message',
        written: receipt.revision,
        handover: receipt.evidence,
      }
    },
    prepareInputAdmission: async input => {
      const state = ok(await backend.transactions.readWork(access))
      if (state.run.kind !== 'active' || state.run.execution.execution !== input.execution) return
      if (
        state.historyIndex?.inputs
          .find(item => item.input === input.input)
          ?.members.some(item => JSON.stringify(item.accepted) === JSON.stringify(input.receipt))
      )
        return
      const execution = ok(decodeAgentExecutionId(input.execution))
      const admitted = ok(await backend.transactions.readInput({ ...access, input: input.input }))
      const value = {
        id: ok(decodeInputId(input.input)),
        source: admitted.origin,
        content: admitted.message,
        priority: 'ordinary' as const,
      }
      const loaded = await view.journal.load({ ...access, execution })
      if ('failure' in loaded) {
        const original: Parameters<AgentJournal<string>['open']>[0] = {
          ...access,
          execution,
          operation: operation(`fixture-open:${input.operation}`),
          instance: instance(),
          grant: ok(backend.controls.originalGrant({ ...access, execution })),
          initial: value,
          checkpoint: checkpoint(),
        }
        ok(view.controls.planEvidence(original, 'open', input.receipt))
        ok(await view.journal.open(original))
      } else {
        const original = {
          ...access,
          execution,
          operation: operation(`fixture-submit:${input.operation}`),
          value,
        }
        ok(view.controls.planEvidence(original, 'submit', input.receipt))
        ok(await view.journal.submit(original))
      }
    },
  }
}

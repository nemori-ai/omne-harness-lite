import {
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeInputId,
  decodeStepId,
  type AgentCheckpoint,
  type AgentJournal,
} from '@omne-harness/agent-contract'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  type SessionAccessDecision,
  type SessionAccessRequest,
  type SessionCommand,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createMemoryInitializationSource,
  createPolicySessionAccessCheck,
  initializationFixtureGuard,
  initializationFixtureFacts,
  creation,
  memoryAccess,
  operationId,
  ordinaryInput,
  guard,
  evidence,
} from '@omne-harness/session-contract/testing'
import { createMemorySessionJournal } from '../../src/testing.ts'

export function ok<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}
export const operation = (text: string) => ok(decodeAgentOperationId(text))
export const instance = (text = 'instance-1') => ok(decodeAgentInstanceId(text))
export function checkpoint(): AgentCheckpoint {
  const adoption = { owner: 'test', name: 'checkpoint', revision: '1', digest: 'test:checkpoint' }
  return {
    schema: adoption,
    definition: adoption,
    step: ok(decodeStepId('step-1')),
    position: 'E3',
    calls: [],
    passages: [],
    batch: null,
    inputBatch: null,
    requestPreparation: null,
    compaction: null,
    adoptedContext: null,
    guard: null,
    completedPassages: [],
    priorConditions: null,
  }
}
export type SceneQualification = {
  agent: boolean
  session: boolean | 'unavailable'
  /** When set, the Session check holds its answer until the returned promise settles. */
  hold?: (request: SessionAccessRequest<string>) => Promise<void> | undefined
}
export async function scene(
  session = 'journal-session',
  budget?: { entries: number; bytes: number; capacityBytes: number },
  qualification: SceneQualification = { agent: true, session: true },
) {
  const access = memoryAccess('tester', session)
  const initialization = createMemoryInitializationSource()
  // The Session side: an explicit policy. Only the scene's own tenant may touch a session; the
  // scene's qualification flag decides the rest per request, and every allowed decision gets its
  // own evidence so a test can tell which call a recorded decision came from. Every conclusion is
  // recorded with its request, so a test can tell a refusal of the check from one of the store.
  let decisions = 0
  const decided: { request: SessionAccessRequest<string>; answer: SessionAccessDecision }[] = []
  const policy = createPolicySessionAccessCheck<string>(request => {
    if (
      request.target.kind === 'session' &&
      'tenant' in request.access &&
      !tenantEquals(request.access.tenant, access.tenant)
    )
      return { kind: 'denied' }
    const session = qualification.session
    if (session === 'unavailable')
      return { kind: 'unavailable', diagnostic: 'scene qualification unavailable' }
    return session
      ? { kind: 'allowed', evidence: evidence(`access/${request.operation}/${++decisions}`) }
      : { kind: 'denied' }
  })
  const accessCheck = {
    durability: policy.durability,
    async check(request: SessionAccessRequest<string>) {
      const answer = await policy.check(request)
      decided.push({ request, answer })
      await qualification.hold?.(request)
      return answer
    },
    controls: { asked: policy.controls.asked, decided: () => [...decided] },
  }
  const backend = createMemorySessionJournal({
    initialization,
    accessCheck,
    authorize: () => (qualification.agent ? 'allowed' : 'denied'),
    ...(budget ? { budget } : {}),
  })
  const value = creation({ initial: ordinaryInput('input-1') })
  const command: Extract<SessionCommand, { kind: 'create' }> = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('create'),
      creation: value,
    },
  }
  const adopted = adoptedInitializationFixture(command)
  initialization.controls.register(
    command,
    initializationFixtureGuard(initializationFixtureFacts(command, null, adopted)),
  )
  const guards = ok(await initialization.prepare(command))
  ok(await backend.transactions.commit({ access, command, guards }))
  const started = ok(
    await backend.transactions.commit({
      access,
      command: {
        kind: 'startRun',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId('start'),
          entry: 'interactive',
          candidate: value.definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [guard('evidence-bridge', 'login-entry', { session, operation: 'start' })],
    }),
  )
  const snapshot = ok(await backend.transactions.readWork(access))
  if (snapshot.run.kind !== 'active') throw new Error('not active')
  const execution = ok(decodeAgentExecutionId(snapshot.run.execution.execution))
  const view = backend.forSession(access)
  const admitted = ok(
    await backend.transactions.readInput({ ...access, input: snapshot.run.first }),
  )
  const input: Parameters<AgentJournal<string>['open']>[0] = {
    ...access,
    execution,
    operation: operation('open'),
    instance: instance(),
    grant: started.receipt.source,
    initial: {
      id: ok(decodeInputId(admitted.input)),
      content: admitted.message,
      source: admitted.origin,
      priority: 'ordinary',
    },
    checkpoint: checkpoint(),
  }
  const opened = ok(await view.journal.open(input))
  return { access, accessCheck, backend, view, execution, opened, input }
}
export { evidence, operationId }

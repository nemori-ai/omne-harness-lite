import { decodeEntry } from '../src/entries.ts'
import { digestOf } from '../src/operations.ts'
import type {
  SessionCommand,
  MutationName,
  Participation,
  SessionLogObservation,
  SessionOperationId,
} from '@omne-harness/session-contract'
import {
  createMemorySessionTransactions,
  createPolicySessionAccessCheck,
  memoryAccess,
  guard,
  succeeded,
  creation,
  operationId,
  ordinaryInput,
  evidence,
  createMemoryInitializationSource,
  createMemorySessionHistorySource,
} from '@omne-harness/session-contract/testing'
import { initializationGuards } from './initialization-fixture.ts'

export function scene() {
  const access = memoryAccess('tester')
  const initialization = createMemoryInitializationSource()
  const history = createMemorySessionHistorySource()
  // The scene tests Session behavior; its access policy is stated open and every request is logged.
  const accessCheck = createPolicySessionAccessCheck<string>(() => ({
    kind: 'allowed',
    evidence: evidence('access'),
  }))
  const port = createMemorySessionTransactions<string>({ initialization, history, accessCheck })
  const base = { tenant: access.tenant, session: access.session }
  const commit = async <K extends MutationName>(
    command: Extract<SessionCommand, { kind: K }> & { kind: K },
  ) => {
    const guards = [guard('login', 'login-entry', 'present')]
    const complete: SessionCommand = command
    if (
      complete.kind === 'receive' &&
      complete.input.fact.kind === 'input-handover' &&
      complete.input.fact.result.kind === 'accepted'
    ) {
      const snapshot = succeeded(await port.readWork(access), 'admission snapshot')
      const fact = complete.input.fact
      if (fact.result.kind !== 'accepted') throw new Error('accepted fixture')
      const receipt = fact.result.receipt
      const run = snapshot.run
      if (
        run.kind === 'active' &&
        run.advance !== null &&
        run.execution.execution === fact.execution
      ) {
        const entries = port.controls.entriesOf(access.tenant, access.session)
        const original = history.read(snapshot, entries, {
          kind: 'selected',
          inputs: [fact.input],
        }).index
        const attempt = original.attempts.find(item => item.attempt === run.advance?.attempt)
        const start = entries.find(row => {
          const value = decodeEntry(row)
          return 'ok' in value && value.ok.kind === 'run.started' && value.ok.run === run.run
        })
        if (attempt === undefined || start === undefined)
          throw new Error('fixture requires original SE13/SE15')
        const started = {
          owner: '@omne-harness/session-contract',
          record: start.id,
          revision: start.revision,
          digest: `sha256:${digestOf(start)}`,
        }
        const directory = original.inputs.find(item => item.input === fact.input)
        if (!directory?.members.some(item => item.operation === complete.input.operation)) {
          // These are explicit offline grant/attachment fixtures, never production authority.
          history.admit(base, fact.input, {
            ordinal: directory?.count ?? '0',
            run: run.run,
            execution: fact.execution,
            operation: complete.input.operation,
            accepted: receipt,
            attempt: attempt.attempt,
            runStarted: started,
            attemptStarted: attempt.started,
            attachment: 'fixture-original-attachment',
            grant: evidence('fixture-original-grant'),
          })
          if (!original.executions.some(item => item.execution === fact.execution))
            history.observe({
              ...base,
              run: run.run,
              execution: fact.execution,
              sequence: null,
              revision: '1',
              source: receipt,
              executionEvidence: receipt,
              consequences: [],
            })
        }
      }
    }
    if (complete.kind === 'create' || complete.kind === 'completeInitialization') {
      const previous = await port.readWork(access)
      const fixture = initializationGuards(complete, 'ok' in previous ? previous.ok : null)[0]
      if (fixture === undefined) throw new Error('missing initialization fixture')
      initialization.controls.register(complete, fixture)
      guards.push(
        ...succeeded(await initialization.prepare(complete), 'initialization preparation'),
      )
    }
    return port.commit<K>({ access, command, guards })
  }
  const read = async () => succeeded(await port.readWork(access), 'read')
  const create = async (value = creation()) =>
    succeeded(
      await commit({
        kind: 'create',
        input: { ...base, operation: operationId('create'), creation: value },
      }),
      'create',
    )
  const accept = async (name: string) =>
    succeeded(
      await commit({
        kind: 'accept',
        input: { ...base, operation: operationId(`accept-${name}`), value: ordinaryInput(name) },
      }),
      'accept',
    )
  const start = async (name = 'start') =>
    succeeded(
      await port.commit({
        access,
        command: {
          kind: 'startRun',
          input: {
            ...base,
            operation: operationId(name),
            entry: 'interactive',
            candidate: creation().definition.candidate,
            instance: { owner: 'agent', id: name },
          },
        },
        guards: [guard('login', 'login-entry', 'present')],
      }),
      'start',
    )
  const active = async () => {
    const snapshot = await read()
    if (snapshot.run.kind !== 'active' || snapshot.run.advance === null)
      throw new Error('expected active Run')
    return { snapshot, run: snapshot.run, advance: snapshot.run.advance }
  }
  const control = async (kind: 'archive' | 'unarchive', name = kind) =>
    succeeded(
      await commit({
        kind: 'control',
        input: { ...base, operation: operationId(name), intent: { kind } },
      }),
      kind,
    )
  return {
    access,
    base,
    port,
    history,
    project: async (observation: SessionLogObservation, operation: SessionOperationId) => {
      const snapshot = await read()
      const reference = snapshot.executions?.find(
        item => item.execution.execution === observation.execution,
      )?.execution
      const head =
        observation.executionEvidence ??
        (reference?.revision === observation.revision ? reference.evidence : null) ??
        observation.source
      const original = { ...observation, executionEvidence: head }
      history.observe(original)
      return port.controls.project(original, operation)
    },
    initialization,
    commit,
    read,
    create,
    accept,
    start,
    active,
    control,
  }
}

export async function open() {
  const s = scene()
  await s.create()
  await s.accept('first')
  await s.start()
  return s
}
export const participation = (execution: string, joint: Participation['joint']): Participation => ({
  execution,
  operation: `agent-${joint}`,
  joint,
  written: '2',
  handover: evidence(joint),
})

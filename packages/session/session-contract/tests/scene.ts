import type { SessionCommand, MutationName, Participation } from '@omne-harness/session-contract'
import {
  createMemorySessionTransactions,
  memoryAccess,
  guard,
  succeeded,
  creation,
  operationId,
  ordinaryInput,
  evidence,
  createMemoryInitializationSource,
} from '@omne-harness/session-contract/testing'
import { initializationGuards } from './initialization-fixture.ts'

export function scene() {
  const access = memoryAccess('tester')
  const initialization = createMemoryInitializationSource()
  const port = createMemorySessionTransactions<string>({ initialization })
  const base = { tenant: access.tenant, session: access.session }
  const commit = async <K extends MutationName>(
    command: Extract<SessionCommand, { kind: K }> & { kind: K },
  ) => {
    const guards = [guard('login', 'login-entry', 'present')]
    const complete: SessionCommand = command
    if (complete.kind === 'create' || complete.kind === 'completeInitialization') {
      const previous = await port.readWork(access)
      const fixture = initializationGuards(complete, 'ok' in previous ? previous.ok : null)[0]
      if (fixture === undefined) throw new Error('missing initialization fixture')
      initialization.controls.register(complete, fixture)
      guards.push(
        ...succeeded(await initialization.prepare(complete), 'initialization preparation'),
      )
    }
    return port.commit<K>({ command, guards })
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

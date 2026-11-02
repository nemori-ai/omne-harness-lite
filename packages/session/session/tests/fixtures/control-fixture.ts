import { vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type {
  AgentDrivePort,
  ConsumptionId,
  ProducerRef,
  WorkSnapshot,
  SessionLogObservation,
  SessionTransactionPort,
  SessionLogConsequence,
} from '@omne-harness/session-contract'
import {
  createMemoryInitializationSource,
  createMemorySessionHistorySource,
  createMemorySessionTransactionPair,
  evidence,
  operationId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { fixtureInitializationGuard, type BackendFactory } from './backends.ts'
import { harness, type HarnessOptions, type Harness } from './harness.ts'

export const turn = (): Promise<void> => new Promise(resolve => setImmediate(resolve))
export const readControlWork = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'control snapshot')

export function interceptReads(h: Harness, hook: SessionTransactionPort<string>['readWork']): void {
  const bind = h.dependencies.transactions.bind.bind(h.dependencies.transactions)
  h.dependencies.transactions.bind = checked => {
    const view = bind(checked)
    return { ...view, readWork: hook }
  }
}

/** Hides the sessions a reason would list, so the recovery scan can only find them by another reason. */
export function hideReasons(h: Harness, hidden: readonly string[]): void {
  const directory = h.dependencies.directory as {
    current: () => SessionTransactionPort<string> | null
  }
  const current = directory.current.bind(directory)
  directory.current = () => {
    const port = current()
    if (port === null) return null
    return {
      ...port,
      pending: async input =>
        input.reason !== undefined && hidden.includes(input.reason)
          ? succeed({ sessions: [], next: null })
          : port.pending(input),
    }
  }
}

export async function controlFixture(options: Partial<HarnessOptions> = {}) {
  const history = createMemorySessionHistorySource()
  const initialization = createMemoryInitializationSource()
  let project: (observation: SessionLogObservation) => Promise<void> = async () => {
    throw new Error('backend is not ready')
  }
  const backend: BackendFactory = {
    name: 'control memory pair',
    open: async accessCheck => {
      const pair = createMemorySessionTransactionPair<string>({
        initialization,
        history,
        accessCheck,
      })
      project = async observation => {
        history.observe(observation)
        succeeded(
          await pair.transactions.controls.project(
            observation,
            operationId(`projection-${observation.revision}`),
          ),
          'project original facts',
        )
      }
      return {
        name: 'control memory pair',
        ...pair,
        initializationGuards: async command => {
          initialization.controls.register(command, fixtureInitializationGuard(command))
          return succeeded(await initialization.prepare(command), 'control initialization')
        },
        dispose: async () => undefined,
      }
    },
  }
  const h = await harness({ backend, advance: true, ...options })
  const control = vi.fn<AgentDrivePort['control']>(async () =>
    succeed({ revision: '1', evidence: evidence('control/accepted') }),
  )
  const query = vi.fn<AgentDrivePort['query']>(async () => succeed('unknown'))
  h.drive.control = control
  h.drive.query = query
  const invoke = vi.spyOn(h.drive, 'invoke')
  const resume = vi.spyOn(h.drive, 'resume')
  await h.create()
  await h.accept('input-1')
  await vi.waitFor(async () => {
    if ((await readControlWork(h)).run.kind !== 'active') throw new Error('waiting for Run')
  })
  const snapshot = await readControlWork(h)
  if (snapshot.run.kind !== 'active') throw new Error('no active Run')
  const original = snapshot.run
  return {
    h,
    control,
    query,
    invoke,
    resume,
    original,
    project,
    calls: async (kind: 'model' | 'tool' = 'model') => {
      if (original.advance === null) throw new Error('missing attempt')
      const purpose = kind === 'tool' ? ('action' as const) : ('main' as const)
      const bindings = ['model-1', 'model-2'].map(call => ({
        producer: { kind, call } as ProducerRef,
        action: call,
        consumer: { owner: 'agent', work: original.run, position: call, purpose },
        request: evidence(`request/${call}`),
        initiatingAttempt: original.advance?.attempt ?? null,
      }))
      const consequences: SessionLogConsequence[] = bindings.map(
        binding =>
          ({
            kind: 'call-registration',
            consumption: binding.producer.call as ConsumptionId,
            registration: { kind: 'associated', binding, purpose },
          }) as SessionLogConsequence,
      )
      const waiting = 'unassociated-tool' as ConsumptionId
      consequences.push({
        kind: 'call-registration',
        consumption: waiting,
        registration: {
          kind: 'tool-intent',
          action: 'tool-action',
          consumer: {
            owner: 'agent',
            work: original.run,
            position: 'tool-position',
            purpose: 'action',
          },
          request: evidence('tool/request'),
          initiatingAttempt: original.advance.attempt,
          purpose: 'action',
        },
      })
      consequences.push({
        kind: 'registered-waiting',
        calls: [
          ...bindings.map(binding => ({
            consumption: binding.producer.call as ConsumptionId,
            position: binding.producer.call,
          })),
          { consumption: waiting, position: 'tool-position' },
        ],
        other: [],
      })
      await project({
        ...h.access(),
        run: original.run,
        execution: original.execution.execution,
        sequence: '1',
        revision: '2',
        executionEvidence: evidence('agent/head/2'),
        source: evidence('agent/calls'),
        consequences,
      })
      return bindings
    },
    cancel: async (local = true) => {
      const input = {
        ...h.access(),
        operation: operationId('cancel'),
        run: original.run,
        urgency: 'graceful' as const,
      }
      if (local) return succeeded(await h.faces('intake').work.cancelRun(input), 'cancel')
      return succeeded(
        await h.backend.transactions.commit({
          access: h.access(),
          command: { kind: 'cancelRun', input },
          guards: [],
        }),
        'direct cancel',
      )
    },
    notice: async (kind = 'control.requested') => {
      const snapshot = await readControlWork(h)
      h.instance.committed({
        ...h.access(),
        revision: snapshot.revision,
        source: snapshot.source,
        kinds: [kind],
      })
      await turn()
    },
  }
}

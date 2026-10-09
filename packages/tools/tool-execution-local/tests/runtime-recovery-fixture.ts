import { vi } from 'vitest'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { unwrap } from '@omne-harness-lite/identity-values'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type {
  ToolJournalPayload,
  ToolRuntimeDependencies,
} from '@omne-harness-lite/tool-execution-runtime'
import { createRuntimeJournal } from '../src/runtime-journal.ts'
import { recoverExecutions } from '../src/runtime-recovery.ts'
import { at, fixture, ref, request, scope } from './execution-owner-fixture.ts'
import { environmentDefinition, environmentPorts } from './execution-environment-fixture.ts'

export const resource = {
  key: 'original-process',
  provider: 'controlled',
  reference: { unit: 'unit', generation: 'one' },
}

/** Reopens the actual SQL log and rebuilds its journal. Recovery authority and OS observations are controlled ports. */
export async function recoveryFixture(options: { adopted?: boolean; started?: boolean } = {}) {
  const f = await fixture(undefined, undefined, environmentDefinition)
  const ports = environmentPorts()
  const original = await f.journal.read(scope, ref.callId)
  if (original.kind !== 'view') throw new Error('Original prefix unavailable')
  const values: ToolJournalPayload[] = [
    {
      kind: 'execution_intended',
      revision: 1,
      ref,
      origin: request.origin,
      selected: {
        capability: 'tool:echo',
        asset: 'echo-asset',
        version: '1',
        adoption: 'adopted',
        definition: environmentDefinition,
      },
      input: { format: 'tool-input/1', acceptedAt: at, chain: [], pass: 'original-after-action' },
    },
    ...(options.started === false
      ? []
      : [
          { kind: 'execution_started' as const, revision: 1 as const, ref, at },
          {
            kind: 'execution_environment_adopted' as const,
            revision: 1 as const,
            ref,
            adoption: ports.acquired.adoption,
          },
        ]),
    { kind: 'resource_planned', revision: 1, ref, resource },
    ...(options.adopted
      ? [
          { kind: 'resource_permitted' as const, revision: 1 as const, ref, key: resource.key },
          { kind: 'resource_adopted' as const, revision: 1 as const, ref, key: resource.key },
        ]
      : []),
  ]
  const seeded = await f.journal.commit({
    ref,
    origin: request.origin,
    expected: original.prefix,
    values,
  })
  if (seeded.kind !== 'view') throw new Error(`Original seed rejected: ${seeded.reason}`)
  await f.journal.close()
  await f.log.close()
  const log = await openSqlLogFixture({
    dir: f.dir,
  })
  const backing = {
    ownerGeneration: 'owner-generation',
    borrow: () => ({ log, release: async () => {} }),
  }
  const journal = createRuntimeJournal({ backing, history: f.history })
  const controlledJournal = { ...journal, read: vi.fn(journal.read), commit: vi.fn(journal.commit) }
  const authority = Object.freeze({}) as RecoveryAccess
  const enumerate = vi.fn<ToolRuntimeDependencies['owner']['enumerate']>(async () => ({
    kind: 'sessions',
    sessions: [{ scope, locator: 'original-log' }],
  }))
  const readPrefix = vi.fn<ToolRuntimeDependencies['owner']['readPrefix']>(
    async (access, candidate) => {
      if (access !== authority || JSON.stringify(candidate) !== JSON.stringify(scope))
        return { kind: 'rejected', reason: 'notAuthorized' }
      const prefix = await log.readSince(scope.session, 0)
      return 'failure' in prefix
        ? { kind: 'rejected', reason: 'unavailable' }
        : { kind: 'prefix', prefix: { scope, ownerGeneration: backing.ownerGeneration, ...prefix } }
    },
  )
  const recover = vi.fn<ToolRuntimeDependencies['environments']['recover']>(
    async (_scope, _access, resources) =>
      resources.map(resource => ({ resource, status: 'confirmedStopped' as const })),
  )
  const recoverOwned = vi.fn<ToolRuntimeDependencies['environments']['recoverOwned']>(async () => ({
    kind: 'recovered',
    values: [],
    failures: [],
  }))
  const now = vi.fn<ToolRuntimeDependencies['clock']['now']>(async () =>
    unwrap(instantFromRfc3339(at)),
  )
  const input: Parameters<typeof recoverExecutions>[0] = {
    dependencies: {
      backing,
      owner: {
        enumerate,
        readPrefix,
        borrow: async () => ({ kind: 'rejected', reason: 'unavailable' }),
      },
      recovery: authority,
      clock: { now },
      environments: {
        recover,
        recoverOwned,
        resolvePlacement: async () => ({ kind: 'notApplicable' }),
        acquire: async () => ({ kind: 'rejected', reason: 'unavailable' }),
      },
    },
    journal: controlledJournal,
    attempts: 3,
    retry: vi.fn(async () => {}),
  }
  return {
    f,
    input,
    log,
    journal,
    controlledJournal,
    authority,
    recover,
    recoverOwned,
    now,
    enumerate,
    readPrefix,
    run: () => recoverExecutions(input),
    async read() {
      const view = await journal.read(scope, ref.callId)
      if (view.kind !== 'view') throw new Error('Cold journal unavailable')
      return view.executions.get(ref.callId)!
    },
    async close() {
      await journal.close()
      await log.close()
      await f.close()
    },
  }
}

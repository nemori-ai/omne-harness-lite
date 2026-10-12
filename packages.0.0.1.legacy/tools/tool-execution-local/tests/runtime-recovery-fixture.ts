import { vi } from 'vitest'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { unwrap } from '@omne-harness-lite/identity-values'
import type { ToolRuntimeOriginalIssueDependencies } from '@omne-harness-lite/tool-execution-runtime'
import { createOriginalRecordJournal } from '../src/original-record-journal.ts'
import { recoverOriginalExecutions } from '../src/runtime-recovery.ts'
import { at, ref, scope } from './execution-owner-fixture.ts'
import { environmentDefinition, environmentPorts } from './execution-environment-fixture.ts'
import { nativeRuntimeFixture } from './native-runtime-fixture.ts'

export const resource = {
  key: 'original-process',
  provider: 'controlled',
  reference: { unit: 'unit', generation: 'one' },
}

/** Actual original issue, same-unit transitions and SQLite reopen; recovery authority and OS observations are controlled. */
export async function recoveryFixture(options: { adopted?: boolean; started?: boolean } = {}) {
  const cleanup: (() => Promise<void>)[] = []
  const f = await nativeRuntimeFixture(cleanup)
  const original = await f.seed({
    definition: environmentDefinition,
    pass: 'original-after-action',
  })
  const ports = environmentPorts()
  if (options.started !== false) {
    const consumed = await f.support.storage.atomic(unit =>
      original.participant.consumeOriginalIn(unit, original.claim),
    )
    if (consumed.kind !== 'staged') throw new Error('original consumption unavailable')
  }
  const values: Parameters<typeof original.records.stageTransitionIn>[2] = [
    ...(options.started === false
      ? []
      : [
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
  const staged = await f.support.storage.atomic(unit =>
    original.records.stageTransitionIn(unit, original.job, values),
  )
  if (staged.kind !== 'staged') throw new Error('original resource seed unavailable')
  const log = await f.reopen()
  const recover = f.recover
  const recoverOwned = f.recoverOwned
  const now = vi.fn<ToolRuntimeOriginalIssueDependencies['clock']['now']>(async () =>
    unwrap(instantFromRfc3339(at)),
  )
  const {
    backing: _backing,
    owner: _owner,
    history: _history,
    runnerHost: _runner,
    ...base
  } = f.dependencies
  const dependencies: ToolRuntimeOriginalIssueDependencies = {
    ...base,
    tenant: scope.tenant,
    recoveryPageSize: 1,
    originalIssue: f.support,
    clock: { now },
    environments: { ...base.environments, recover, recoverOwned },
  }
  const journal = createOriginalRecordJournal(dependencies)
  const controlledJournal = { ...journal, read: vi.fn(journal.read), commit: vi.fn(journal.commit) }
  const input: Parameters<typeof recoverOriginalExecutions>[0] = {
    dependencies,
    journal: controlledJournal,
    attempts: 3,
    retry: vi.fn(async () => {}),
  }
  return {
    f: { implementation: f.unused },
    input,
    log,
    journal,
    controlledJournal,
    authority: dependencies.recovery,
    recover,
    recoverOwned,
    now,
    run: () => recoverOriginalExecutions(input),
    async read() {
      const view = await journal.read(scope, ref.callId)
      if (view.kind !== 'view') throw new Error('cold original Tool record unavailable')
      return view.executions.get(ref.callId)!
    },
    async close() {
      await journal.close()
      for (const close of cleanup.splice(0)) await close()
    },
  }
}

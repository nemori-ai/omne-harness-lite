import { vi } from 'vitest'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { unwrap } from '@omne-harness-lite/identity-values'
import type {
  ToolOriginalIssueSupport,
  ToolPoolInstance,
  ToolRuntimeConfig,
  ToolRuntimeOriginalIssueDependencies,
} from '@omne-harness-lite/tool-execution-runtime'
import {
  createOriginalIssueToolRuntime,
  createToolExecutionRecordReader,
  toolOriginalIssueMigrations,
} from '../src/index.ts'
import { createToolOriginalIssue } from '../src/original-issue.ts'
import { factoryFixture, factoryConfig } from './runtime-factory-fixture.ts'
import { at, definition, ref, scope } from './execution-owner-fixture.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { journalIntent } from './runtime-journal-boundaries-fixture.ts'

export async function nativeRuntimeFixture(cleanup: (() => Promise<void>)[]) {
  const f = await factoryFixture()
  cleanup.push(f.close)
  for (const part of toolOriginalIssueMigrations)
    await f.log.fixtureStorage.write(tx => part.migration.up(tx.db))
  let support: ToolOriginalIssueSupport = {
    storage: f.log.fixtureStorage,
    log: f.log.participant,
    access: f.log.fixtureAccess,
    current: { authorizeIn: async () => ({ kind: 'authorized' }) },
    classifyTerminalIn: vi.fn<ToolOriginalIssueSupport['classifyTerminalIn']>(async () => ({
      kind: 'classified',
      late: true,
    })),
    admission: {
      admitOriginal: async () => ({ kind: 'denied' }),
      consumeOriginal: async () => ({ kind: 'denied' }),
    },
  }
  const recover = vi.fn<ToolRuntimeOriginalIssueDependencies['environments']['recover']>(
    async (_scope, _access, resources) =>
      resources.map(resource => ({ resource, status: 'confirmedStopped' })),
  )
  const recoverOwned = vi.fn<ToolRuntimeOriginalIssueDependencies['environments']['recoverOwned']>(
    async () => ({ kind: 'recovered', values: [], failures: [] }),
  )
  // The production constructor receives no Session enumeration, full-prefix or Runner selection ports.
  const {
    backing: _backing,
    owner: _owner,
    history: _history,
    runnerHost: _runner,
    ...base
  } = f.dependencies
  let pool: ToolPoolInstance | undefined
  async function seed(options: { definition?: ToolDefinition; pass?: string } = {}) {
    await f.log.fixturePrefix(scope)
    const source = await f.log.participant.source(f.log.fixtureAccess, scope)
    if ('failure' in source) throw new Error('fixture source unavailable')
    const intended = journalIntent()
    if (intended.kind !== 'execution_intended') throw new Error('fixture intent invalid')
    const original = createToolOriginalIssue({
      support,
      generation: 'previous-owner',
      expected: { scope, tail: source.source.tail, ownerGeneration: 'previous-log' },
      value: {
        ...intended,
        selected: {
          capability: 'tool:echo',
          asset: 'echo-asset',
          version: '1',
          adoption: 'adopted',
          definition: options.definition ?? definition,
        },
        input: {
          format: 'tool-input/1',
          submission: { adoption: 'adopted' },
          acceptedAt: at,
          pass: options.pass ?? 'original-pass',
          chain: [],
        },
      },
      clock: { now: async () => unwrap(instantFromRfc3339(at)) },
      stopped: new Promise(() => {}),
      isOpen: () => true,
      isRetained: () => true,
    })
    const staged = await support.storage.atomic(unit => original.participant.stageOriginalIn(unit))
    if (staged.kind !== 'staged') throw new Error(`fixture original failed: ${staged.kind}`)
    return { ...original, claim: staged.claim }
  }
  function start(config: ToolRuntimeConfig = factoryConfig()) {
    pool = createOriginalIssueToolRuntime(config, {
      ...base,
      tenant: scope.tenant,
      recoveryPageSize: 1,
      originalIssue: support,
      environments: { ...base.environments, recover, recoverOwned },
    })
    return pool
  }
  async function history() {
    const reader = createToolExecutionRecordReader({
      storage: support.storage,
      tenant: scope.tenant,
      participant: support.log,
      authority: support.access,
    })
    return support.storage.atomic(unit => reader.readOriginalIn(unit, ref))
  }
  async function reopen() {
    await f.log.close()
    const log = await openSqlLogFixture({ dir: f.dir })
    cleanup.unshift(() => log.close())
    support = {
      ...support,
      storage: log.fixtureStorage,
      log: log.participant,
      access: log.fixtureAccess,
    }
    return log
  }
  return {
    ...f,
    get support() {
      return support
    },
    seed,
    start,
    history,
    reopen,
    recover,
    recoverOwned,
    pool: () => pool,
  }
}

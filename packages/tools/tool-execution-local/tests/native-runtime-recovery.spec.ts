import { afterEach, expect, test, vi } from 'vitest'
import { narrow } from '@omne-harness-lite/storage'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { unwrap } from '@omne-harness-lite/identity-values'
import type {
  ToolOriginalIssueSupport,
  ToolPoolInstance,
  ToolRuntimeOriginalIssueDependencies,
} from '@omne-harness-lite/tool-execution-runtime'
import {
  createOriginalIssueToolRuntime,
  createToolExecutionRecordReader,
  toolOriginalIssueMigrations,
} from '../src/index.ts'
import { createToolOriginalIssue } from '../src/original-issue.ts'
import { factoryFixture, factoryConfig } from './runtime-factory-fixture.ts'
import { at, definition, ref, request, scope } from './execution-owner-fixture.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { resource } from './runtime-recovery-fixture.ts'
import { journalIntent } from './runtime-journal-boundaries-fixture.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

async function fixture() {
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
  const recoverOwned = vi.fn(async () => ({ kind: 'recovered' as const, values: [], failures: [] }))
  // The production constructor receives no Session enumeration, full-prefix or Runner selection ports.
  const {
    backing: _backing,
    owner: _owner,
    history: _history,
    runnerHost: _runner,
    ...base
  } = f.dependencies
  let pool: ToolPoolInstance | undefined
  async function seed() {
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
          definition,
        },
        input: {
          format: 'tool-input/1',
          submission: { adoption: 'adopted' },
          acceptedAt: at,
          pass: 'original-pass',
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
  function start() {
    pool = createOriginalIssueToolRuntime(factoryConfig(), {
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

test('native construction reads an empty task index without borrowing or enumerating Sessions', async () => {
  const f = await fixture()
  const read = vi.spyOn(f.log.fixtureStorage, 'read')
  const pool = f.start()
  await pool.ready
  expect(read).toHaveBeenCalled()
  expect(f.borrow).not.toHaveBeenCalled()
  expect(f.enumerate).not.toHaveBeenCalled()
  expect(f.recoverOwned).not.toHaveBeenCalled()
  await pool.close()
})

test('cold queued originals receive one failed terminal with original identity and no author call', async () => {
  const f = await fixture()
  await f.seed()
  await f.reopen()
  const pool = f.start()
  await pool.ready
  const result = await f.history()
  expect(result.kind).toBe('found')
  if (result.kind !== 'found') return
  expect(result.history.started).toBeUndefined()
  expect(result.history.terminal?.value.terminal).toMatchObject({
    outcome: 'failed',
    code: 'abnormal_interruption',
  })
  expect(result.history.terminal?.value.account).toMatchObject({
    late: true,
    cost: { total_usd: 'unknown' },
  })
  expect(result.history.intent.value.origin).toEqual(request.origin)
  expect(f.support.classifyTerminalIn).toHaveBeenCalledTimes(1)
  expect(f.unused).not.toHaveBeenCalled()
  expect(f.enumerate).not.toHaveBeenCalled()
  await pool.close()
})

test.each(['pending', 'unsupported'] as const)(
  'native cold %s resource blocks readiness and preserves the original receipt',
  async status => {
    const f = await fixture()
    const original = await f.seed()
    const staged = await f.support.storage.atomic(unit =>
      original.records.stageTransitionIn(unit, original.job, [
        { kind: 'resource_planned', revision: 1, ref, resource },
      ]),
    )
    expect(staged.kind).toBe('staged')
    await f.reopen()
    f.recover.mockResolvedValueOnce([{ resource, status, evidence: { pending: true } }])
    const pool = f.start()
    await expect(pool.ready).rejects.toThrow('unconfirmed resource cleanup')
    const incomplete = await f.history()
    if (incomplete.kind !== 'found') throw new Error('original missing')
    expect(incomplete.history.terminal).toBeUndefined()
    expect(
      incomplete.history.resources.get(resource.key)?.observations.at(-1)?.value,
    ).toMatchObject({ status: 'unconfirmed', evidence: { pending: true } })
    // Close retries this owner's retained recovery obligation without reissuing the tool.
    await pool.close()
    const completed = await f.history()
    if (completed.kind !== 'found') throw new Error('original missing')
    expect(
      completed.history.resources.get(resource.key)?.observations.map(value => value.value.status),
    ).toEqual(['unconfirmed', 'confirmed'])
    expect(completed.history.terminal?.value.terminal).toMatchObject({
      code: 'abnormal_interruption',
    })
    expect(f.unused).not.toHaveBeenCalled()
  },
)

test('cold terminal originals remain unchanged across another owner', async () => {
  const f = await fixture()
  const original = await f.seed()
  const recognized = await f.support.storage.atomic(unit =>
    original.participant.stageOriginalIn(unit),
  )
  expect(recognized.kind).toBe('alreadyIssued')
  // The original handle owns its actual claim; no reconstructed owner can obtain one.
  const source = await original.recordStatus()
  expect(source).toBe('known')
  await f.reopen()
  const first = f.start()
  await first.ready
  await first.close()
  const before = await f.history()
  const second = f.start()
  await second.ready
  expect(await f.history()).toEqual(before)
  await second.close()
  expect(f.unused).not.toHaveBeenCalled()
})

test('a malformed original index blocks native readiness instead of becoming an empty recovery', async () => {
  const f = await fixture()
  await f.seed()
  await f.support.storage.write(tx =>
    narrow<{ tool_original_issue: { identity: string } }>(tx)
      .updateTable('tool_original_issue')
      .set({ identity: '{}' })
      .execute(),
  )
  const pool = f.start()
  await expect(pool.ready).rejects.toThrow('snapshot unavailable')
  await expect(pool.close()).rejects.toThrow('snapshot unavailable')
  expect(f.unused).not.toHaveBeenCalled()
  expect(f.enumerate).not.toHaveBeenCalled()
})

test.each([false, true])(
  'cold original started with waiting=%s ends without resuming the author',
  async waiting => {
    const f = await fixture()
    const original = await f.seed()
    const consumed = await f.support.storage.atomic(unit =>
      original.participant.consumeOriginalIn(unit, original.claim),
    )
    expect(consumed.kind).toBe('staged')
    if (waiting) {
      const recorded = await f.support.storage.atomic(unit =>
        original.records.stageTransitionIn(unit, original.job, [
          {
            kind: 'execution_waiting',
            revision: 1,
            ref,
            waitIndex: 1,
            request: { prompt: 'Continue?', answerSchema: { type: 'boolean' } },
          },
        ]),
      )
      expect(recorded.kind).toBe('staged')
    }
    await f.reopen()
    const pool = f.start()
    await pool.ready
    const recovered = await f.history()
    if (recovered.kind !== 'found') throw new Error('original missing')
    expect(recovered.history.started?.value.at).toBe(at)
    expect(recovered.history.terminal?.value.terminal).toMatchObject({
      code: 'abnormal_interruption',
    })
    expect(recovered.history.answers.size).toBe(0)
    expect(f.unused).not.toHaveBeenCalled()
    await pool.close()
  },
)

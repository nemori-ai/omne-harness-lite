import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { narrow, type Storage } from '@omne-harness-lite/storage'
import type {
  ToolObligationReader,
  ExecutionRef,
  ToolOriginalIssueSupport,
} from '@omne-harness-lite/tool-execution-runtime'
import { createToolExecutionObligations } from '../src/tool-obligations.ts'
import { borrowToolObligations } from '../src/tool-obligation-borrow.ts'
import { createToolOriginalIssue } from '../src/original-issue.ts'
import { toolOriginalIssueMigrations } from '../src/original-issue-migrations.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { at, ref, scope } from './execution-owner-fixture.ts'
import { journalIntent } from './runtime-journal-boundaries-fixture.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0)) await close()
})

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'omne-tool-obligations-'))
  const log = await openSqlLogFixture({ dir })
  cleanup.push(async () => {
    await log.close()
    await rm(dir, { recursive: true, force: true })
  })
  for (const fragment of toolOriginalIssueMigrations)
    await log.fixtureStorage.write(tx => fragment.migration.up(tx.db))
  await log.fixturePrefix(scope)
  const support: ToolOriginalIssueSupport = {
    storage: log.fixtureStorage,
    log: log.participant,
    access: log.fixtureAccess,
    current: { authorizeIn: async () => ({ kind: 'authorized' }) },
    classifyTerminalIn: async () => ({ kind: 'classified', late: false }),
    admission: {
      admitOriginal: async () => ({ kind: 'denied' }),
      consumeOriginal: async () => ({ kind: 'denied' }),
    },
  }
  async function append(callId: string) {
    const originalRef = { ...ref, callId: unwrap(parseOpaqueIdentifier(callId, 'CallId')) }
    const source = await log.participant.source(log.fixtureAccess, scope)
    if ('failure' in source) throw new Error('source unavailable')
    const intent = journalIntent()
    if (intent.kind !== 'execution_intended') throw new Error('invalid fixture intent')
    const original = createToolOriginalIssue({
      support,
      generation: 'original-owner',
      expected: { scope, tail: source.source.tail, ownerGeneration: 'fixture-backing-generation' },
      value: { ...intent, ref: originalRef, input: { submission: { adoption: 'adopted' } } },
      clock: { now: async () => unwrap(instantFromRfc3339(at)) },
      stopped: new Promise<void>(() => {}),
      isOpen: () => true,
      isRetained: () => false,
    })
    const result = await log.fixtureStorage.atomic(unit =>
      original.participant.stageOriginalIn(unit),
    )
    expect(result.kind).toBe('staged')
    return originalRef
  }
  const source = (storage: Storage = log.fixtureStorage) =>
    createToolExecutionObligations({
      storage,
      tenant: scope.tenant,
      maxPageSize: 4,
    })
  return { log, append, source }
}

const input = { tenant: scope.tenant, limit: 1 }

test('the real original index pins one snapshot while the consumer can commit later work', async () => {
  const f = await fixture()
  const first = await f.append('a')
  const second = await f.append('b')
  const used = await f.source().withObligations(input, async reader => {
    expect(await reader.next()).toEqual({ kind: 'page', refs: [first] })
    await f.append('c')
    expect(await reader.next()).toEqual({ kind: 'page', refs: [second] })
    expect(await reader.next()).toEqual({ kind: 'end' })
    return 'complete'
  })
  expect(used).toEqual({ kind: 'used', value: 'complete' })
  const later = await f.source().withObligations({ ...input, limit: 4 }, reader => reader.next())
  expect(later).toHaveProperty('value.refs.length', 3)
})

test('an empty set is read before publication and the reader expires after the callback', async () => {
  const f = await fixture()
  const read = vi.spyOn(f.log.fixtureStorage, 'read')
  let escaped: ToolObligationReader<ExecutionRef> | undefined
  expect(
    await f.source().withObligations(input, async reader => {
      escaped = reader
      expect(read).toHaveBeenCalledTimes(1)
      expect(await reader.next()).toEqual({ kind: 'end' })
      await f.append('after-empty-capture')
      expect(await reader.next()).toEqual({ kind: 'end' })
    }),
  ).toEqual({ kind: 'used', value: undefined })
  expect(await escaped?.next()).toEqual({ kind: 'unavailable' })
})

test('foreign tenants and invalid page sizes do no storage work', async () => {
  const f = await fixture()
  const read = vi.spyOn(f.log.fixtureStorage, 'read')
  const use = vi.fn(async () => 1)
  const source = f.source()
  expect(
    await source.withObligations(
      {
        ...input,
        tenant: unwrap(parseTenantId({ organization: 'foreign', account: scope.tenant.account })),
      },
      use,
    ),
  ).toEqual({ kind: 'denied' })
  for (const limit of [0, -1, 1.5, 5, NaN])
    expect(await source.withObligations({ ...input, limit }, use)).toEqual({ kind: 'unavailable' })
  expect(read).not.toHaveBeenCalled()
  expect(use).not.toHaveBeenCalled()
})

test('overlapping next calls poison the borrow even when the consumer ignores the refusal', async () => {
  const f = await fixture()
  await f.append('a')
  expect(
    await f.source().withObligations(input, async reader => {
      const pending = reader.next()
      expect(await reader.next()).toEqual({ kind: 'unavailable' })
      await pending
      return 'ignored overlap'
    }),
  ).toEqual({ kind: 'unavailable' })
})

test('a corrupt native identity is not an empty set and is not skipped', async () => {
  const f = await fixture()
  await f.append('a')
  await f.append('b')
  await f.log.fixtureStorage.write(tx =>
    narrow<{ tool_original_issue: { call: string; identity: string } }>(tx)
      .updateTable('tool_original_issue')
      .set({ identity: '{}' })
      .where('call', '=', 'b')
      .execute(),
  )
  expect(
    await f.source().withObligations(input, async reader => {
      expect(await reader.next()).toHaveProperty('kind', 'page')
      expect(await reader.next()).toEqual({ kind: 'unavailable' })
      return 'ignored bad row'
    }),
  ).toEqual({ kind: 'unavailable' })
})

test('consumer and storage release defects retain their original objects and order', async () => {
  const f = await fixture()
  const consumer = new Error('consumer defect')
  const release = new Error('release defect')
  const original = f.log.fixtureStorage.read.bind(f.log.fixtureStorage)
  const storage: Storage = {
    write: f.log.fixtureStorage.write.bind(f.log.fixtureStorage),
    async read(use) {
      await original(use)
      throw release
    },
  }
  await expect(
    f.source(storage).withObligations(input, async () => {
      throw consumer
    }),
  ).rejects.toMatchObject({ errors: [consumer, release] })
  await expect(
    f.source().withObligations(input, async () => {
      throw consumer
    }),
  ).rejects.toBe(consumer)
})

test('already consumed originals remain visible for resource and result obligations', async () => {
  const f = await fixture()
  const original = await f.append('consumed')
  await f.log.fixtureStorage.write(tx =>
    narrow<{ tool_original_issue: { consumed: number } }>(tx)
      .updateTable('tool_original_issue')
      .set({ consumed: 1 })
      .execute(),
  )
  expect(await f.source().withObligations(input, reader => reader.next())).toEqual({
    kind: 'used',
    value: { kind: 'page', refs: [original] },
  })
})

test.each(['intent', 'claim', 'consumed'])('a corrupt %s refuses publication', async field => {
  const f = await fixture()
  await f.append('invalid')
  await f.log.fixtureStorage.write(tx =>
    narrow<{ tool_original_issue: { intent: string; claim: string; consumed: number } }>(tx)
      .updateTable('tool_original_issue')
      .set(field === 'consumed' ? { consumed: 2 } : { [field]: '' })
      .execute(),
  )
  const use = vi.fn(async () => 'should not run')
  expect(await f.source().withObligations(input, use)).toEqual({ kind: 'unavailable' })
  expect(use).not.toHaveBeenCalled()
})

test('borrow completion drains an unawaited read and preserves read and release defects', async () => {
  const f = await fixture()
  const readFailure = new Error('read failure'),
    releaseFailure = new Error('release failure')
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const original = f.log.fixtureStorage.read.bind(f.log.fixtureStorage)
  const storage: Storage = {
    write: f.log.fixtureStorage.write.bind(f.log.fixtureStorage),
    async read(use) {
      await original(use)
      throw releaseFailure
    },
  }
  let completed = false
  const work = borrowToolObligations(
    storage,
    () => {
      let count = 0
      return async () => {
        if (count++ === 0) return { kind: 'page', refs: [ref] }
        entered.resolve()
        await gate.promise
        throw readFailure
      }
    },
    async reader => {
      await reader.next()
      void reader.next()
      await entered.promise
      return 'done'
    },
  )
  const observed = work
    .catch(error => error)
    .finally(() => {
      completed = true
    })
  await entered.promise
  await Promise.resolve()
  expect(completed).toBe(false)
  gate.resolve()
  expect(await observed).toMatchObject({ errors: [readFailure, releaseFailure] })
})

test('storage failure before the first read is surfaced without publishing a reader', async () => {
  const f = await fixture()
  const failure = new Error('storage unavailable')
  const use = vi.fn(async () => 1)
  const storage: Storage = {
    ...f.log.fixtureStorage,
    read: async () => {
      throw failure
    },
  }
  await expect(f.source(storage).withObligations(input, use)).rejects.toBe(failure)
  expect(use).not.toHaveBeenCalled()
})

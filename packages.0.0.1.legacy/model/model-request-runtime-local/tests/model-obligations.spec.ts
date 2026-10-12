import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { judgeModelCallCreatedPayload } from '@omne-harness-lite/messages'
import { narrow, StorageDefect, type Storage } from '@omne-harness-lite/storage'
import type {
  ModelObligationReader,
  ModelExecutionCallRef,
  SettlementLogBinding,
} from '@omne-harness-lite/model-request-runtime'
import { createModelExecutionObligations } from '../src/index.ts'
import { borrowModelObligations } from '../src/model-obligation-borrow.ts'
import {
  createModelCallContentStore,
  modelCallContentMigrations,
} from '../src/reference-content.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'omne-model-obligations-'))
  const log = await openSqlLogFixture({ dir })
  cleanup.push(async () => {
    await log.close()
    await rm(dir, { recursive: true, force: true })
  })
  for (const fragment of modelCallContentMigrations('sqlite'))
    await log.fixtureStorage.write(tx => fragment.migration.up(tx.db))
  const parsed = readJsonStrict(
    await readFile(
      new URL('../../../core/messages/tests/fixtures/reference-examples.json', import.meta.url),
      'utf8',
    ),
  )
  if (!('ok' in parsed) || !Array.isArray(parsed.ok)) throw new Error('created fixture')
  const example = parsed.ok.find(
    row =>
      row !== null &&
      typeof row === 'object' &&
      'name' in row &&
      row.name === 'created-original-input',
  )
  if (!example || typeof example !== 'object' || !('value' in example))
    throw new Error('created example')
  const judged = judgeModelCallCreatedPayload(example.value)
  if (!('ok' in judged)) throw new Error('created value')
  const created = judged.ok
  const generation = Object.freeze({})
  const binding: SettlementLogBinding = {
    ...created.origin,
    log,
    originalIssue: log.fixtureOriginalIssue,
    generation,
    currentGeneration: () => generation,
    readPrefix() {
      return log.fixturePrefix(this)
    },
  }
  const content = createModelCallContentStore({
    storage: log.fixtureStorage,
    policy: { maxConcurrentWrites: 4, maxContentBytes: 1000000 },
  })
  cleanup.push(async () => {
    expect(await content.close()).toEqual({ released: true })
  })
  async function append(call: string) {
    const callId = unwrap(parseOpaqueIdentifier(call, 'ModelCallId'))
    const written = await content.put({
      binding,
      locator: call,
      version: 'v1',
      content: {
        kind: 'created',
        value: {
          ...created,
          ref: { ...created.ref, callId },
          creationKey: unwrap(parseOpaqueIdentifier(`creation-${call}`, 'CreationKey')),
        },
      },
    })
    if (!('ref' in written)) throw new Error('real content not stored')
    expect(await written.permit.release()).toEqual({ released: true })
    return { tenant: binding.tenant, session: binding.session, callId }
  }
  const source = (storage: Storage = log.fixtureStorage) =>
    createModelExecutionObligations({ storage, tenant: binding.tenant, maxPageSize: 4 })
  return { log, binding, append, source, request: { tenant: binding.tenant, limit: 1 } }
}

test('retained unissued calls use one native snapshot while the consumer commits later work', async () => {
  const f = await fixture(),
    first = await f.append('a'),
    second = await f.append('b')
  expect(
    await f.source().withObligations(f.request, async reader => {
      expect(await reader.next()).toEqual({ kind: 'page', refs: [first] })
      await f.append('c')
      expect(await reader.next()).toEqual({ kind: 'page', refs: [second] })
      expect(await reader.next()).toEqual({ kind: 'end' })
      return 'done'
    }),
  ).toEqual({ kind: 'used', value: 'done' })
  expect(
    await f.source().withObligations({ ...f.request, limit: 4 }, reader => reader.next()),
  ).toHaveProperty('value.refs.length', 3)
})

test('empty scans read storage before publication and expire after use', async () => {
  const f = await fixture(),
    read = vi.spyOn(f.log.fixtureStorage, 'read')
  let escaped: ModelObligationReader<ModelExecutionCallRef> | undefined
  expect(
    await f.source().withObligations(f.request, async reader => {
      escaped = reader
      expect(read).toHaveBeenCalledTimes(1)
      expect(await reader.next()).toEqual({ kind: 'end' })
      await f.append('later')
      expect(await reader.next()).toEqual({ kind: 'end' })
    }),
  ).toEqual({ kind: 'used', value: undefined })
  expect(await escaped?.next()).toEqual({ kind: 'unavailable' })
})

test('foreign tenants and invalid bounds perform no storage work', async () => {
  const f = await fixture(),
    read = vi.spyOn(f.log.fixtureStorage, 'read'),
    use = vi.fn(async () => 1)
  const source = f.source()
  expect(
    await source.withObligations(
      {
        ...f.request,
        tenant: unwrap(parseTenantId({ ...f.request.tenant, organization: 'foreign' })),
      },
      use,
    ),
  ).toEqual({ kind: 'denied' })
  for (const limit of [0, -1, 1.5, 5, NaN])
    expect(await source.withObligations({ ...f.request, limit }, use)).toEqual({
      kind: 'unavailable',
    })
  expect(read).not.toHaveBeenCalled()
  expect(use).not.toHaveBeenCalled()
})

test('overlapping reads poison the borrow even if the caller ignores refusal', async () => {
  const f = await fixture()
  await f.append('a')
  expect(
    await f.source().withObligations(f.request, async reader => {
      const pending = reader.next()
      expect(await reader.next()).toEqual({ kind: 'unavailable' })
      await pending
      return 'ignored'
    }),
  ).toEqual({ kind: 'unavailable' })
})

test('corrupt native rows fail the whole scan instead of being skipped', async () => {
  const f = await fixture()
  await f.append('a')
  await f.append('b')
  await f.log.fixtureStorage.write(tx =>
    narrow<{ model_call_retention: { call: string; phase: string } }>(tx)
      .updateTable('model_call_retention')
      .set({ phase: 'broken' })
      .where('call', '=', 'b')
      .execute(),
  )
  expect(
    await f.source().withObligations(f.request, async reader => {
      expect(await reader.next()).toHaveProperty('kind', 'page')
      expect(await reader.next()).toEqual({ kind: 'unavailable' })
      return 'ignored'
    }),
  ).toEqual({ kind: 'unavailable' })
})

test('consumer and snapshot release failures preserve their original order', async () => {
  const f = await fixture(),
    consumer = new Error('consumer'),
    release = new Error('release')
  const storage: Storage = {
    write: f.log.fixtureStorage.write.bind(f.log.fixtureStorage),
    async read(use) {
      await f.log.fixtureStorage.read(use)
      throw release
    },
  }
  await expect(
    f.source(storage).withObligations(f.request, async () => {
      throw consumer
    }),
  ).rejects.toMatchObject({ errors: [consumer, release] })
})

test('a failed initial snapshot never publishes a reader', async () => {
  const f = await fixture(),
    failure = new Error('snapshot failure'),
    use = vi.fn(async () => 1)
  vi.spyOn(f.log.fixtureStorage, 'read').mockRejectedValueOnce(failure)
  await expect(f.source().withObligations(f.request, use)).rejects.toBe(failure)
  expect(use).not.toHaveBeenCalled()
})

test('the fixed account is isolated within the same organization', async () => {
  const f = await fixture()
  await f.append('owned')
  await f.log.fixtureStorage.write(tx =>
    narrow<{
      model_call_retention: {
        organization: string
        account: string
        session: string
        call: string
        phase: string
        acknowledgement: string | null
      }
    }>(tx)
      .insertInto('model_call_retention')
      .values({
        organization: f.binding.tenant.organization,
        account: 'another-account',
        session: f.binding.session,
        call: 'foreign-call',
        phase: 'retained',
        acknowledgement: null,
      })
      .execute(),
  )
  expect(
    await f.source().withObligations({ ...f.request, limit: 4 }, reader => reader.next()),
  ).toHaveProperty('value.refs.length', 1)
})

test('invalid fixed configuration fails before storage work', async () => {
  const f = await fixture(),
    read = vi.spyOn(f.log.fixtureStorage, 'read')
  for (const maxPageSize of [0, -1, 1.5, NaN])
    expect(() =>
      createModelExecutionObligations({
        storage: f.log.fixtureStorage,
        tenant: f.binding.tenant,
        maxPageSize,
      }),
    ).toThrow(TypeError)
  expect(read).not.toHaveBeenCalled()
})

test('a malformed ACK row cannot be treated as a released obligation', async () => {
  const f = await fixture()
  await f.append('a')
  await f.log.fixtureStorage.write(tx =>
    narrow<{ model_call_retention: { phase: string; acknowledgement: string } }>(tx)
      .updateTable('model_call_retention')
      .set({ phase: 'released', acknowledgement: '{}' })
      .execute(),
  )
  const use = vi.fn(async () => 1)
  expect(await f.source().withObligations(f.request, use)).toEqual({ kind: 'unavailable' })
  expect(use).not.toHaveBeenCalled()
})

test('page size is captured before the first asynchronous storage read', async () => {
  const f = await fixture()
  await f.append('a')
  await f.append('b')
  const gate = Promise.withResolvers<void>()
  const storage: Storage = {
    write: f.log.fixtureStorage.write.bind(f.log.fixtureStorage),
    async read(use) {
      await gate.promise
      return f.log.fixtureStorage.read(use)
    },
  }
  const request = { ...f.request }
  const scanning = f.source(storage).withObligations(request, reader => reader.next())
  request.limit = 4
  gate.resolve()
  expect(await scanning).toHaveProperty('value.refs.length', 1)
})

test('borrow completion waits for an unawaited page and preserves read and release failures', async () => {
  const f = await fixture(),
    ref = await f.append('a')
  const readFailure = new Error('read failure'),
    releaseFailure = new Error('release failure')
  const gate = Promise.withResolvers<void>(),
    entered = Promise.withResolvers<void>()
  const storage: Storage = {
    write: f.log.fixtureStorage.write.bind(f.log.fixtureStorage),
    async read(use) {
      await f.log.fixtureStorage.read(use)
      throw releaseFailure
    },
  }
  let completed = false
  const work = borrowModelObligations(
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

test('separate callback and release failures preserve both occurrences of the same object', async () => {
  const f = await fixture(),
    failure = new Error('shared failure object')
  const storage: Storage = {
    write: f.log.fixtureStorage.write.bind(f.log.fixtureStorage),
    async read(use) {
      await f.log.fixtureStorage.read(use)
      throw failure
    },
  }
  await expect(
    f.source(storage).withObligations(f.request, async () => {
      throw failure
    }),
  ).rejects.toMatchObject({ errors: [failure, failure] })
})

test('a missing native table is a storage defect, never an empty scan', async () => {
  const f = await fixture(),
    use = vi.fn(async () => 1)
  await f.log.fixtureStorage.write(tx => tx.db.schema.dropTable('model_call_retention').execute())
  await expect(f.source().withObligations(f.request, use)).rejects.toBeInstanceOf(StorageDefect)
  expect(use).not.toHaveBeenCalled()
})

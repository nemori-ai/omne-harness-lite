import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeModelCallCreatedPayload } from '@omne-harness-lite/messages'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import { composeMigrations, narrow, type Storage } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { publishModelCallContent } from '../src/reference-publish.ts'
import { createModelCallFacts } from '../src/reference-facts.ts'
import { OwnedReadTracker } from '../src/service-control.ts'
import type { SettlementOwner, SettlementTask } from '../src/settlement-types.ts'
import type { AppendResult } from '@omne-harness-lite/session-log-jsonl'
import {
  createModelCallContentStore,
  modelCallContentMigrations,
} from '../src/reference-content.ts'
import type { SettlementLogBinding } from '../src/settlement-types.ts'
import type { ModelCallContentValue } from '../src/reference-types.ts'

async function normative(path: string, name: string): Promise<unknown> {
  const result = readJsonStrict(
    await readFile(
      new URL(`../../../../.meta_harness/design/spec/data/${path}`, import.meta.url),
      'utf8',
    ),
  )
  if ('failed' in result || !Array.isArray(result.ok)) throw new Error('normative rows')
  const row = result.ok.find(
    item => item !== null && typeof item === 'object' && 'name' in item && item.name === name,
  )
  if (row === undefined || row === null || typeof row !== 'object' || !('value' in row))
    throw new Error('normative row')
  return row.value
}
async function created(): Promise<Extract<ModelCallContentValue, { kind: 'created' }>> {
  const result = judgeModelCallCreatedPayload(
    await normative('messages/v7/reference-examples.json', 'created-original-input'),
  )
  if ('rejected' in result) throw new Error('accepted created fixture')
  return { kind: 'created', value: result.ok }
}
function isPending(value: unknown): value is PendingModelResponse {
  return 'ok' in judgePendingModelResponse(value)
}
async function pending(): Promise<Extract<ModelCallContentValue, { kind: 'reply_ready' }>> {
  const value = await normative(
    'model-response/v10/ready-examples.json',
    'ready-complete-original-facts',
  )
  if (!isPending(value)) throw new Error('accepted pending fixture')
  return { kind: 'reply_ready', value }
}
function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>(accept => {
    resolve = accept
  })
  return { promise, resolve }
}
async function host(
  run: (h: {
    readonly binding: SettlementLogBinding
    readonly content: Awaited<ReturnType<typeof created>>
    readonly storage: Awaited<ReturnType<typeof openStorage>>
    readonly reopen: () => Promise<Awaited<ReturnType<typeof openStorage>>>
  }) => Promise<void>,
) {
  const root = fileURLToPath(
    new URL('../../../../tmp/model-request-runtime/ref-runtime/content/', import.meta.url),
  )
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, 'sqlite-'))
  const content = await created()
  const open = () =>
    openStorage({
      dialect: 'sqlite',
      file: join(dir, 'content.sqlite'),
      upgrade: false,
      migrations: composeMigrations(modelCallContentMigrations('sqlite')),
    })
  let storage = await open()
  const log = await openJsonlSessionLog({
    dir: join(dir, 'log'),
    processOwnership: {
      current: `content-test:${process.pid}`,
      observeExit: async () => 'unknown',
    },
  })
  const generation = Object.freeze({})
  const binding: SettlementLogBinding = {
    tenant: content.value.origin.tenant,
    session: content.value.origin.session,
    log,
    generation,
    currentGeneration: () => generation,
  }
  try {
    await run({
      binding,
      content,
      storage,
      reopen: async () => {
        await storage.close()
        storage = await open()
        return storage
      },
    })
  } finally {
    await storage.close()
    await log.close()
  }
}
const policy = { maxConcurrentWrites: 2, maxContentBytes: 1000000 }

function publicationOwner(): { owner: SettlementOwner; active: () => number } {
  let active = 0
  const owner: SettlementOwner = {
    name: 'created-publication-test',
    admission: () => 'open',
    opened: () => ({ confirmed: true }),
    unresolvedWrites: (): readonly SettlementTask<AppendResult>[] => [],
    acquire: () => {
      active++
      let running = 0
      return {
        registration: {
          start(_kind, operation) {
            running++
            const completion = Promise.resolve().then(() => operation(new AbortController().signal))
            const stopped = completion.then(
              () => {
                running--
              },
              () => {
                running--
              },
            )
            return { completion, stopped, requestStop() {} }
          },
          release() {
            if (running !== 0) throw new Error('released active task')
            active--
          },
        },
      }
    },
  }
  return { owner, active: () => active }
}

describe('R20-ST2 private immutable content against real SQLite and SL3', () => {
  it('publishes a confirmed created marker after content and recognizes the same original', async () => {
    await host(async h => {
      const store = createModelCallContentStore({ storage: h.storage, policy })
      const { owner, active } = publicationOwner()
      const reads = new OwnedReadTracker()
      const invoke = () =>
        publishModelCallContent({
          binding: h.binding,
          owner,
          concurrent: 2,
          reads,
          contentStore: store,
          content: h.content,
          locator: 'created',
          version: 'v1',
          at: '2026-09-20T08:00:00Z',
          retainUnknown() {
            throw new Error('known real JSONL receipt')
          },
        })
      expect(await invoke()).toEqual({ published: true })
      expect(await invoke()).toEqual({ published: true })
      const log = await h.binding.log.readSince(h.binding.session, 0)
      if ('failure' in log) throw new Error('real log unavailable')
      expect(log.entries).toHaveLength(1)
      expect(log.entries[0]?.payload).toMatchObject({ value: { kind: 'model_call_created' } })
      expect(active()).toBe(0)
      const changed = {
        kind: 'created' as const,
        value: {
          ...h.content.value,
          input: { ...h.content.value.input, sourceVersions: { changed: 'different' } },
        },
      }
      expect(
        await publishModelCallContent({
          binding: h.binding,
          owner,
          concurrent: 2,
          reads,
          contentStore: store,
          content: changed,
          locator: 'created',
          version: 'v1',
          at: '2026-09-20T08:00:00Z',
          retainUnknown() {
            throw new Error('replacement must not append')
          },
        }),
      ).toEqual({ unavailable: true })
      const after = await h.binding.log.readSince(h.binding.session, 0)
      expect('entries' in after ? after.entries : []).toHaveLength(1)
      await store.close()
      expect(await reads.close()).toEqual({ released: true })
    })
  })
  it('rebuilds cold call and creation indexes from the real marker and immutable row', async () => {
    await host(async h => {
      const owner = publicationOwner().owner
      const first = createModelCallContentStore({ storage: h.storage, policy })
      const reads = new OwnedReadTracker()
      const written = await publishModelCallContent({
        binding: h.binding,
        owner,
        concurrent: 2,
        reads,
        contentStore: first,
        content: h.content,
        locator: 'created-cold',
        version: 'v1',
        at: '2026-09-20T08:00:00Z',
        retainUnknown() {
          throw new Error('known real JSONL receipt')
        },
      })
      expect(written).toEqual({ published: true })
      await first.close()
      const reopened = createModelCallContentStore({ storage: await h.reopen(), policy })
      const facts = createModelCallFacts({
        content: reopened,
        maxScopes: 2,
        presence: {
          async read(input, observed) {
            return {
              read: await observed({
                kind: 'stopped',
                source: input.source,
                executionGeneration: null,
                sourceVersion: 'cold-log-v1',
                target: null,
                unknownBatches: [],
              }),
            }
          },
        },
      })
      const found = await facts.lookup({ binding: h.binding, ref: h.content.value.ref })
      expect(found).toMatchObject({
        view: { ref: h.content.value.ref, state: 'open', presence: { kind: 'stopped' } },
      })
      const creation = await facts.creation({
        binding: h.binding,
        creationKey: h.content.value.creationKey,
      })
      expect(creation).toMatchObject({
        payload: { creationKey: h.content.value.creationKey },
        view: { state: 'open' },
      })
      expect(await facts.close()).toEqual({ released: true })
      expect(await reads.close()).toEqual({ released: true })
    })
  })
  it('confirms exact created/complete pending bytes, rejects replacement, survives close/reopen', async () => {
    await host(async h => {
      const store = createModelCallContentStore({ storage: h.storage, policy })
      const first = await store.put({
        binding: h.binding,
        locator: 'created',
        version: 'v1',
        content: h.content,
      })
      if (!('ref' in first)) throw new Error('content not confirmed')
      expect(
        await store.put({
          binding: h.binding,
          locator: 'created',
          version: 'v1',
          content: h.content,
        }),
      ).toEqual(first)
      const changed = {
        kind: 'created' as const,
        value: {
          ...h.content.value,
          creationKey: h.content.value.creationKey,
          input: { ...h.content.value.input, sourceVersions: { changed: 'different' } },
        },
      }
      expect(
        await store.put({
          binding: h.binding,
          locator: 'created',
          version: 'v1',
          content: changed,
        }),
      ).toHaveProperty('invalidInput')
      const externalReady = await pending()
      expect(
        await store.put({
          binding: h.binding,
          locator: 'external',
          version: 'v1',
          content: externalReady,
        }),
      ).toEqual({ unavailable: true })
      // Match the current text/thinking/tool_call transport: headers are inline, no raw body locator.
      if (externalReady.value.raw === undefined) throw new Error('normative raw body')
      const { body: _externalBody, ...raw } = externalReady.value.raw
      const inline = { ...externalReady.value, raw }
      if (!isPending(inline)) throw new Error('owned inline ready must match MR10')
      const ready = { kind: 'reply_ready' as const, value: inline }
      const writtenReady = await store.put({
        binding: h.binding,
        locator: 'ready',
        version: 'v1',
        content: ready,
      })
      if (!('ref' in writtenReady)) throw new Error('pending not confirmed')
      // Content is not an execution fact: the real SessionLog remains empty.
      expect(await h.binding.log.readSince(h.binding.session, 0)).toHaveProperty('entries', [])
      expect(await store.close()).toEqual({ released: true })
      const recovered = createModelCallContentStore({ storage: await h.reopen(), policy })
      const readCreated = await recovered.read({ binding: h.binding, ref: first.ref })
      const readReady = await recovered.read({ binding: h.binding, ref: writtenReady.ref })
      expect('content' in readCreated && writeJsonLossless(readCreated.content.value)).toBe(
        writeJsonLossless(h.content.value),
      )
      expect('content' in readReady && writeJsonLossless(readReady.content.value)).toBe(
        writeJsonLossless(ready.value),
      )
      await recovered.close()
    })
  })
  it('owns the first-await input, waits actual writer stop, recognizes a lost commit receipt', async () => {
    await host(async h => {
      const entered = deferred(),
        finish = deferred()
      const storage: Storage = {
        read: async fn => await h.storage.read(fn),
        write: async fn => {
          entered.resolve()
          await finish.promise
          await h.storage.write(fn)
          throw new Error('receipt lost after real commit')
        },
      }
      const store = createModelCallContentStore({ storage, policy })
      const request = { binding: h.binding, locator: 'original', version: 'v1', content: h.content }
      const writing = store.put(request)
      await entered.promise
      request.locator = 'mutated-after-await'
      let closed = false
      const closing = store.close().then(value => {
        closed = true
        return value
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      expect(await h.binding.log.readSince(h.binding.session, 0)).toHaveProperty('entries', [])
      finish.resolve()
      const result = await writing
      if (!('ref' in result)) throw new Error('committed original must be recognized')
      expect(result.ref.locator).toBe('original')
      expect(await closing).toEqual({ released: true })
      expect(await store.read({ binding: h.binding, ref: result.ref })).toHaveProperty('content')
    })
  })
  it('detects actual bytes tampering, missing rows, wrong tenant and invalid generation', async () => {
    await host(async h => {
      const store = createModelCallContentStore({ storage: h.storage, policy })
      const written = await store.put({
        binding: h.binding,
        locator: 'tamper',
        version: 'v1',
        content: h.content,
      })
      if (!('ref' in written)) throw new Error('confirmed content')
      await h.storage.write(async tx => {
        await narrow<{ model_call_content: { bytes: Uint8Array; locator: string } }>(tx)
          .updateTable('model_call_content')
          .set({ bytes: Buffer.from('{}') })
          .where('locator', '=', 'tamper')
          .execute()
      })
      expect(await store.read({ binding: h.binding, ref: written.ref })).toHaveProperty(
        'invalidInput',
      )
      expect(
        await store.read({ binding: h.binding, ref: { ...written.ref, locator: 'missing' } }),
      ).toEqual({ unavailable: true })
      expect(
        await store.put({
          binding: { ...h.binding, currentGeneration: () => null },
          locator: 'other',
          version: 'v1',
          content: h.content,
        }),
      ).toEqual({ unavailable: true })
      await store.close()
    })
  })
})

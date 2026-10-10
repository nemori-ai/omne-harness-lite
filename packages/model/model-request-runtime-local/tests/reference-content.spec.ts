import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import {
  createModelCallSemanticDigest,
  judgeModelCallCreatedPayload,
  type ModelCallAcknowledgedRecord,
  type ModelCallPayloadRef,
} from '@omne-harness-lite/messages'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import { composeMigrations, narrow, type Storage } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { publishSessionModelCallContent } from '@omne-harness-lite/session-runtime-local'
import { createModelCallFacts } from '../src/reference-facts.ts'
import { OwnedReadTracker, withOwnedReads } from '../src/service-control.ts'
import type { SettlementOwner, SettlementTask } from '@omne-harness-lite/model-request-runtime'
import type { AppendResult } from '@omne-harness-lite/session-log'
import {
  createModelCallContentStore,
  modelCallContentMigrations,
} from '../src/reference-content.ts'
import type { SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import type { ModelCallContentValue } from '../src/reference-types.ts'

async function normative(path: string, name: string): Promise<unknown> {
  const result = readJsonStrict(
    await readFile(new URL(`../../../core/${path}`, import.meta.url), 'utf8'),
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
    await normative('messages/tests/fixtures/reference-examples.json', 'created-original-input'),
  )
  if ('rejected' in result) throw new Error('accepted created fixture')
  return { kind: 'created', value: result.ok }
}
function isPending(value: unknown): value is PendingModelResponse {
  return 'ok' in judgePendingModelResponse(value)
}
async function pending(): Promise<Extract<ModelCallContentValue, { kind: 'reply_ready' }>> {
  const value = await normative(
    'model-response/tests/fixtures/ready-examples.json',
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
  const log = await openSqlLogFixture({ dir: join(dir, 'log') })
  const generation = Object.freeze({})
  const binding: SettlementLogBinding = {
    tenant: content.value.origin.tenant,
    session: content.value.origin.session,
    log,
    readPrefix(this: import('@omne-harness-lite/model-request-runtime').SettlementLogBinding) {
      return log.fixturePrefix({ session: this.session, tenant: this.tenant }, this.log)
    },
    originalIssue: log.fixtureOriginalIssue,
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
        publishSessionModelCallContent({
          binding: h.binding,
          owner,
          concurrent: 2,
          read: work => withOwnedReads(owner, 2, reads, work),
          contentStore: store,
          content: h.content,
          locator: 'created',
          version: 'v1',
          at: '2026-09-20T08:00:00Z',
          retainUnknown() {
            throw new Error('known real SQL journal receipt')
          },
        })
      expect(await invoke()).toEqual({ published: true })
      expect(await invoke()).toEqual({ published: true })
      const log = await h.binding.log.readSince(h.binding.session, 0)
      if ('failure' in log) throw new Error('real log unavailable')
      expect(log.entries).toHaveLength(1)
      expect(log.entries[0]?.payload).toMatchObject({
        kind: 'fact',
        owner: 'model-request-runtime',
        version: 'mrr/3',
        value: { category: 'record', value: { kind: 'model_call_created' } },
      })
      expect(active()).toBe(0)
      const changed = {
        kind: 'created' as const,
        value: {
          ...h.content.value,
          input: { ...h.content.value.input, sourceVersions: { changed: 'different' } },
        },
      }
      expect(
        await publishSessionModelCallContent({
          binding: h.binding,
          owner,
          concurrent: 2,
          read: work => withOwnedReads(owner, 2, reads, work),
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
  it('RT12 S-98 (review S3): a refused marker is admitted before put and leaves no content row', async () => {
    await host(async h => {
      const store = createModelCallContentStore({ storage: h.storage, policy })
      const { owner, active } = publicationOwner()
      const reads = new OwnedReadTracker()
      const publish = (content: ModelCallContentValue, locator: string) =>
        publishSessionModelCallContent({
          binding: h.binding,
          owner,
          concurrent: 2,
          read: work => withOwnedReads(owner, 2, reads, work),
          contentStore: store,
          content,
          locator,
          version: 'v1',
          at: '2026-09-20T08:00:00Z',
          retainUnknown() {
            throw new Error('a refused marker must not append')
          },
        })
      const rows = async (call: string) =>
        await h.storage.read(async tx => {
          const found = await narrow<{ model_call_content: { call: string } }>(tx)
            .selectFrom('model_call_content')
            .select('call')
            .where('call', '=', call)
            .execute()
          return found.length
        })
      expect(await publish(h.content, 'created-s3')).toEqual({ published: true })
      // Another call under the same creation key is refused from the prefix before any put.
      const other = {
        kind: 'created' as const,
        value: { ...h.content.value, ref: { ...h.content.value.ref, callId: 'call-s3-other' } },
      }
      expect(await publish(other, 'created-s3-other')).toEqual({ unavailable: true })
      expect(await rows('call-s3-other')).toBe(0)
      const log = await h.binding.log.readSince(h.binding.session, 0)
      expect('entries' in log ? log.entries : []).toHaveLength(1)
      expect(active()).toBe(0)
      await store.close()
      expect(await reads.close()).toEqual({ released: true })
    })
  })
  it('rebuilds cold call and creation indexes from the real marker and immutable row', async () => {
    await host(async h => {
      const owner = publicationOwner().owner
      const first = createModelCallContentStore({ storage: h.storage, policy })
      const reads = new OwnedReadTracker()
      const written = await publishSessionModelCallContent({
        binding: h.binding,
        owner,
        concurrent: 2,
        read: work => withOwnedReads(owner, 2, reads, work),
        contentStore: first,
        content: h.content,
        locator: 'created-cold',
        version: 'v1',
        at: '2026-09-20T08:00:00Z',
        retainUnknown() {
          throw new Error('known real SQL journal receipt')
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
      const again = await store.put({
        binding: h.binding,
        locator: 'created',
        version: 'v1',
        content: h.content,
      })
      expect('ref' in again && again.ref).toEqual(first.ref)
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
      const readCreated = await recovered.read({
        binding: h.binding,
        call: h.content.value.ref.callId,
        ref: first.ref,
      })
      const readReady = await recovered.read({
        binding: h.binding,
        call: ready.value.call.callId,
        ref: writtenReady.ref,
      })
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
      expect(
        await store.read({ binding: h.binding, call: h.content.value.ref.callId, ref: result.ref }),
      ).toHaveProperty('content')
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
      const call = h.content.value.ref.callId
      expect(await store.read({ binding: h.binding, call, ref: written.ref })).toHaveProperty(
        'invalidInput',
      )
      expect(
        await store.read({ binding: h.binding, call, ref: { ...written.ref, locator: 'missing' } }),
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

/** A different CallKey of the same session, for isolation checks. */
function otherCall(
  content: Extract<ModelCallContentValue, { kind: 'created' }>,
): Extract<ModelCallContentValue, { kind: 'created' }> {
  const judged = judgeModelCallCreatedPayload({
    ...content.value,
    ref: { ...content.value.ref, callId: 'call_retention_other' },
    creationKey: 'create_retention_other',
  })
  if ('rejected' in judged) throw new Error('other call fixture')
  return { kind: 'created', value: judged.ok }
}
/** An MS8 S-58 ACK batch built from the exact content read under the retention lock. */
function endedAcknowledgement(
  contents: readonly ModelCallContentValue[],
  payload: ModelCallPayloadRef,
): { readonly record: ModelCallAcknowledgedRecord } {
  const original = contents[0]
  if (original?.kind !== 'created') throw new Error('created content under the lock')
  const digest = createModelCallSemanticDigest(
    'model-call-creation-semantic-sha256/v1',
    original.value.input,
  )
  if (!('ok' in digest) || digest.ok.role !== 'model-call-creation-semantic-sha256/v1')
    throw new Error('creation digest')
  return {
    record: {
      kind: 'model_call_acknowledged',
      call: original.value.ref.callId,
      creationKey: original.value.creationKey,
      creationInput: { role: digest.ok.role, hex: digest.ok.hex },
      acknowledgedAt: '2026-09-30T00:00:00Z',
      releasablePayloads: [payload],
      target: { kind: 'ended', ending: 'released' },
      terminalState: 'handed_up',
    },
  }
}
async function rowCount(storage: Storage, table: string, call: string): Promise<number> {
  return await storage.read(async tx => {
    const rows = await narrow<Record<string, { call: string }>>(tx)
      .selectFrom(table)
      .select('call')
      .where('call', '=', call)
      .execute()
    return rows.length
  })
}

describe('RT12 S-98 retention gate on real SQLite', () => {
  it('holds cleanup behind a publish permit, then deletes exactly this call in one commit', async () => {
    await host(async h => {
      const store = createModelCallContentStore({ storage: h.storage, policy })
      const call = h.content.value.ref.callId
      const other = otherCall(h.content)
      const written = await store.put({
        binding: h.binding,
        locator: 'retained',
        version: 'v1',
        content: h.content,
      })
      const neighbour = await store.put({
        binding: h.binding,
        locator: 'neighbour',
        version: 'v1',
        content: other,
      })
      if (!('ref' in written) || !('ref' in neighbour)) throw new Error('confirmed content')
      expect(await store.retention({ binding: h.binding, call })).toEqual({
        phase: 'retained',
        publishers: 1,
      })
      let builds = 0
      const prepared = await store.prepareAcknowledgement({
        binding: h.binding,
        call,
        payloads: [written.ref],
        build: contents => {
          builds++
          return endedAcknowledgement(contents, written.ref)
        },
      })
      if (!('record' in prepared)) throw new Error('prepared ACK batch')
      expect(prepared.phase).toBe('retiring')
      // Retiring closes new reads and publications of this call only.
      expect(await store.read({ binding: h.binding, call, ref: written.ref })).toEqual({
        unavailable: true,
      })
      expect(
        await store.put({ binding: h.binding, locator: 'late', version: 'v1', content: h.content }),
      ).toEqual({ unavailable: true })
      expect(
        await store.read({
          binding: h.binding,
          call: other.value.ref.callId,
          ref: neighbour.ref,
        }),
      ).toHaveProperty('content')
      // The fixed batch is returned, never rebuilt.
      const again = await store.prepareAcknowledgement({
        binding: h.binding,
        call,
        payloads: [written.ref],
        build: () => {
          throw new Error('a fixed batch is never rebuilt')
        },
      })
      expect(again).toEqual(prepared)
      expect(builds).toBe(1)
      expect(
        await store.confirmAcknowledgement({ binding: h.binding, call, record: prepared.record }),
      ).toEqual({ phase: 'acknowledged' })
      // The original writer still holds its permit: no deletion yet.
      expect(await store.releaseAcknowledged({ binding: h.binding, call })).toEqual({
        cleanup: 'pending',
        pendingReasons: ['writer_in_flight'],
      })
      expect(await rowCount(h.storage, 'model_call_content', call)).toBe(1)
      expect(await written.permit.release()).toEqual({ released: true })
      expect(await store.releaseAcknowledged({ binding: h.binding, call })).toEqual({
        cleanup: 'released',
      })
      expect(await rowCount(h.storage, 'model_call_content', call)).toBe(0)
      expect(await store.retention({ binding: h.binding, call })).toEqual({
        phase: 'released',
        publishers: 0,
      })
      // Released never retreats; a repeat recognizes it.
      expect(await store.releaseAcknowledged({ binding: h.binding, call })).toEqual({
        cleanup: 'released',
      })
      expect(
        await store.confirmAcknowledgement({ binding: h.binding, call, record: prepared.record }),
      ).toEqual({ phase: 'released' })
      // The neighbour call keeps its content, permit and retained phase.
      expect(await rowCount(h.storage, 'model_call_content', other.value.ref.callId)).toBe(1)
      expect(await store.retention({ binding: h.binding, call: other.value.ref.callId })).toEqual({
        phase: 'retained',
        publishers: 1,
      })
      expect(await neighbour.permit.release()).toEqual({ released: true })
      await store.close()
    })
  })
  it('keeps the fixed batch across reopen and refuses a differing confirmation', async () => {
    await host(async h => {
      const call = h.content.value.ref.callId
      const first = createModelCallContentStore({ storage: h.storage, policy })
      const written = await first.put({
        binding: h.binding,
        locator: 'reopen',
        version: 'v1',
        content: h.content,
      })
      if (!('ref' in written)) throw new Error('confirmed content')
      await written.permit.release()
      const prepared = await first.prepareAcknowledgement({
        binding: h.binding,
        call,
        payloads: [written.ref],
        build: contents => endedAcknowledgement(contents, written.ref),
      })
      if (!('record' in prepared)) throw new Error('prepared ACK batch')
      await first.close()
      const storage = await h.reopen()
      const reopened = createModelCallContentStore({ storage, policy })
      expect(
        await reopened.prepareAcknowledgement({
          binding: h.binding,
          call,
          payloads: [written.ref],
          build: () => {
            throw new Error('a fixed batch is never rebuilt')
          },
        }),
      ).toEqual(prepared)
      expect(
        await reopened.confirmAcknowledgement({
          binding: h.binding,
          call,
          record: { ...prepared.record, acknowledgedAt: '2026-09-30T00:00:09Z' },
        }),
      ).toEqual({ unavailable: true })
      // Not yet confirmed: cleanup cannot start.
      expect(await reopened.releaseAcknowledged({ binding: h.binding, call })).toEqual({
        cleanup: 'pending',
        pendingReasons: ['storage_unavailable'],
      })
      expect(await rowCount(storage, 'model_call_content', call)).toBe(1)
      await reopened.close()
    })
  })
  it('recognizes a lost deletion receipt from the same row and reports real storage failure', async () => {
    await host(async h => {
      const call = h.content.value.ref.callId
      const direct = createModelCallContentStore({ storage: h.storage, policy })
      const written = await direct.put({
        binding: h.binding,
        locator: 'receipt',
        version: 'v1',
        content: h.content,
      })
      if (!('ref' in written)) throw new Error('confirmed content')
      await written.permit.release()
      const prepared = await direct.prepareAcknowledgement({
        binding: h.binding,
        call,
        payloads: [written.ref],
        build: contents => endedAcknowledgement(contents, written.ref),
      })
      if (!('record' in prepared)) throw new Error('prepared ACK batch')
      await direct.confirmAcknowledgement({ binding: h.binding, call, record: prepared.record })
      let mode: 'fail' | 'fail-and-blind' | 'lose-receipt' = 'fail'
      const storage: Storage = {
        read: async fn => {
          if (mode === 'fail-and-blind') throw new Error('storage unreadable')
          return await h.storage.read(fn)
        },
        write: async fn => {
          if (mode !== 'lose-receipt') throw new Error('storage unavailable before commit')
          await h.storage.write(fn)
          throw new Error('receipt lost after real commit')
        },
      }
      const store = createModelCallContentStore({ storage, policy })
      expect(await store.releaseAcknowledged({ binding: h.binding, call })).toEqual({
        cleanup: 'pending',
        pendingReasons: ['storage_unavailable'],
      })
      mode = 'fail-and-blind'
      expect(await store.releaseAcknowledged({ binding: h.binding, call })).toEqual({
        cleanup: 'pending',
        pendingReasons: ['receipt_unknown'],
      })
      expect(await rowCount(h.storage, 'model_call_content', call)).toBe(1)
      mode = 'lose-receipt'
      expect(await store.releaseAcknowledged({ binding: h.binding, call })).toEqual({
        cleanup: 'released',
      })
      expect(await rowCount(h.storage, 'model_call_content', call)).toBe(0)
      await store.close()
      await direct.close()
    })
  })
})

it('malformed created content is rejected before any publisher can be retained', async () => {
  await host(async h => {
    const store = createModelCallContentStore({ storage: h.storage, policy })
    expect(
      await store.put({
        binding: h.binding,
        locator: 'invalid-created',
        version: '1',
        content: { kind: 'created', value: {} } as unknown as ModelCallContentValue,
      }),
    ).toHaveProperty('invalidInput')
    expect(await store.retention({ binding: h.binding, call: h.content.value.ref.callId })).toEqual(
      { phase: null, publishers: 0 },
    )
    await store.close()
  })
})
it('refuses content belonging to another session before publication', async () => {
  await host(async h => {
    const store = createModelCallContentStore({ storage: h.storage, policy })
    try {
      expect(
        await store.put({
          binding: {
            ...h.binding,
            session: unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')),
          },
          locator: 'other-session-content',
          version: '1',
          content: h.content,
        }),
      ).toHaveProperty('invalidInput')
      expect(
        await store.retention({ binding: h.binding, call: h.content.value.ref.callId }),
      ).toEqual({ phase: null, publishers: 0 })
    } finally {
      await store.close()
    }
  })
})
for (const allowance of [-1, 0, 1] as const)
  it(`enforces the serialized byte limit with allowance ${allowance}`, async () => {
    await host(async h => {
      const byteLength = new TextEncoder().encode(writeJsonLossless(h.content.value)).byteLength
      const store = createModelCallContentStore({
        storage: h.storage,
        policy: { ...policy, maxContentBytes: byteLength + allowance },
      })
      try {
        const result = await store.put({
          binding: h.binding,
          locator: 'byte-limit',
          version: '1',
          content: h.content,
        })
        if (allowance < 0) {
          expect(result).toEqual({ unavailable: true })
          expect(
            await store.retention({ binding: h.binding, call: h.content.value.ref.callId }),
          ).toEqual({ phase: null, publishers: 0 })
        } else {
          expect(result).toHaveProperty('ref')
          if (!('ref' in result)) throw new Error('Exact byte boundary refused')
          await result.permit.release()
          expect(
            await store.read({
              binding: h.binding,
              call: h.content.value.ref.callId,
              ref: result.ref,
            }),
          ).toHaveProperty('content')
        }
      } finally {
        await store.close()
      }
    })
  })
describe('external content custody before publication', () => {
  for (const mode of ['unavailable', 'throw', 'syncThrow', 'falseRetention'] as const)
    it(`refuses external content when custody returns ${mode}`, async () => {
      await host(async h => {
        const store = createModelCallContentStore({
          storage: h.storage,
          policy,
          externalContent: {
            confirm() {
              if (mode === 'syncThrow') throw new Error('custody invocation failed')
              return Promise.resolve().then(() => {
                if (mode === 'throw') throw new Error('custody IO failed')
                if (mode === 'falseRetention')
                  return { retained: false } as unknown as { retained: true }
                return { unavailable: true as const }
              })
            },
          },
        })
        expect(
          await store.put({
            binding: h.binding,
            locator: 'external-failed',
            version: '1',
            content: await pending(),
          }),
        ).toEqual({ unavailable: true })
        expect(
          await store.retention({ binding: h.binding, call: h.content.value.ref.callId }),
        ).toEqual({ phase: null, publishers: 0 })
        await store.close()
      })
    })
  it('keeps exact original locators under confirmed durable custody across reopen', async () => {
    await host(async h => {
      const original = await pending()
      const seen: ModelCallContentValue[] = []
      const store = createModelCallContentStore({
        storage: h.storage,
        policy,
        externalContent: {
          async confirm(request) {
            expect(request.binding.tenant).toEqual(h.binding.tenant)
            expect(request.binding.session).toBe(h.binding.session)
            seen.push(request.content)
            return { retained: true }
          },
        },
      })
      const written = await store.put({
        binding: h.binding,
        locator: 'external-held',
        version: '1',
        content: original,
      })
      expect(seen).toHaveLength(1)
      if (!('ref' in written)) throw new Error('Confirmed custody publication refused')
      await written.permit.release()
      await store.close()
      const recovered = createModelCallContentStore({ storage: await h.reopen(), policy })
      const read = await recovered.read({
        binding: h.binding,
        call: original.value.call.callId,
        ref: written.ref,
      })
      expect('content' in read && writeJsonLossless(read.content.value)).toBe(
        writeJsonLossless(original.value),
      )
      await recovered.close()
    })
  })
  it('close drains actual custody IO and an expired generation cannot publish afterwards', async () => {
    await host(async h => {
      const entered = deferred(),
        stopped = deferred()
      let current = true
      const binding = {
        ...h.binding,
        currentGeneration: () => (current ? h.binding.generation : {}),
      }
      const store = createModelCallContentStore({
        storage: h.storage,
        policy,
        externalContent: {
          async confirm() {
            entered.resolve()
            await stopped.promise
            return { retained: true }
          },
        },
      })
      const publication = store.put({
        binding,
        locator: 'external-wait',
        version: '1',
        content: await pending(),
      })
      await entered.promise
      let closed = false
      const closing = store.close().then(() => {
        closed = true
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      current = false
      stopped.resolve()
      expect(await publication).toEqual({ unavailable: true })
      await closing
      expect(closed).toBe(true)
    })
  })
})

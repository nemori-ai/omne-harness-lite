import { createHash } from 'node:crypto'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { readJsonStrict, copyJsonValue, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  judgeModelCallCreatedPayload,
  createModelCallSemanticDigest,
  judgeModelInvocationRecord,
  type ModelCallAcknowledgedRecord,
  type ModelCallPayloadRef,
} from '@omne-harness-lite/messages'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import {
  composeMigrations,
  StorageUnavailable,
  type Storage,
  type ReadTx,
  type WriteTx,
} from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { type SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import {
  createModelCallContentStore,
  modelCallContentMigrations,
  type ModelCallContentValue,
  type ModelCallAcknowledgementBuilder,
  type ModelCallContentStore,
  type ModelCallPublishPermit,
} from '@omne-harness-lite/model-request-runtime-local'
import { openSqlLogFixture } from './sql-log-fixture.ts'

type Created = Extract<ModelCallContentValue, { readonly kind: 'created' }>
type Ready = Extract<ModelCallContentValue, { readonly kind: 'reply_ready' }>

function deferred<T>() {
  let accept: ((value: T) => void) | undefined
  const promise = new Promise<T>(resolve => {
    accept = resolve
  })
  return {
    promise,
    resolve(value: T) {
      if (accept === undefined) throw new Error('native Promise executor missing')
      accept(value)
    },
  }
}

async function normative(path: string, name: string): Promise<unknown> {
  const decoded = readJsonStrict(await readFile(new URL(path, import.meta.url), 'utf8'))
  if ('failed' in decoded || !Array.isArray(decoded.ok)) throw new Error('normative array')
  for (const item of decoded.ok) {
    if (
      item !== null &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      'name' in item &&
      item.name === name &&
      'value' in item
    )
      return item.value
  }
  throw new Error('normative named value missing')
}
async function created(name: string): Promise<Created> {
  const judged = judgeModelCallCreatedPayload(
    await normative('../../../core/messages/tests/fixtures/reference-examples.json', name),
  )
  if ('rejected' in judged) throw new Error('declared created input malformed')
  return { kind: 'created', value: judged.ok }
}
function isPending(value: unknown): value is PendingModelResponse {
  return 'ok' in judgePendingModelResponse(value)
}
async function ready(): Promise<Ready> {
  const source = await normative(
    '../../../core/model-response/tests/fixtures/ready-examples.json',
    'ready-complete-original-facts',
  )
  if (source === null || typeof source !== 'object' || Array.isArray(source) || !('raw' in source))
    throw new Error('declared Pending object missing')
  const { raw: omittedRaw, ...withoutRaw } = source
  const owned = copyJsonValue(withoutRaw)
  if ('failed' in owned || !isPending(owned.ok)) throw new Error('declared Pending malformed')
  void omittedRaw
  return { kind: 'reply_ready', value: owned.ok }
}
function expectedRef(content: ModelCallContentValue, locator: string): ModelCallPayloadRef {
  return {
    kind: content.kind,
    locator,
    version: 'v1',
    digest: createHash('sha256').update(writeJsonLossless(content.value), 'utf8').digest('hex'),
  }
}
function creationDigest(c: Created): ModelCallAcknowledgedRecord['creationInput'] {
  const result = createModelCallSemanticDigest(
    'model-call-creation-semantic-sha256/v1',
    c.value.input,
  )
  if ('rejected' in result || result.ok.role !== 'model-call-creation-semantic-sha256/v1')
    throw new Error('declared creation digest')
  return { role: 'model-call-creation-semantic-sha256/v1', hex: result.ok.hex }
}
function endedRecord(c: Created, ref: ModelCallPayloadRef): ModelCallAcknowledgedRecord {
  return {
    kind: 'model_call_acknowledged',
    call: c.value.ref.callId,
    creationKey: c.value.creationKey,
    creationInput: creationDigest(c),
    acknowledgedAt: '2026-10-10T00:00:00Z',
    releasablePayloads: [ref],
    target: { kind: 'ended', ending: 'undispatched' },
    terminalState: 'handed_up',
  }
}
function readyRecord(
  c: Created,
  p: Ready,
  cr: ModelCallPayloadRef,
  pr: ModelCallPayloadRef,
): ModelCallAcknowledgedRecord {
  const pending = p.value
  if (pending.outcome !== 'complete' || pending.timing.sentAt === null || pr.kind !== 'reply_ready')
    throw new Error('declared complete Pending')
  const result = createModelCallSemanticDigest(
    'model-call-retained-result-semantic-sha256/v1',
    pending,
  )
  if ('rejected' in result || result.ok.role !== 'model-call-retained-result-semantic-sha256/v1')
    throw new Error('declared retained result digest')
  return {
    kind: 'model_call_acknowledged',
    call: c.value.ref.callId,
    creationKey: c.value.creationKey,
    creationInput: creationDigest(c),
    acknowledgedAt: '2026-10-10T00:00:00Z',
    releasablePayloads: [cr, pr],
    target: { kind: 'response', response: pending.id },
    terminalState: 'complete',
    retainedResultDigest: {
      role: 'model-call-retained-result-semantic-sha256/v1',
      hex: result.ok.hex,
    },
    accountingWitness: {
      response: pending.id,
      dispatch: 1,
      readyPosition: 3,
      payload: { kind: 'reply_ready', locator: pr.locator, version: pr.version, digest: pr.digest },
      origin: c.value.origin,
      outcome: 'complete',
      usage: pending.usage,
      cost: pending.cost,
      credentialScope: pending.route.credentialScope,
      provider: 'anthropic',
      upstreamRequestId: 'gen-1758621600-a1b2c3',
      timing: {
        sentAt: '2026-09-23T10:00:00Z',
        firstTokenAt: '2026-09-23T10:00:01.2Z',
        endedAt: '2026-09-23T10:00:04Z',
      },
    },
  }
}
function checkedRecord(record: ModelCallAcknowledgedRecord): ModelCallAcknowledgedRecord {
  const judged = judgeModelInvocationRecord(record)
  if ('rejected' in judged || judged.ok.kind !== 'model_call_acknowledged')
    throw new Error('declared ACK malformed')
  return judged.ok
}
function fixedBuilder(
  contents: readonly ModelCallContentValue[],
  record: ModelCallAcknowledgedRecord,
  called: () => void,
): ModelCallAcknowledgementBuilder {
  return actual => {
    called()
    expect(actual).toStrictEqual(contents)
    return { record }
  }
}

function storageGate(real: Storage) {
  let mode: 'pass' | 'fail-read' | 'fail-write' | 'hold-write' = 'pass'
  let reads = 0,
    writes = 0
  const trace: string[] = []
  const entered = deferred<void>(),
    finish = deferred<void>()
  const port: Storage = {
    async read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
      const selected = mode
      reads++
      trace.push('read:enter')
      try {
        if (selected === 'fail-read') {
          trace.push('read:StorageUnavailable')
          throw new StorageUnavailable('c4d read unavailable')
        }
        const value = await real.read(fn)
        trace.push('read:return')
        return value
      } finally {
        reads--
        trace.push('read:finally')
      }
    },
    async write<T>(fn: (tx: WriteTx) => Promise<T>): Promise<T> {
      const selected = mode
      writes++
      trace.push('write:enter')
      try {
        if (selected === 'fail-write') {
          trace.push('write:StorageUnavailable')
          throw new StorageUnavailable('c4d write unavailable')
        }
        if (selected === 'hold-write') {
          trace.push('hold:entered')
          entered.resolve(undefined)
          await finish.promise
          trace.push('hold:released')
        }
        const value = await real.write(fn)
        trace.push('write:return')
        return value
      } finally {
        writes--
        trace.push('write:finally')
      }
    },
  }
  return {
    port,
    trace,
    entered,
    finish,
    set(next: typeof mode) {
      mode = next
    },
    clearTrace() {
      trace.length = 0
    },
    active() {
      return { reads, writes }
    },
  }
}

type Gate = ReturnType<typeof storageGate>
interface Host {
  readonly binding: SettlementLogBinding
  readonly gate: Gate
  readonly permits: ModelCallPublishPermit[]
  readonly makeStore: () => ModelCallContentStore
  readonly track: <T>(operation: Promise<T>) => Promise<T>
}

async function withHost(c: Created, run: (host: Host) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'c4d-content-'))
  const physical: (() => Promise<void>)[] = []
  const stores: ModelCallContentStore[] = []
  const permits: ModelCallPublishPermit[] = []
  const operations: Promise<PromiseSettledResult<unknown>[]>[] = []
  const errors: unknown[] = []
  let gate: Gate | undefined
  const collect = async (tasks: readonly Promise<unknown>[]) => {
    const results = await Promise.allSettled(tasks)
    for (const result of results) if (result.status === 'rejected') errors.push(result.reason)
    return results.every(result => result.status === 'fulfilled')
  }
  try {
    const real = await openStorage({
      dialect: 'sqlite',
      file: join(dir, 'content.sqlite'),
      upgrade: false,
      migrations: composeMigrations(modelCallContentMigrations('sqlite')),
    })
    physical.push(() => real.close())
    const log = await openSqlLogFixture({ dir: join(dir, 'log') })
    physical.push(() => log.close())
    const storage = storageGate(real)
    gate = storage
    const generation = Object.freeze({})
    const binding: SettlementLogBinding = {
      tenant: c.value.origin.tenant,
      session: c.value.ref.session,
      log,
      generation,
      currentGeneration: () => generation,
      readPrefix: () => log.fixturePrefix(c.value.origin),
    }
    await run({
      binding,
      gate: storage,
      permits,
      track<T>(operation: Promise<T>): Promise<T> {
        operations.push(Promise.allSettled([operation]))
        return operation
      },
      makeStore() {
        const store = createModelCallContentStore({
          storage: storage.port,
          policy: { maxConcurrentWrites: 2, maxContentBytes: 1000000 },
        })
        stores.push(store)
        return store
      },
    })
  } catch (error) {
    errors.push(error)
  } finally {
    gate?.set('pass')
    gate?.finish.resolve(undefined)
    const settled = await Promise.allSettled(operations)
    for (const operation of settled) {
      if (operation.status === 'rejected') errors.push(operation.reason)
      else
        for (const result of operation.value)
          if (result.status === 'rejected' && !errors.includes(result.reason))
            errors.push(result.reason)
    }
    await collect(
      permits.map(async permit => {
        expect(await permit.release()).toStrictEqual({ released: true })
      }),
    )
    await collect(
      stores.map(async store => {
        expect(await store.close()).toStrictEqual({ released: true })
      }),
    )
    try {
      if (gate !== undefined) expect(gate.active()).toStrictEqual({ reads: 0, writes: 0 })
    } catch (error) {
      errors.push(error)
    }
    const physicallyClosed = await collect(physical.map(async close => close()))
    if (physicallyClosed) await collect([rm(dir, { recursive: true, force: true })])
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, 'content case or cleanup failed')
}

async function put(
  host: Host,
  store: ModelCallContentStore,
  content: ModelCallContentValue,
  ref: ModelCallPayloadRef,
): Promise<ModelCallPublishPermit> {
  const result = await host.track(
    store.put({
      binding: host.binding,
      locator: ref.locator,
      version: ref.version,
      content,
    }),
  )
  if (!('permit' in result)) throw new Error('declared content was not stored')
  host.permits.push(result.permit)
  expect(result).toStrictEqual({ ref, permit: result.permit })
  expect(typeof result.permit.release).toBe('function')
  return result.permit
}

function absentEndedFields(record: ModelCallAcknowledgedRecord) {
  expect(Object.hasOwn(record, 'retainedResultDigest')).toBe(false)
  expect(Object.hasOwn(record, 'accountingWitness')).toBe(false)
}

function expectPrepared(
  result: Awaited<ReturnType<ModelCallContentStore['prepareAcknowledgement']>>,
  record: ModelCallAcknowledgedRecord,
) {
  expect(result).toStrictEqual({ record, phase: 'retiring' })
  if (!('record' in result)) throw new Error('prepared record missing')
  absentEndedFields(result.record)
}

describe('reference content boundaries through public stores', () => {
  it('R0 retains the complete original and releases its actual publish permit', async () => {
    const c = await created('created-original-input')
    const ref = expectedRef(c, 'c4d-created')
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      const permit = await put(host, store, c, ref)
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retained',
        publishers: 1,
      })
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ content: c })
      expect(await host.track(permit.release())).toStrictEqual({ released: true })
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retained',
        publishers: 0,
      })
      expect(host.gate.trace).toStrictEqual([
        'write:enter',
        'write:return',
        'write:finally',
        'read:enter',
        'read:return',
        'read:finally',
        'read:enter',
        'read:return',
        'read:finally',
        'write:enter',
        'write:return',
        'write:finally',
        'read:enter',
        'read:return',
        'read:finally',
      ])
    })
  })

  it('R1 rejects a malformed digest before any transaction', async () => {
    const c = await created('created-original-input')
    const ref = expectedRef(c, 'c4d-created')
    const badRef = { ...ref, digest: 'not-sha256' } satisfies ModelCallPayloadRef
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      await put(host, store, c, ref)
      host.gate.clearTrace()
      expect(await host.track(store.read({ ...key, ref: badRef }))).toStrictEqual({
        invalidInput: { reason: 'malformed' },
      })
      expect(host.gate.trace).toStrictEqual([])
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ content: c })
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retained',
        publishers: 1,
      })
    })
  })

  it('R2 reports unavailable for a native storage read failure and preserves the original', async () => {
    const c = await created('created-original-input')
    const ref = expectedRef(c, 'c4d-created')
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      await put(host, store, c, ref)
      host.gate.clearTrace()
      host.gate.set('fail-read')
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ unavailable: true })
      expect(host.gate.trace).toStrictEqual([
        'read:enter',
        'read:StorageUnavailable',
        'read:finally',
      ])
      expect(host.gate.active()).toStrictEqual({ reads: 0, writes: 0 })
      host.gate.set('pass')
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ content: c })
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retained',
        publishers: 1,
      })
    })
  })

  it('R3 isolates physical tenant partitions for the same reference', async () => {
    const c = await created('created-original-input')
    const ref = expectedRef(c, 'c4d-created')
    const tenant = unwrap(parseTenantId({ organization: 'org_7fd2c2', account: 'acc_91ab41' }))
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      const otherKey = { ...key, binding: { ...host.binding, tenant } }
      await put(host, store, c, ref)
      host.gate.clearTrace()
      expect(await host.track(store.read({ ...otherKey, ref }))).toStrictEqual({
        unavailable: true,
      })
      expect(await host.track(store.retention(otherKey))).toStrictEqual({
        phase: null,
        publishers: 0,
      })
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ content: c })
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retained',
        publishers: 1,
      })
      expect(host.gate.trace).toStrictEqual(
        Array.from({ length: 4 }, () => ['read:enter', 'read:return', 'read:finally']).flat(),
      )
    })
  })

  it('P1 rejects malformed payloads without a transaction or builder call', async () => {
    const c = await created('rejected-has-no-fake-binding')
    const ref = expectedRef(c, 'c4d-created')
    const badRef = { ...ref, digest: 'not-sha256' } satisfies ModelCallPayloadRef
    const record = checkedRecord(endedRecord(c, ref))
    absentEndedFields(record)
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      await put(host, store, c, ref)
      let buildCalls = 0
      host.gate.clearTrace()
      expect(
        await host.track(
          store.prepareAcknowledgement({
            ...key,
            payloads: [badRef],
            build: fixedBuilder([c], record, () => {
              buildCalls++
            }),
          }),
        ),
      ).toStrictEqual({ invalidInput: { reason: 'malformed' } })
      expect(buildCalls).toBe(0)
      expect(host.gate.trace).toStrictEqual([])
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ content: c })
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retained',
        publishers: 1,
      })
    })
  })

  it('P2 leaves preparation unfixed after a native write failure and permits a full retry', async () => {
    const c = await created('rejected-has-no-fake-binding')
    const ref = expectedRef(c, 'c4d-created')
    const record = checkedRecord(endedRecord(c, ref))
    absentEndedFields(record)
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      await put(host, store, c, ref)
      let buildCalls = 0
      const request = {
        ...key,
        payloads: [ref],
        build: fixedBuilder([c], record, () => {
          buildCalls++
        }),
      }
      host.gate.clearTrace()
      host.gate.set('fail-write')
      expect(await host.track(store.prepareAcknowledgement(request))).toStrictEqual({
        unavailable: true,
      })
      expect(buildCalls).toBe(0)
      expect(host.gate.trace).toStrictEqual([
        'write:enter',
        'write:StorageUnavailable',
        'write:finally',
      ])
      host.gate.set('pass')
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ content: c })
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retained',
        publishers: 1,
      })
      expectPrepared(await host.track(store.prepareAcknowledgement(request)), record)
      expect(buildCalls).toBe(1)
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retiring',
        publishers: 1,
      })
    })
  })

  it('P3 preserves originals after builder refusal and reuses the complete fixed batch', async () => {
    const c = await created('rejected-has-no-fake-binding')
    const ref = expectedRef(c, 'c4d-created')
    const record = checkedRecord(endedRecord(c, ref))
    absentEndedFields(record)
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      await put(host, store, c, ref)
      let refusalCalls = 0,
        successCalls = 0,
        repeatCalls = 0
      expect(
        await host.track(
          store.prepareAcknowledgement({
            ...key,
            payloads: [ref],
            build(contents) {
              refusalCalls++
              expect(contents).toStrictEqual([c])
              return { unavailable: true }
            },
          }),
        ),
      ).toStrictEqual({ unavailable: true })
      expect(refusalCalls).toBe(1)
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ content: c })
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retained',
        publishers: 1,
      })
      expectPrepared(
        await host.track(
          store.prepareAcknowledgement({
            ...key,
            payloads: [ref],
            build: fixedBuilder([c], record, () => {
              successCalls++
            }),
          }),
        ),
        record,
      )
      expectPrepared(
        await host.track(
          store.prepareAcknowledgement({
            ...key,
            payloads: [ref],
            build() {
              repeatCalls++
              throw new Error('fixed batch must not be rebuilt')
            },
          }),
        ),
        record,
      )
      expect(successCalls).toBe(1)
      expect(repeatCalls).toBe(0)
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ unavailable: true })
    })
  })

  it('P4 completes an admitted held write and recovers its fixed batch in a new store', async () => {
    const c = await created('rejected-has-no-fake-binding')
    const ref = expectedRef(c, 'c4d-created')
    const record = checkedRecord(endedRecord(c, ref))
    absentEndedFields(record)
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      await put(host, store, c, ref)
      let buildCalls = 0,
        repeatCalls = 0
      host.gate.clearTrace()
      host.gate.set('hold-write')
      const pending = host.track(
        store.prepareAcknowledgement({
          ...key,
          payloads: [ref],
          build: fixedBuilder([c], record, () => {
            buildCalls++
          }),
        }),
      )
      try {
        await host.track(host.gate.entered.promise)
        const closing = host.track(store.close())
        try {
          expect(host.gate.active()).toStrictEqual({ reads: 0, writes: 1 })
        } finally {
          host.gate.set('pass')
          host.gate.finish.resolve(undefined)
        }
        expectPrepared(await pending, record)
        expect(await closing).toStrictEqual({ released: true })
      } finally {
        host.gate.set('pass')
        host.gate.finish.resolve(undefined)
      }
      expect(buildCalls).toBe(1)
      expect(host.gate.trace).toStrictEqual([
        'write:enter',
        'hold:entered',
        'hold:released',
        'write:return',
        'write:finally',
      ])
      expect(host.gate.active()).toStrictEqual({ reads: 0, writes: 0 })
      const reopened = host.makeStore()
      expectPrepared(
        await host.track(
          reopened.prepareAcknowledgement({
            ...key,
            payloads: [ref],
            build() {
              repeatCalls++
              throw new Error('reopened fixed batch must not be rebuilt')
            },
          }),
        ),
        record,
      )
      expect(repeatCalls).toBe(0)
    })
  })

  it('A1 confirms an ended record without a result digest and preserves its neighbour', async () => {
    const c = await created('rejected-has-no-fake-binding')
    const ref = expectedRef(c, 'c4d-created')
    const record = checkedRecord(endedRecord(c, ref))
    absentEndedFields(record)
    const accepted = await created('created-original-input')
    const judged = judgeModelCallCreatedPayload({
      ...accepted.value,
      ref: { session: 'session-1', callId: 'mc_c4d_neighbour' },
      creationKey: 'create-c4d-neighbour',
    })
    if ('rejected' in judged) throw new Error('declared neighbour malformed')
    const neighbour: Created = { kind: 'created', value: judged.ok }
    const neighbourRef = expectedRef(neighbour, 'c4d-neighbour')
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      const neighbourKey = { binding: host.binding, call: neighbour.value.ref.callId }
      const permit = await put(host, store, c, ref)
      await put(host, store, neighbour, neighbourRef)
      expect(await host.track(store.confirmAcknowledgement({ ...key, record }))).toStrictEqual({
        phase: 'acknowledged',
      })
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ unavailable: true })
      expect(await host.track(store.releaseAcknowledged(key))).toStrictEqual({
        cleanup: 'pending',
        pendingReasons: ['writer_in_flight'],
      })
      expect(await host.track(permit.release())).toStrictEqual({ released: true })
      expect(await host.track(store.releaseAcknowledged(key))).toStrictEqual({
        cleanup: 'released',
      })
      expect(await host.track(store.confirmAcknowledgement({ ...key, record }))).toStrictEqual({
        phase: 'released',
      })
      expect(await host.track(store.releaseAcknowledged(key))).toStrictEqual({
        cleanup: 'released',
      })
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'released',
        publishers: 0,
      })
      expect(await host.track(store.read({ ...neighbourKey, ref: neighbourRef }))).toStrictEqual({
        content: neighbour,
      })
      expect(await host.track(store.retention(neighbourKey))).toStrictEqual({
        phase: 'retained',
        publishers: 1,
      })
    })
  })

  it('A2 checks the complete Pending digest before confirmation and drains both permits', async () => {
    const c = await created('created-original-input')
    const p = await ready()
    const ref = expectedRef(c, 'c4d-created')
    const pendingRef = expectedRef(p, 'c4d-ready')
    const record = checkedRecord(readyRecord(c, p, ref, pendingRef))
    if (record.retainedResultDigest === undefined) throw new Error('declared result digest missing')
    const badRecord = checkedRecord({
      ...record,
      retainedResultDigest: {
        ...record.retainedResultDigest,
        hex: '0'.repeat(64),
      },
    })
    expect(Object.hasOwn(p.value, 'raw')).toBe(false)
    await withHost(c, async host => {
      const store = host.makeStore()
      const key = { binding: host.binding, call: c.value.ref.callId }
      const creationPermit = await put(host, store, c, ref)
      const pendingPermit = await put(host, store, p, pendingRef)
      expect(
        await host.track(store.confirmAcknowledgement({ ...key, record: badRecord })),
      ).toStrictEqual({ contradicted: true })
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ content: c })
      const readPending = await host.track(store.read({ ...key, ref: pendingRef }))
      expect(readPending).toStrictEqual({ content: p })
      if (!('content' in readPending)) throw new Error('retained Pending missing')
      expect(Object.hasOwn(readPending.content.value, 'raw')).toBe(false)
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'retained',
        publishers: 2,
      })
      expect(await host.track(store.confirmAcknowledgement({ ...key, record }))).toStrictEqual({
        phase: 'acknowledged',
      })
      expect(await host.track(store.read({ ...key, ref }))).toStrictEqual({ unavailable: true })
      expect(await host.track(store.read({ ...key, ref: pendingRef }))).toStrictEqual({
        unavailable: true,
      })
      expect(await host.track(store.releaseAcknowledged(key))).toStrictEqual({
        cleanup: 'pending',
        pendingReasons: ['writer_in_flight'],
      })
      expect(await host.track(creationPermit.release())).toStrictEqual({ released: true })
      expect(await host.track(pendingPermit.release())).toStrictEqual({ released: true })
      expect(await host.track(store.releaseAcknowledged(key))).toStrictEqual({
        cleanup: 'released',
      })
      expect(await host.track(store.confirmAcknowledgement({ ...key, record }))).toStrictEqual({
        phase: 'released',
      })
      expect(await host.track(store.releaseAcknowledged(key))).toStrictEqual({
        cleanup: 'released',
      })
      expect(await host.track(store.retention(key))).toStrictEqual({
        phase: 'released',
        publishers: 0,
      })
    })
  })
})

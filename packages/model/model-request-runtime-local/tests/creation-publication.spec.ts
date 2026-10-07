import { mockPrefixReader } from './mock-prefix-fixture.ts'
import { expect, test, vi } from 'vitest'
import { CreationPublication } from '../src/creation-publication.ts'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementLogBinding, SettlementTask } from '@omne-harness-lite/model-request-runtime'
import type { AppendResult, LogEntry, ReadResult } from '@omne-harness-lite/session-log'
import { session, tenant } from './log-codec-fixture.ts'
import { ControlledSettlementOwner, deferred } from './settlement-fixture.ts'

function fixture() {
  const marker = {
    kind: 'model_call_created',
    call: 'original-call',
    creationKey: 'original-key',
    payload: {
      kind: 'created',
      locator: 'original-locator',
      version: 'v1',
      digest: 'a'.repeat(64),
    },
    createdAt: '2026-10-04T00:00:00Z',
  }
  const captured = captureModelLogValue({
    category: 'record',
    input: { kind: 'value', value: marker },
  })
  if (!('ok' in captured)) throw new Error('marker fixture')
  const prepared = prepareModelLogEntry({
    session,
    shell: { tenant },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if (!('ok' in prepared)) throw new Error('prepared fixture')
  const entry = prepared.ok
  const rows: LogEntry[] = []
  let generation: object = {}
  const read = vi.fn(async (): Promise<ReadResult> => ({ entries: rows, tail: rows.length }))
  const append = vi.fn(async (): Promise<AppendResult> => {
    rows.push({ ...entry, session, position: rows.length + 1 })
    return { positions: [rows.length], tail: rows.length }
  })
  const binding: SettlementLogBinding = {
    session,
    tenant,
    generation,
    currentGeneration: () => generation,
    log: { readSince: read, readByKey: read, append },
    readPrefix: mockPrefixReader('creation-publication-unit-journal'),
  }
  const owner = new ControlledSettlementOwner()
  const grant = owner.acquire(1)
  if (!('registration' in grant)) throw new Error('fixture grant')
  const task: SettlementTask<AppendResult> = {
    completion: Promise.resolve({ failure: 'unavailable' }),
    stopped: Promise.resolve(),
    requestStop: vi.fn(),
  }
  const release = vi.fn(async () => ({ released: true as const }))
  const input = {
    binding,
    owner,
    registration: grant.registration,
    task,
    permit: { release },
    entry,
    callId: marker.call,
  }
  return {
    input,
    rows,
    read,
    append,
    owner,
    release,
    marker,
    changeGeneration() {
      generation = {}
    },
    commit() {
      rows.push({ ...entry, session, position: rows.length + 1 })
    },
  }
}

test('S-85: an unreadable full prefix retains the original publication until a later read', async () => {
  const f = fixture()
  f.read.mockResolvedValueOnce({ failure: 'unavailable' })
  const publication = new CreationPublication(f.input)
  expect(await publication.retry(() => true)).toEqual({ unavailable: true })
  expect(f.append).not.toHaveBeenCalled()
  expect(f.release).not.toHaveBeenCalled()
  expect(f.owner.active).toBe(1)
  f.commit()
  expect(await publication.retry(() => true)).toEqual({ published: true })
  expect(f.release).toHaveBeenCalledTimes(1)
  expect(f.owner.active).toBe(0)
  expect(await publication.close()).toEqual({ released: true })
  expect(f.release).toHaveBeenCalledTimes(1)
})

test('S-85: stop rejection never releases or recognizes a visible original marker', async () => {
  const f = fixture()
  f.commit()
  const stopped = Promise.reject(new Error('stop unproved'))
  void stopped.catch(() => {})
  const publication = new CreationPublication({ ...f.input, task: { ...f.input.task, stopped } })
  expect(await publication.retry(() => true)).toEqual({ unavailable: true })
  expect(await publication.close()).toEqual({ unavailable: true })
  expect(f.read).not.toHaveBeenCalled()
  expect(f.release).not.toHaveBeenCalled()
  expect(f.owner.active).toBe(1)
})

test('S-85: a completed read must actually stop before permit and registration release', async () => {
  const f = fixture()
  f.commit()
  const stop = deferred<void>()
  f.owner.stopBarrier = stop.promise
  const publication = new CreationPublication(f.input)
  let finished = false
  const retry = publication
    .retry(() => true)
    .then(result => {
      finished = true
      return result
    })
  await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(1))
  expect(finished).toBe(false)
  expect(f.release).not.toHaveBeenCalled()
  expect(f.owner.active).toBe(1)
  f.owner.stopBarrier = undefined
  stop.resolve()
  expect(await retry).toEqual({ published: true })
  expect(f.owner.active).toBe(0)
})

test('S-85: a read stop rejection retains every task and prevents a subsequent read', async () => {
  const f = fixture()
  f.commit()
  const registration = f.input.registration
  const publication = new CreationPublication({
    ...f.input,
    registration: {
      ...registration,
      start(kind, operation) {
        const task = registration.start(kind, operation)
        const stopped = task.stopped.then(() => {
          throw new Error('read stop unproved')
        })
        void stopped.catch(() => {})
        return { ...task, stopped }
      },
    },
  })
  expect(await publication.retry(() => true)).toEqual({ unavailable: true })
  expect(await publication.close()).toEqual({ unavailable: true })
  expect(f.read).toHaveBeenCalledTimes(1)
  expect(f.release).not.toHaveBeenCalled()
  expect(f.owner.active).toBe(1)
})

test('S-85: a different shell under the same creation key is never the original batch', async () => {
  const f = fixture()
  const captured = captureModelLogValue({
    category: 'record',
    input: { kind: 'value', value: f.marker },
  })
  if (!('ok' in captured)) throw new Error('conflicting marker')
  const prepared = prepareModelLogEntry({
    session,
    shell: { tenant, run: 'foreign-run', attempt: 1 },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if (!('ok' in prepared)) throw new Error('conflicting shell')
  f.rows.push({ ...prepared.ok, session, position: 1 })
  const publication = new CreationPublication(f.input)
  expect(await publication.retry(() => true)).toEqual({ unavailable: true })
  expect(f.append).not.toHaveBeenCalled()
  expect(f.release).not.toHaveBeenCalled()
  // The original stopped writer cannot commit over this durable dedupe key.
  expect(await publication.close()).toEqual({ released: true })
  expect(f.owner.active).toBe(0)
})

test('S-85: tail conflict keeps the original batch for the next explicit retry', async () => {
  const f = fixture()
  f.append.mockResolvedValueOnce({ failure: 'tailChanged', tail: 0 })
  const publication = new CreationPublication(f.input)
  expect(await publication.retry(() => true)).toEqual({ unavailable: true })
  expect(f.release).not.toHaveBeenCalled()
  expect(await publication.retry(() => true)).toEqual({ published: true })
  expect(f.append).toHaveBeenCalledTimes(2)
  expect(f.append.mock.calls[0]).toEqual(f.append.mock.calls[1])
  expect(f.rows).toHaveLength(1)
  expect(f.owner.active).toBe(0)
})

test('S-85: changed generation cannot prove absence or release the unknown writer', async () => {
  const f = fixture()
  const publication = new CreationPublication(f.input)
  f.changeGeneration()
  expect(await publication.retry(() => true)).toEqual({ unavailable: true })
  expect(await publication.close()).toEqual({ unavailable: true })
  expect(f.append).not.toHaveBeenCalled()
  expect(f.read).not.toHaveBeenCalled()
  expect(f.owner.active).toBe(1)
})

test('S-85: close during an absence read prevents resend and releases exactly once', async () => {
  const f = fixture()
  const gate = deferred<ReadResult>()
  f.read.mockImplementationOnce(async () => await gate.promise)
  const publication = new CreationPublication(f.input)
  const retry = publication.retry(() => true)
  await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(1))
  const closing = publication.close()
  const alsoClosing = publication.close()
  gate.resolve({ entries: [], tail: 0 })
  expect(await retry).toEqual({ released: true })
  expect(await closing).toEqual({ released: true })
  expect(await alsoClosing).toEqual({ released: true })
  expect(f.append).not.toHaveBeenCalled()
  expect(f.release).toHaveBeenCalledTimes(1)
  expect(f.owner.releases).toBe(1)
})

test('S-85: revoked admission after an absence read prevents resend', async () => {
  const f = fixture()
  let allowed = true
  f.read.mockImplementationOnce(async () => {
    allowed = false
    return { entries: [], tail: 0 }
  })
  const publication = new CreationPublication(f.input)
  expect(await publication.retry(() => allowed)).toEqual({ unavailable: true })
  expect(f.append).not.toHaveBeenCalled()
  expect(f.owner.active).toBe(1)
  expect(await publication.close()).toEqual({ released: true })
})

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import type { SessionLog } from '@omne-harness-lite/session-log'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import {
  createModelCallContentStore,
  modelCallContentMigrations,
} from '../src/reference-content.ts'
import { createAcknowledgementCustody } from '../src/acknowledgement-custody.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { createSettlementWork } from '../src/settlement-work.ts'
import type { ModelCallSettlementWorkStore } from '../src/reference-types.ts'
import type { PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import type { AcknowledgementCleanupPolicy } from '@omne-harness-lite/model-request-runtime'
import type { SettlementScheduler } from '@omne-harness-lite/model-request-runtime'
import { anchors, jsonObject, session } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'
import { controlled, deferred, noWaitScheduler, policy, request } from './settlement-fixture.ts'

async function workStorage(
  dir: string,
  retry: {
    readonly scheduler?: SettlementScheduler
    readonly policy?: AcknowledgementCleanupPolicy
  } = {},
) {
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'work.sqlite'),
    upgrade: false,
    migrations: composeMigrations(modelCallContentMigrations('sqlite')),
  })
  const content = createModelCallContentStore({
    storage,
    policy: { maxConcurrentWrites: 4, maxContentBytes: 1_000_000 },
  })
  const custody = createAcknowledgementCustody({
    calls: createCallContainerStore<PlannedSemantics, unknown>(),
    content,
    scheduler: retry.scheduler ?? noWaitScheduler,
    policy: retry.policy ?? { next: () => ({ stop: true }) },
    diagnostic() {},
  })
  return { storage, content, custody }
}

function isResponseBatch(entries: readonly { readonly payload: unknown }[]): boolean {
  return entries.some(
    ({ payload }) =>
      typeof payload === 'object' &&
      payload !== null &&
      'category' in payload &&
      payload.category === 'response',
  )
}

/** The durable held batch of this work row right now, serialized; null when absent. */
async function held(
  store: ModelCallSettlementWorkStore,
  key: Parameters<ModelCallSettlementWorkStore['read']>[0],
): Promise<string | null> {
  const read = await store.read(key)
  if ('unavailable' in read) throw new Error('work row unreadable')
  return 'absent' in read ? null : writeJsonLossless(read.work.staged.entries)
}

describe('RT12 S-99⑧ settlement work over the real coordinator, JSONL and SQLite', () => {
  it('A22-V13 seam A: after a proven zero write the rebuilt late batch is durable before its append', async () => {
    await controlled('work-late-rebuild', async ({ binding, owner, dir, wrap }) => {
      const parsed = parseOpaqueIdentifier('controlled-work-run', 'SessionRef')
      if (!('ok' in parsed)) throw new Error('session')
      const runSession = parsed.ok
      const attemptStart = (attempt: number) => {
        const message = captureModelLogValue({
          category: 'message',
          input: {
            kind: 'value',
            value: {
              id: `attempt-${attempt}`,
              type: 'system_reminder',
              nature: 'event',
              source: {
                kind: 'attempt_started',
                attempt,
                reason: attempt === 1 ? 'first' : 'resumed_after_interruption',
                at: '2026-09-29T00:00:00Z',
              },
              blocks: [],
              createdAt: '2026-09-29T00:00:00Z',
            },
          },
        })
        if (!('ok' in message)) throw new Error('attempt message capture')
        const entry = prepareModelLogEntry({
          session: runSession,
          shell: { tenant: binding.tenant, run: 'controlled-run', attempt },
          captured: message.ok,
          purpose: { kind: 'message' },
          messagePrefix: [],
        })
        if (!('ok' in entry)) throw new Error('attempt message prepare')
        return entry.ok
      }
      const started = await binding.log.append(
        runSession,
        [attemptStart(1)],
        { kind: 'fenced', run: 'controlled-run', attempt: 1 },
        { kind: 'unconditional' },
      )
      if ('failure' in started) throw new Error('attempt 1')
      const original = anchors().entries.map(entry => {
        const captured = captureModelLogValue({
          category: 'record',
          input: { kind: 'value', value: jsonObject(entry.payload).value },
        })
        if (!('ok' in captured)) throw new Error('anchor capture')
        const prepared = prepareModelLogEntry({
          session: runSession,
          shell: { tenant: binding.tenant, run: 'controlled-run', attempt: 1 },
          captured: captured.ok,
          purpose: { kind: 'record' },
          messagePrefix: [],
        })
        if (!('ok' in prepared)) throw new Error('anchor prepare')
        return prepared.ok
      })
      const anchored = await binding.log.append(
        runSession,
        original,
        { kind: 'fenced', run: 'controlled-run', attempt: 1 },
        { kind: 'unconditional' },
      )
      if ('failure' in anchored) throw new Error('anchors')

      const { storage, content, custody } = await workStorage(dir)
      const key = {
        binding: { ...binding, session: runSession },
        call: 'call',
        response: 'response',
      }
      const snapshots: (string | null)[] = []
      const appended: string[] = []
      let raced = false
      const racing: SessionLog = {
        ...binding.log,
        async append(s, entries, fence, condition) {
          if (isResponseBatch(entries)) {
            // What the work row holds at the moment this batch may take effect.
            snapshots.push(await held(content.work, key))
            appended.push(writeJsonLossless(entries))
            if (!raced) {
              // A new attempt starts between the read and this append: THIS batch writes nothing.
              raced = true
              const moved = await binding.log.append(
                runSession,
                [attemptStart(2)],
                { kind: 'fenced', run: 'controlled-run', attempt: 2 },
                { kind: 'unconditional' },
              )
              if ('failure' in moved) throw new Error('attempt 2')
            }
          }
          return await binding.log.append(s, entries, fence, condition)
        },
      }
      const work = createSettlementWork({
        binding: { ...wrap(racing), session: runSession },
        owner,
        store: content.work,
        custody,
        instance: 'runtime-a',
        ref: { session: runSession, callId: 'call' },
        request: {
          ...request,
          response: {
            ...responseV5,
            call: { callId: 'call', runId: 'controlled-run' },
            attemptId: 1,
          },
        },
        contention: policy(2),
        scheduler: noWaitScheduler,
        run: (_prefix, run, originalAttempt) => ({
          known: { run, originalAttempt, latestAttempt: raced ? 2 : 1, terminal: 'open' },
        }),
        diagnostic() {},
      })
      const outcome = await work.advance()
      expect(outcome).toHaveProperty('origin', 'appended')
      if (!('settled' in outcome)) throw new Error('not settled')
      expect(outcome.settled.response.response?.late).toBe(true)
      // Both appends found exactly their own batch durable first; the second is the rebuild.
      expect(appended).toHaveLength(2)
      expect(snapshots).toEqual(appended)
      expect(appended[0]).not.toBe(appended[1])
      expect(appended[1]).toContain('"late":true')
      // Confirmed final and a stopped writer: the row is retired automatically.
      expect(await held(content.work, key)).toBeNull()
      await work.close()
      await custody.close()
      await content.close()
      await storage.close()
    })
  })

  it('A22-V13 seam D: a partial collision keeps the row, the phase and returns no success', async () => {
    await controlled('work-partial-collision', async ({ binding, owner, dir, wrap }) => {
      const { storage, content, custody } = await workStorage(dir)
      const key = { binding, call: 'call', response: 'response' }
      let submitted: string | undefined
      let collided = false
      const partial: SessionLog = {
        ...binding.log,
        async append(s, entries, fence, condition) {
          if (isResponseBatch(entries)) {
            submitted ??= writeJsonLossless(entries)
            if (!collided) {
              // Only the message member of the same original lands first: a residual batch.
              collided = true
              const first = entries[0]
              if (first === undefined) throw new Error('message member')
              const landed = await binding.log.append(
                s,
                [first],
                { kind: 'unfenced' },
                { kind: 'unconditional' },
              )
              if ('failure' in landed) throw new Error('residual message')
            }
          }
          return await binding.log.append(s, entries, fence, condition)
        },
      }
      const work = createSettlementWork({
        binding: wrap(partial),
        owner,
        store: content.work,
        custody,
        instance: 'runtime-d',
        ref: { session, callId: 'call' },
        request,
        contention: policy(2),
        scheduler: noWaitScheduler,
        diagnostic() {},
      })
      expect(await work.advance()).toEqual({ retained: true })
      // The held batch is the complete original, never replaced or deleted.
      expect(await held(content.work, key)).toBe(submitted)
      const read = await content.work.read(key)
      expect(read).toMatchObject({ work: { generation: 1, owner: 'runtime-d' } })
      const log = await binding.log.readSince(session, 0)
      if (!('entries' in log)) throw new Error('log')
      const categories = log.entries.map(entry => jsonObject(entry.payload).category)
      expect(categories.filter(item => item === 'response')).toHaveLength(0)
      expect(categories.filter(item => item === 'message')).toHaveLength(1)
      // Repeating does not complete the residual batch or switch identities either.
      expect(await work.advance()).toEqual({ retained: true })
      expect(await held(content.work, key)).toBe(submitted)
      await custody.close()
      await content.close()
      await storage.close()
    })
  })

  it('A22-V14: a confirmed final never retires the row while another writer still runs; the shared retry does', async () => {
    await controlled('work-writer-still-running', async ({ binding, owner, dir }) => {
      const fired: (() => void)[] = []
      const scheduler: SettlementScheduler = {
        nowMonotonicMs: () => 0,
        wait: (_ms, signal) => {
          const done = deferred<'elapsed' | 'cancelled'>()
          signal.addEventListener('abort', () => done.resolve('cancelled'), { once: true })
          fired.push(() => done.resolve('elapsed'))
          return {
            completion: done.promise,
            requestStop() {},
            stopped: done.promise.then(() => {}),
          }
        },
      }
      const reasons: unknown[] = []
      const { storage, content, custody } = await workStorage(dir, {
        scheduler,
        policy: {
          next(input) {
            reasons.push(input.pendingReasons)
            return { waitMs: 0 }
          },
        },
      })
      const key = { binding, call: 'call', response: 'response' }
      let otherWriterRunning = true
      const work = createSettlementWork({
        binding,
        owner,
        store: content.work,
        custody,
        instance: 'runtime-v14',
        ref: { session, callId: 'call' },
        request,
        contention: policy(),
        scheduler: noWaitScheduler,
        diagnostic() {},
        obstacles: () => (otherWriterRunning ? ['writer_in_flight'] : []),
      })
      expect(await work.advance()).toHaveProperty('origin', 'appended')
      // The final is confirmed, but another possible writer has not stopped: the row stays.
      expect(await held(content.work, key)).not.toBeNull()
      expect(reasons).toEqual([['writer_in_flight']])
      expect(fired).toHaveLength(1)
      otherWriterRunning = false
      // The same custody retry (same policy, same scheduler) retires it; no second ACK.
      fired[0]?.()
      for (let index = 0; index < 50 && (await held(content.work, key)) !== null; index++)
        await new Promise(resolve => setTimeout(resolve, 10))
      expect(await held(content.work, key)).toBeNull()
      await custody.close()
      await content.close()
      await storage.close()
    })
  })
})

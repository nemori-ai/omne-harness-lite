/**
 * Review 2026-09-30 Q4 (a)-(h) at the settlement coordinator, over an actual SQL journal SessionLog and an
 * actual SQL session-tenant mapping (tests/settlement-fixture.ts `controlled`). The wrappers only
 * change what the caller of the log sees (receipt lost / prefix unreadable); commit or absence
 * is decided by the real log.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createSettlementCoordinator } from '../src/settlement-coordinator.ts'
import {
  type SettlementRegistration,
  type SettlementTask,
  type SettlementTaskKind,
} from '@omne-harness-lite/model-request-runtime'
import type { AppendResult, SessionLog } from '@omne-harness-lite/session-log'
import {
  ControlledSettlementOwner,
  controlled,
  deferred,
  noWaitScheduler,
  policy,
  request,
} from './settlement-fixture.ts'
import { dispatched, opened, prepare, session, tenant } from './log-codec-fixture.ts'
import { batchV2 } from './log-codec-v2-fixture.ts'
import { createRuntimeReconcile } from '../src/service-reconcile.ts'
import type { SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import { responseV5 } from './log-codec-v2-fixture.ts'
import { storeUnavailableCustody } from './reference-ports-fixture.ts'

const rejections: unknown[] = []
const onRejection = (reason: unknown) => {
  rejections.push(reason)
}
process.on('unhandledRejection', onRejection)
afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 20))
})

/** A log seen through a lossy receipt: commit is real; only the answer is lost. */
function lossy(
  real: SessionLog,
  mode: { append: 'committed' | 'absent' | 'normal'; read: 'ok' | 'fail' },
  seen: string[] = [],
): SessionLog {
  return {
    async append(s, entries, fence, condition) {
      seen.push(writeJsonLossless(entries))
      if (mode.append === 'absent') return { failure: 'unavailable' } as AppendResult
      const result = await real.append(s, entries, fence, condition)
      return mode.append === 'committed' ? ({ failure: 'unavailable' } as AppendResult) : result
    },
    async readSince(...args) {
      if (mode.read === 'fail') return { failure: 'unavailable' }
      return await real.readSince(...args)
    },
    async readByKey(...args) {
      return await real.readByKey(...args)
    },
  }
}
const entryCount = async (log: SessionLog) => {
  const read = await log.readSince(session, 0)
  if (!('entries' in read)) throw new Error('read')
  return read.entries.length
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

describe('review 2026-09-30 Q4 unknown ownership on the original handle (coordinator)', () => {
  it('(a) receipt lost but actually committed: the original handle recognizes it with zero rewrite', async () => {
    await controlled('rv-a-committed', async ({ binding, owner, wrap }) => {
      const seen: string[] = []
      const mode = { append: 'committed' as const, read: 'ok' as const }
      const coordinator = createSettlementCoordinator({
        binding: wrap(lossy(binding.log, mode, seen)),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      expect(await first.completion).toEqual({ unavailable: true, reason: 'write_unknown' })
      await first.stopped
      // the writer really stopped, yet the registration is kept: unknown is not released
      expect(owner.active).toBe(1)
      expect(owner.releases).toBe(0)
      const before = await entryCount(binding.log)
      const second = coordinator.settle(request)
      const resolved = await second.completion
      expect(resolved).toMatchObject({ origin: 'recognized', settled: { disposition: 'same' } })
      await second.stopped
      expect(owner.active).toBe(0)
      expect(seen).toHaveLength(1) // exactly one physical submission ever
      expect(await entryCount(binding.log)).toBe(before)
      await coordinator.close()
    })
  })

  it('(b) actually absent: the original is released with write_unknown, the next settle resends the byte-identical batch', async () => {
    await controlled('rv-b-absent', async ({ binding, owner, wrap }) => {
      const seen: string[] = []
      const mode = { append: 'absent' as 'absent' | 'normal', read: 'ok' as const }
      const coordinator = createSettlementCoordinator({
        binding: wrap(lossy(binding.log, mode, seen)),
        owner,
        settlementContention: policy(2),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      expect(await first.completion).toEqual({ unavailable: true, reason: 'write_unknown' })
      await first.stopped
      expect(owner.active).toBe(1)
      const before = await entryCount(binding.log)
      // resolution attempt: proves absence from the full prefix, writes nothing itself
      const resolution = coordinator.settle(request)
      expect(await resolution.completion).toEqual({ unavailable: true, reason: 'write_unknown' })
      await resolution.stopped
      expect(owner.active).toBe(0)
      expect(seen).toHaveLength(1)
      expect(await entryCount(binding.log)).toBe(before)
      // only now may the same request be submitted again
      mode.append = 'normal'
      const third = coordinator.settle(request)
      expect(await third.completion).toMatchObject({ origin: 'appended' })
      await third.stopped
      expect(seen).toHaveLength(2)
      expect(seen[1]).toBe(seen[0]) // byte-identical original batch
      expect(await entryCount(binding.log)).toBe(before + 2)
      await coordinator.close()
    })
  })

  it('(b2) after absence a different candidate for the same target is NOT silently the original: the caller must reuse its original request', async () => {
    // The coordinator writes whatever request it is handed after proven absence. R-J 4th ruling
    // makes the caller (anchored invocation / settleReply entry) responsible for pinning the
    // original request. Characterize the boundary so the report can state who guards it.
    await controlled('rv-b2-absent-other', async ({ binding, owner, wrap }) => {
      const mode = { append: 'absent' as 'absent' | 'normal', read: 'ok' as const }
      const seen: string[] = []
      const coordinator = createSettlementCoordinator({
        binding: wrap(lossy(binding.log, mode, seen)),
        owner,
        settlementContention: policy(2),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      await first.completion
      await first.stopped
      const resolution = coordinator.settle(request)
      await resolution.completion
      await resolution.stopped
      mode.append = 'normal'
      const otherResponse = {
        ...responseV5,
        replyDisposition: { vetoed: { by: 'another-gate' } },
        reply: undefined,
      }
      const { reply: _reply, ...noReply } = otherResponse
      const changed = coordinator.settle({
        target: request.target,
        current: { messageId: 'winner-message', disposition: { vetoed: { by: 'another-gate' } } },
        response: noReply,
      })
      const result = await changed.completion
      await changed.stopped
      // recorded, not asserted as a defect: the coordinator has no memory of the released original
      expect(['settled', 'unavailable'].some(key => key in result)).toBe(true)
      expect(seen.length).toBeGreaterThanOrEqual(1)
      await coordinator.close()
    })
  })

  it('(c) unreadable prefix: the original stays owned, close is unavailable, and a later close resolves it', async () => {
    await controlled('rv-c-unreadable', async ({ binding, owner, wrap }) => {
      const seen: string[] = []
      const mode = { append: 'committed' as const, read: 'ok' as 'ok' | 'fail' }
      const coordinator = createSettlementCoordinator({
        binding: wrap(lossy(binding.log, mode, seen)),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      expect(await first.completion).toMatchObject({ reason: 'write_unknown' })
      await first.stopped
      mode.read = 'fail'
      const retry = coordinator.settle(request)
      expect(await retry.completion).toEqual({ unavailable: true, reason: 'write_unknown' })
      await retry.stopped
      expect(owner.active).toBe(1) // not released, not treated as absent
      await expect(coordinator.close()).rejects.toThrow()
      expect(owner.active).toBe(1)
      // retryable: the same owner resolves once the log is readable again
      mode.read = 'ok'
      await expect(coordinator.close()).resolves.toBeUndefined()
      expect(owner.active).toBe(0)
      expect(seen).toHaveLength(1)
    })
  })

  it('(d) a late stop: close does not complete and the registration is not released before the writer stopped', async () => {
    await controlled('rv-d-late-stop', async ({ binding, owner, wrap }) => {
      const barrier = deferred<void>()
      owner.stopBarrier = barrier.promise
      const mode = { append: 'committed' as const, read: 'ok' as const }
      const coordinator = createSettlementCoordinator({
        binding: wrap(lossy(binding.log, mode)),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      expect(await first.completion).toMatchObject({ reason: 'write_unknown' })
      let stopped = false
      void first.stopped.then(() => {
        stopped = true
      })
      let closed = false
      const closing = coordinator.close().then(() => {
        closed = true
      })
      await delay(80)
      expect(stopped).toBe(false)
      expect(closed).toBe(false)
      expect(owner.active).toBe(1)
      expect(owner.releases).toBe(0)
      barrier.resolve()
      await closing
      expect(closed).toBe(true)
      expect(owner.active).toBe(0)
    })
  })

  it('(e) a rejected stop is visible on stopped, unhandled nowhere, and close rejects instead of hanging', async () => {
    /** The actual append writer's real stop completes, but its stop receipt is rejected. */
    function rejectingStopOwner(): ControlledSettlementOwner {
      const owner = new ControlledSettlementOwner()
      const acquire = owner.acquire
      Object.defineProperty(owner, 'acquire', {
        value: (limit: Parameters<typeof acquire>[0]) => {
          const granted = acquire(limit)
          if (!('registration' in granted)) return granted
          const inner = granted.registration
          const registration: SettlementRegistration = {
            start: <T>(kind: SettlementTaskKind, op: (signal: AbortSignal) => Promise<T>) => {
              const task: SettlementTask<T> = inner.start(kind, op)
              if (kind !== 'append') return task
              return {
                completion: task.completion,
                requestStop: task.requestStop,
                stopped: task.stopped.then(() => {
                  throw new Error('stop could not be proven')
                }),
              }
            },
            release: inner.release,
          }
          return { registration }
        },
      })
      return owner
    }
    const before = rejections.length
    await controlled('rv-e-stop-rejected', async ({ binding, wrap }) => {
      const owner = rejectingStopOwner()
      const coordinator = createSettlementCoordinator({
        binding: wrap(lossy(binding.log, { append: 'normal', read: 'ok' })),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const handle = coordinator.settle(request)
      expect(await handle.completion).toMatchObject({ origin: 'appended' })
      await expect(handle.stopped).rejects.toThrow('stop could not be proven')
      const outcome = await Promise.race([
        coordinator.close().then(
          () => 'resolved',
          () => 'rejected',
        ),
        delay(2000).then(() => 'hung'),
      ])
      expect(outcome).toBe('rejected')
      // an unproven stop is never released
      expect(owner.active).toBe(1)
      expect(owner.releases).toBe(0)
    })
    await delay(50)
    expect(rejections.slice(before)).toEqual([])
  })

  it('(f) two concurrent registrations: the normal one releasing does not clear the unknown one', async () => {
    await controlled('rv-f-two-registrations', async ({ binding, owner, wrap }) => {
      // call-b anchors are appended to the same actual log
      const {
        dispatched,
        opened,
        prepare,
        session: s,
        tenant,
      } = await import('./log-codec-fixture.ts')
      const bAnchor = { ...dispatched, call: 'call-b', response: 'response-b' }
      const bOpened = { ...opened, call: 'call-b' }
      const appended = await binding.log.append(
        s,
        [
          prepare('record', bAnchor, { kind: 'record' }, { tenant }),
          prepare('record', bOpened, { kind: 'record' }, { tenant }),
        ],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in appended) throw new Error('call-b anchors')
      const gate = deferred<void>()
      const real = binding.log
      const seen: string[] = []
      const log: SessionLog = {
        async append(sn, entries, fence, condition) {
          const isB = writeJsonLossless(entries).includes('call-b')
          seen.push(isB ? 'B' : 'A')
          if (isB) {
            await gate.promise // B is in flight while A already became unknown
            return await real.append(sn, entries, fence, condition)
          }
          await real.append(sn, entries, fence, condition)
          return { failure: 'unavailable' } as AppendResult
        },
        readSince: async (...args) => await real.readSince(...args),
        readByKey: async (...args) => await real.readByKey(...args),
      }
      const coordinator = createSettlementCoordinator({
        binding: wrap(log),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const { batch } = await import('./log-codec-fixture.ts')
      void batch
      const bResponse = {
        ...responseV5,
        id: 'response-b',
        call: { callId: 'call-b' },
        reply: { ...(responseV5.reply as object), id: 'winner-b', response: 'response-b' },
      }
      const a = coordinator.settle(request)
      const b = coordinator.settle({
        target: { call: 'call-b', dispatch: 1, response: 'response-b' },
        current: { messageId: 'winner-b', disposition: 'persisted' },
        response: bResponse,
      })
      expect(await a.completion).toEqual({ unavailable: true, reason: 'write_unknown' })
      await a.stopped
      expect(owner.active).toBe(2) // A retained + B still in flight
      gate.resolve()
      expect(await b.completion).toMatchObject({ origin: 'appended' })
      await b.stopped
      // B released exactly its own registration; A's unknown ownership is untouched
      expect(owner.active).toBe(1)
      expect(owner.releases).toBe(1)
      const again = coordinator.settle(request)
      expect(await again.completion).toMatchObject({ origin: 'recognized' })
      await again.stopped
      expect(owner.active).toBe(0)
      expect(seen.filter(x => x === 'A')).toHaveLength(1)
      await coordinator.close()
    })
  })

  it('(g) a second settle for the same target with another disposition never rewrites: it resolves the original', async () => {
    await controlled('rv-g-other-disposition', async ({ binding, owner, wrap }) => {
      const seen: string[] = []
      const coordinator = createSettlementCoordinator({
        binding: wrap(lossy(binding.log, { append: 'committed', read: 'ok' }, seen)),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      await first.completion
      await first.stopped
      const vetoed = { ...responseV5, replyDisposition: { vetoed: { by: 'late-gate' } } }
      const second = coordinator.settle({
        target: request.target,
        current: { messageId: 'winner-message', disposition: { vetoed: { by: 'late-gate' } } },
        response: vetoed,
      })
      const result = await second.completion
      await second.stopped
      expect(seen).toHaveLength(1)
      if (!('settled' in result)) throw new Error(JSON.stringify(result))
      // the recognized member is the ORIGINAL persisted disposition, not the caller's veto
      expect(result.settled.response.response?.replyDisposition).toBe('persisted')
      await coordinator.close()
    })
  })
  it('(h) previous review: an owner whose writer only stops after requestStop does not create a completion/stopped wait cycle', async () => {
    /** stopped resolves only after the caller asked to stop, like a cancellable real writer. */
    function stopOnRequestOwner(): ControlledSettlementOwner {
      const owner = new ControlledSettlementOwner()
      const acquire = owner.acquire
      Object.defineProperty(owner, 'acquire', {
        value: (limit: Parameters<typeof acquire>[0]) => {
          const granted = acquire(limit)
          if (!('registration' in granted)) return granted
          const inner = granted.registration
          const registration: SettlementRegistration = {
            start: <T>(kind: SettlementTaskKind, op: (signal: AbortSignal) => Promise<T>) => {
              const task: SettlementTask<T> = inner.start(kind, op)
              const requested = deferred<void>()
              return {
                completion: task.completion,
                requestStop: () => {
                  requested.resolve()
                  task.requestStop()
                },
                stopped: Promise.all([task.stopped, requested.promise]).then(() => undefined),
              }
            },
            release: inner.release,
          }
          return { registration }
        },
      })
      return owner
    }
    await controlled('rv-h-stop-on-request', async ({ binding, wrap }) => {
      const owner = stopOnRequestOwner()
      const mode = { append: 'committed' as 'committed' | 'normal', read: 'ok' as const }
      const seen: string[] = []
      const coordinator = createSettlementCoordinator({
        binding: wrap(lossy(binding.log, mode, seen)),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      expect(await first.completion).toMatchObject({ reason: 'write_unknown' })
      // no external requestStop: the coordinator itself must drive the stop it waits for
      const stopped = await Promise.race([
        first.stopped.then(() => 'stopped'),
        delay(2000).then(() => 'hung'),
      ])
      expect(stopped).toBe('stopped')
      const again = coordinator.settle(request)
      expect(await Promise.race([again.completion, delay(2000).then(() => 'hung')])).toMatchObject({
        origin: 'recognized',
      })
      expect(
        await Promise.race([again.stopped.then(() => 'stopped'), delay(2000).then(() => 'hung')]),
      ).toBe('stopped')
      expect(owner.active).toBe(0)
      await coordinator.close()
    })
  })
})

describe('review 2026-09-30 Q3/S2 fail-closed granularity: reconcile per call (RT12 S-100)', () => {
  it.each([false, true])(
    'reconcile over one terminal call (acknowledged: %s) next to an in-flight call',
    async withAck => {
      // RT12 S-100 reconcile row: "已ACK返回S-97，可继续会话对账；不能因已释放payload永久unavailable".
      // Adopted from the A1 characterization (where any ACK blocked the whole session): the
      // acknowledged call now answers its own S-97 branch and the other call still recovers.
      await controlled(`rv-reconcile-acked-${withAck}`, async ({ binding, owner }) => {
        const rec = (value: unknown) => prepare('record', value, { kind: 'record' })
        const payloadOf = (locator: string, kind: 'created' | 'reply_ready') => ({
          kind,
          locator,
          version: '1',
          digest: (kind === 'created' ? 'c' : 'd').repeat(64),
        })
        const created = payloadOf('acked-created', 'created')
        const acked = {
          ...responseV5,
          id: 'response-acked',
          call: { callId: 'acked' },
          reply: {
            ...(responseV5.reply as object),
            id: 'winner-acked',
            response: 'response-acked',
          },
        }
        const appended = await binding.log.append(
          session,
          [
            rec({
              kind: 'model_call_created',
              call: 'acked',
              creationKey: 'acked-creation',
              payload: created,
              createdAt: '2026-09-27T00:00:00Z',
            }),
            rec({ ...dispatched, call: 'acked', response: 'response-acked' }),
            rec({ ...opened, call: 'acked' }),
            ...batchV2(acked),
            ...(!withAck
              ? []
              : [
                  rec({
                    kind: 'model_call_acknowledged',
                    call: 'acked',
                    creationKey: 'acked-creation',
                    creationInput: {
                      role: 'model-call-creation-semantic-sha256/v1',
                      hex: 'a'.repeat(64),
                    },
                    acknowledgedAt: '2026-09-30T00:00:00Z',
                    releasablePayloads: [created],
                    target: { kind: 'response', response: 'response-acked' },
                    terminalState: 'complete',
                  }),
                ]),
          ],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
        if ('failure' in appended) throw new Error('acked call')
        void tenant
        const reconcile = createRuntimeReconcile({
          custody: storeUnavailableCustody(),
          contention: policy(),
          scheduler: noWaitScheduler,
          now: async () => '2026-09-30T00:00:03Z',
          diagnostic() {},
          recovery: {
            async authorize() {
              return { authorized: true as const }
            },

            async enter() {
              return {
                scope: {
                  binding: { log: binding } as SessionRuntimeBinding,
                  owner,
                  originalInvocation: () => ({ absent: true }) as const,
                  async close() {},
                },
              }
            },
          },
        })
        // 'call' (harness anchors) is an in-flight call that recovery would interrupt; 'acked' is
        // terminal and acknowledged: it answers only its small branch, per call.
        const result = await reconcile.reconcile({ session })
        if (withAck)
          expect(result).toMatchObject({
            calls: expect.arrayContaining([
              expect.objectContaining({
                callId: 'acked',
                acknowledged: expect.objectContaining({
                  terminalState: 'complete',
                  acknowledged: expect.objectContaining({
                    cleanup: 'pending',
                    pendingReasons: ['storage_unavailable'],
                  }),
                }),
              }),
              { callId: 'call', state: 'interrupted' },
            ]),
          })
        else
          expect(result).toMatchObject({
            calls: expect.arrayContaining([
              { callId: 'acked', state: 'complete' },
              { callId: 'call', state: 'interrupted' },
            ]),
          })
        expect(await reconcile.close()).toEqual({ released: true })
      })
    },
  )
})

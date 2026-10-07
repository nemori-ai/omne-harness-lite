import { modelCategory, modelValue } from './log-codec-fixture.ts'
// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 SQL journal 会话日志。
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import { narrow } from '@omne-harness-lite/storage'
import type { AppendResult, LogEntry } from '@omne-harness-lite/session-log'
import { createSettlementCoordinator } from '../src/settlement-coordinator.ts'
import type { ModelCallContentStore } from '../src/reference-types.ts'
import type { SettlementLogBinding } from '../src/settlement-types.ts'
import type { AcknowledgementCleanupPolicy } from '../src/service-types.ts'
import { payload } from './anchored-invocation-fixture.ts'
import { acknowledgementHost, type HostOptions } from './acknowledgement-host-fixture.ts'
import {
  ControlledSettlementOwner,
  deferred,
  noWaitScheduler,
  policy,
} from './settlement-fixture.ts'

type Host = Awaited<ReturnType<typeof acknowledgementHost>>
const disposition = { vetoed: { by: 'a22-gate' } } as const
const other = { consumed: { by: 'compaction' } } as const

function isResponseEntry(entry: { readonly payload: unknown }): boolean {
  return modelCategory(entry.payload) === 'response'
}
function finals(entries: readonly LogEntry[], response: string): readonly LogEntry[] {
  return entries.filter(entry => isResponseEntry(entry) && payload(entry).id === response)
}

/** The call id of a response log wrapper `{ category, value: { call: { callId } } }`. */
function callOf(wrapper: unknown): string {
  if (modelCategory(wrapper) !== 'response') return ''
  const value = modelValue(wrapper)
  if (typeof value !== 'object' || value === null || !('call' in value)) return ''
  const call = value.call
  return typeof call === 'object' && call !== null && 'callId' in call ? String(call.callId) : ''
}

/** The staged entries currently durable for a call, serialized losslessly; null if no row. */
async function stagedEntries(h: Host, call: string): Promise<string | null> {
  const rows = await h.host.storage.read(async tx =>
    narrow<{ model_call_settlement_work: { call: string; staged: string } }>(tx)
      .selectFrom('model_call_settlement_work')
      .select(['call', 'staged'])
      .where('call', '=', call)
      .execute(),
  )
  const row = rows[0]
  if (row === undefined) return null
  const parsed = readJsonStrict(row.staged)
  if (!('ok' in parsed)) throw new Error('staged row')
  const staged = parsed.ok
  if (typeof staged !== 'object' || staged === null || !('entries' in staged))
    throw new Error('staged shape')
  return writeJsonLossless(staged.entries)
}

/**
 * The runtime's final append passes through here. Every final append first checks that the
 * durable work row already holds exactly the batch being appended (S-99⑧ / seam R1). The first
 * one can be held open (a writer that has not stopped) and then lose its receipt.
 */
function finalAppendProbe(mode: 'pass' | 'commit_then_hang' | 'drop_then_hang') {
  let host: Host | undefined
  const reached = deferred<void>()
  const release = deferred<void>()
  const heldAtAppend: boolean[] = []
  let armed = mode !== 'pass'
  const append: NonNullable<HostOptions['append']> = real => async (s, entries, fence, cond) => {
    if (entries.some(isResponseEntry) && host !== undefined) {
      heldAtAppend.push(
        (await stagedEntries(host, callOf(entries.at(-1)?.payload))) === writeJsonLossless(entries),
      )
      if (armed) {
        armed = false
        if (mode === 'commit_then_hang') {
          const committed = await real(s, entries, fence, cond)
          if ('failure' in committed) throw new Error(`commit: ${committed.failure}`)
        }
        reached.resolve()
        await release.promise
        return { failure: 'unavailable' } satisfies AppendResult
      }
    }
    return await real(s, entries, fence, cond)
  }
  return {
    append,
    attach(value: Host) {
      host = value
    },
    reached: reached.promise,
    release: () => release.resolve(),
    heldAtAppend,
  }
}

async function acknowledgedReady(h: Host) {
  h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
  expect(await h.service.openCall(h.request('a22_work'))).toMatchObject({ callId: 'a22-call-1' })
  const ref = { session: h.host.session, callId: 'a22-call-1' }
  const dispatched = await h.service.dispatch(ref)
  if (!('replyPending' in dispatched)) throw new Error('ready reply')
  const retained: PendingModelResponse = dispatched.replyPending
  const acknowledged = await h.service.acknowledgeCall({
    ref,
    expectedResult: { kind: 'response', response: retained.id },
  })
  expect(acknowledged).toMatchObject({ acknowledged: { cleanup: 'released' } })
  expect(await h.contentRows('a22-call-1')).toBe(0)
  return { ref, retained }
}

describe('A22-V13/V14 post-ACK settlement work on real SQLite/SQL journal (inline, noRun)', () => {
  it.each(['commit_then_hang', 'drop_then_hang'] as const)(
    'A22-V13/R4: a writer that never answers (%s) leaves only its staged batch; the recovery owner concludes it',
    async mode => {
      const probe = finalAppendProbe(mode)
      const h = await acknowledgementHost({ append: probe.append })
      probe.attach(h)
      let first: Promise<unknown> | undefined
      try {
        const { ref, retained } = await acknowledgedReady(h)
        first = h.service.settleReply({ ...ref, disposition, retainedResult: retained })
        await probe.reached
        // The only copy of the batch the crashed writer may have committed is its work row.
        expect(probe.heldAtAppend).toEqual([true])
        expect(await h.workRows('a22-call-1')).toBe(1)

        // A restarted runtime does not own that row: settle alone never concludes it. A final
        // already in the log decides by itself (S-99⑦); otherwise the foreign row blocks.
        const restarted = h.restarted({ originalInvocation: () => ({ absent: true }) })
        expect(
          await restarted.service.settleReply({ ...ref, disposition, retainedResult: retained }),
        ).toEqual(
          mode === 'commit_then_hang'
            ? { callId: 'a22-call-1', state: 'complete' }
            : { unavailable: true },
        )
        expect(await h.workRows('a22-call-1')).toBe(1)
        // Without the host's actual-stop evidence the recovery owner keeps it as well.
        const unproven = h.restarted()
        expect(await unproven.service.reconcile({ session: h.host.session })).toHaveProperty(
          'calls',
        )
        expect(await h.workRows('a22-call-1')).toBe(1)
        // With the evidence: the complete prefix decides, and the row is retired either way.
        const reconciled = await restarted.service.reconcile({ session: h.host.session })
        if (!('calls' in reconciled)) throw new Error('reconcile')
        expect(reconciled.calls.find(item => item.callId === 'a22-call-1')).toHaveProperty(
          'acknowledged',
        )
        expect(await h.workRows('a22-call-1')).toBe(0)
        if (mode === 'commit_then_hang') {
          // Recognized from the log: the consumer's repeat is answered without any full value.
          expect(await restarted.service.settleReply({ ...ref, disposition })).toEqual({
            callId: 'a22-call-1',
            state: 'complete',
          })
        } else {
          // Proven absent: the responsibility ended; the consumer re-applies with its value.
          expect(await restarted.service.settleReply({ ...ref, disposition })).toEqual({
            wrongPhase: { phase: 'complete' },
          })
          expect(
            await restarted.service.settleReply({ ...ref, disposition, retainedResult: retained }),
          ).toEqual({ callId: 'a22-call-1', state: 'complete' })
          expect(await h.workRows('a22-call-1')).toBe(0)
        }
        expect(finals(await h.entries(), retained.id)).toHaveLength(1)
        // The late original writer finally returns: it recognizes, never writes a second batch.
        probe.release()
        await first
        expect(finals(await h.entries(), retained.id)).toHaveLength(1)
        expect(await h.workRows('a22-call-1')).toBe(0)
        // No model request was repeated, and the ACK cleanup never regressed.
        expect(h.wire.sends() + restarted.wire.sends() + unproven.wire.sends()).toBe(1)
        expect(await h.contentRows('a22-call-1')).toBe(0)
        expect(await restarted.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
          view: { acknowledged: { cleanup: 'released' } },
        })
        await restarted.runtime.close()
        await unproven.runtime.close()
        await h.runtime.close()
      } finally {
        probe.release()
        await first?.catch(() => undefined)
        await h.host.close()
      }
    },
    30_000,
  )

  it('A22-V14/seam B: an unreadable work row is never taken as a zero write', async () => {
    const probe = finalAppendProbe('drop_then_hang')
    const h = await acknowledgementHost({ append: probe.append })
    probe.attach(h)
    let first: Promise<unknown> | undefined
    try {
      const { ref, retained } = await acknowledgedReady(h)
      first = h.service.settleReply({ ...ref, disposition, retainedResult: retained })
      await probe.reached
      const unreadable = (store: ModelCallContentStore): ModelCallContentStore => ({
        ...store,
        work: { ...store.work, read: async () => ({ unavailable: true }) },
      })
      const blind = h.restarted({
        originalInvocation: () => ({ absent: true }),
        content: unreadable,
      })
      await blind.service.reconcile({ session: h.host.session })
      expect(
        await blind.service.settleReply({ ...ref, disposition, retainedResult: retained }),
      ).toEqual({ unavailable: true })
      expect(await h.workRows('a22-call-1')).toBe(1)
      // A readable source concludes it.
      const restarted = h.restarted({ originalInvocation: () => ({ absent: true }) })
      await restarted.service.reconcile({ session: h.host.session })
      expect(await h.workRows('a22-call-1')).toBe(0)
      probe.release()
      await first
      await blind.runtime.close()
      await restarted.runtime.close()
      await h.runtime.close()
    } finally {
      probe.release()
      await first?.catch(() => undefined)
      await h.host.close()
    }
  }, 30_000)

  it.each([
    [
      'the same disposition is recognized',
      disposition,
      { callId: 'a22-call-1', state: 'complete' },
    ],
    ['another disposition is alreadyEnded', other, { alreadyEnded: true }],
  ] as const)(
    'A22-V13/V14 seam C: the original late writer lands its final first; %s, no second batch',
    async (_name, winner, expected) => {
      let h: Host | undefined
      let raced = false
      const h0 = await acknowledgementHost({
        append: real => async (s, entries, fence, cond) => {
          if (!raced && entries.some(isResponseEntry) && h !== undefined) {
            raced = true
            // The pre-ACK writer that held a publish permit commits the same ResponseId first.
            const binding: SettlementLogBinding = {
              ...h.host.create().input.binding,
              session: h.host.session,
              tenant: h.host.tenant,
              log: h.host.log,
              generation: late.generation,
              currentGeneration: () => late.generation,
            }
            const coordinator = createSettlementCoordinator({
              binding,
              owner: new ControlledSettlementOwner(),
              settlementContention: policy(),
              settlementScheduler: noWaitScheduler,
              diagnostic() {},
            })
            const pending = late.pending
            if (pending === undefined) throw new Error('pending')
            const handle = coordinator.settle({
              target: { call: 'a22-call-1', dispatch: pending.dispatch, response: pending.id },
              current: { messageId: pending.reply.id, disposition: winner },
              response: { ...pending, replyDisposition: winner },
            })
            expect(await handle.completion).toHaveProperty('settled')
            await handle.stopped
            await coordinator.close()
          }
          return await real(s, entries, fence, cond)
        },
      })
      const late: { generation: object; pending?: PendingModelResponse } = {
        generation: Object.freeze({}),
      }
      h = h0
      try {
        const { ref, retained } = await acknowledgedReady(h0)
        late.pending = retained
        expect(
          await h0.service.settleReply({ ...ref, disposition, retainedResult: retained }),
        ).toEqual(expected)
        expect(raced).toBe(true)
        const written = finals(await h0.entries(), retained.id)
        expect(written).toHaveLength(1)
        expect(payload(written[0] as LogEntry).replyDisposition).toEqual(winner)
        expect(await h0.workRows('a22-call-1')).toBe(0)
        expect(await h0.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
          view: { acknowledged: { cleanup: 'released' } },
        })
        await h0.runtime.close()
      } finally {
        await h0.host.close()
      }
    },
    30_000,
  )

  it('A22-V14 seam E + R3: a late retire of an ended work never deletes the next work row', async () => {
    // One manual scheduler and one policy object serve ACK cleanup and work retirement alike.
    const fired: (() => void)[] = []
    const scheduler = {
      nowMonotonicMs: () => 0,
      wait: (_ms: unknown, signal: AbortSignal) => {
        const done = deferred<'elapsed' | 'cancelled'>()
        signal.addEventListener('abort', () => done.resolve('cancelled'), { once: true })
        fired.push(() => done.resolve('elapsed'))
        return { completion: done.promise, requestStop() {}, stopped: done.promise.then(() => {}) }
      },
    }
    const decisions: unknown[] = []
    const cleanupPolicy: AcknowledgementCleanupPolicy = {
      next(input) {
        decisions.push(input.pendingReasons)
        return { waitMs: 0 }
      },
    }
    let removes = 0
    let loseFirstRemoveReceipt = true
    let dropFirstAppend = true
    const gate = deferred<void>()
    const secondReached = deferred<void>()
    let appends = 0
    const h = await acknowledgementHost({
      settlementScheduler: scheduler,
      acknowledgementCleanup: cleanupPolicy,
      append: real => async (s, entries, fence, cond) => {
        if (entries.some(isResponseEntry)) {
          appends++
          if (dropFirstAppend) {
            // Work A: nothing is committed and the receipt is lost (the writer does stop).
            dropFirstAppend = false
            return { failure: 'unavailable' }
          }
          if (appends === 2) {
            // Work B is staged and its append is in flight while A's late retire fires.
            secondReached.resolve()
            await gate.promise
          }
        }
        return await real(s, entries, fence, cond)
      },
      content: store => ({
        ...store,
        work: {
          ...store.work,
          async remove(input) {
            removes++
            const result = await store.work.remove(input)
            if (loseFirstRemoveReceipt) {
              // Work A's delete committed, but its receipt was lost.
              loseFirstRemoveReceipt = false
              return { pending: 'receipt_unknown' }
            }
            return result
          },
        },
      }),
    })
    try {
      const { ref, retained } = await acknowledgedReady(h)
      // Work A ends: the writer stopped and the complete prefix proves its batch absent.
      expect(
        await h.service.settleReply({ ...ref, disposition, retainedResult: retained }),
      ).toEqual({ unavailable: true })
      expect(await h.workRows('a22-call-1')).toBe(0)
      expect(decisions).toEqual([['receipt_unknown']])
      expect(fired).toHaveLength(1)
      // Work B starts from the consumer's value; its row exists while its append is held.
      const second = h.service.settleReply({ ...ref, disposition, retainedResult: retained })
      await secondReached.promise
      expect(await h.workRows('a22-call-1')).toBe(1)
      const bRow = await stagedEntries(h, 'a22-call-1')
      // A's late retry now runs against B's row: it is refused by work id, B's row stays.
      fired[0]?.()
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(removes).toBe(2)
      expect(await stagedEntries(h, 'a22-call-1')).toBe(bRow)
      gate.resolve()
      expect(await second).toEqual({ callId: 'a22-call-1', state: 'complete' })
      expect(await h.workRows('a22-call-1')).toBe(0)
      expect(finals(await h.entries(), retained.id)).toHaveLength(1)
      await h.runtime.close()
    } finally {
      gate.resolve()
      await h.host.close()
    }
  }, 30_000)
})

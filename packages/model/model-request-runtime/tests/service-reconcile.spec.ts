import { describe, expect, it } from 'vitest'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import { createSettlementCoordinator } from '../src/settlement-coordinator.ts'
import {
  createRuntimeReconcile,
  createRuntimeSettleReply,
  settlePendingReply,
} from '../src/service-reconcile.ts'
import { createCallContainer, createCallContainerStore } from '../src/service-container.ts'
import type {
  CreateCallContainerInput,
  SessionRuntimeBinding,
  SettleReplyInput,
} from '../src/service-types.ts'
import type { AnchoredInvocationHandle } from '../src/anchored-invocation-types.ts'
import type { PlannedSemantics } from '../src/types.ts'
import type { SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { session } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'
import { controlled, noWaitScheduler, policy, request } from './settlement-fixture.ts'

function originalInvocation(coordinator: {
  settle: (candidate: typeof request) => {
    completion: Promise<unknown>
    stopped: Promise<void>
  }
}) {
  return {
    async settleReply(disposition: SettleReplyInput['disposition']) {
      const candidate = { ...pending(), replyDisposition: disposition }
      const task = coordinator.settle({
        target: { call: 'call', dispatch: candidate.dispatch, response: candidate.id },
        current: { messageId: candidate.reply.id, disposition },
        response: candidate,
      })
      const result = await task.completion
      await task.stopped
      return result
    },
  } as Parameters<typeof settlePendingReply>[0]['invocation']
}

function pending(): PendingModelResponse {
  const { replyDisposition: _disposition, ...candidate } = responseV5
  if (!isPending(candidate)) throw new Error('current pending fixture')
  return candidate
}
function isPending(value: unknown): value is PendingModelResponse {
  return 'ok' in judgePendingModelResponse(value)
}
const vetoed: SettleReplyInput = {
  session,
  callId: 'call',
  disposition: { vetoed: { by: 'input-gate', reason: 'not publishable' } },
}

describe('S-49 reply disposition through the real JSONL settlement coordinator', () => {
  it('uses the stored original handle and recognizes the settled disposition after container removal', async () => {
    await controlled(
      'service-settle-original-handle',
      async ({ binding, owner, wrap, submissions }) => {
        const unknownReceipt: SessionLog = {
          ...binding.log,
          async append(...args) {
            await binding.log.append(...args)
            return { failure: 'unavailable' }
          },
        }
        const coordinator = createSettlementCoordinator({
          binding: wrap(unknownReceipt),
          owner,
          settlementContention: policy(),
          settlementScheduler: noWaitScheduler,
          diagnostic() {},
        })
        const calls = createCallContainerStore<PlannedSemantics, never>()
        let released = 0
        let recoveryCloses = 0
        const sessionBinding = {
          log: binding,
          selection: { binding },
        } as SessionRuntimeBinding
        const container = createCallContainer({
          key: { session, callId: 'call' },
          session: sessionBinding,
          request: { session, callId: 'call' },
          binding: {
            lease: {
              release: () => {
                released++
              },
            },
          },
          owner,
          coordinator,
        } as unknown as CreateCallContainerInput<PlannedSemantics, never>)
        const opening = calls.reserve({ session, callId: 'call' })
        if (!('reservation' in opening)) throw new Error('opening reservation absent')
        expect(calls.insert(opening.reservation, container)).toBe(true)
        let invocations = 0
        const original = {
          ...originalInvocation(coordinator),
          async close() {
            return { released: true } as const
          },
          outcome: Promise.resolve({ replyPending: pending() }),
          snapshot: () => ({ blocks: [], position: 0 }),
          abort() {},
        } as AnchoredInvocationHandle
        const settlement = original.settleReply
        const owned = {
          ...original,
          settleReply: async (disposition: SettleReplyInput['disposition']) => {
            invocations++
            return settlement(disposition)
          },
        } as AnchoredInvocationHandle
        opening.reservation.attachInvocation(owned)
        opening.reservation.publish({ phase: 'reply_pending', pending: pending() })
        opening.reservation.release()
        const settleReply = createRuntimeSettleReply({
          calls,
          contention: policy(),
          scheduler: noWaitScheduler,
          reservationWaitPolicy: { maxWaitersPerCall: 1, timeoutMs: 100 },
          recovery: {
            async enter() {
              return {
                scope: {
                  binding: sessionBinding,
                  owner,
                  async close() {
                    recoveryCloses++
                  },
                },
              }
            },
          },
        })
        expect(await settleReply(vetoed)).toEqual({ unavailable: true })
        expect(container.view().operation.phase).toBe('reply_pending')
        expect(released).toBe(0)
        expect(calls.find({ session, callId: 'call' })).toBe(container)
        expect(await settleReply(vetoed)).toEqual({ callId: 'call', state: 'complete' })
        expect(invocations).toBe(2)
        expect(released).toBe(1)
        expect(calls.find({ session, callId: 'call' })).toBeUndefined()
        expect(await settleReply(vetoed)).toEqual({ callId: 'call', state: 'complete' })
        expect(
          await settleReply({ ...vetoed, disposition: { consumed: { by: 'side_query' } } }),
        ).toEqual({ alreadyEnded: true })
        expect(invocations).toBe(2)
        expect(recoveryCloses).toBe(2)
        expect(submissions.map(item => item.count)).toEqual([2, 1])
      },
    )
  })
  it('writes one complete vetoed response and recognizes the original on repeat or competing disposition', async () => {
    await controlled('service-settle-veto', async ({ coordinator, submissions, binding }) => {
      expect(
        await settlePendingReply({
          request: vetoed,
          pending: pending(),
          invocation: originalInvocation(coordinator),
        }),
      ).toEqual({ callId: 'call', state: 'complete' })
      expect(
        await settlePendingReply({
          request: vetoed,
          pending: pending(),
          invocation: originalInvocation(coordinator),
        }),
      ).toEqual({ callId: 'call', state: 'complete' })
      expect(
        await settlePendingReply({
          request: { session, callId: 'call', disposition: { consumed: { by: 'side_query' } } },
          pending: pending(),
          invocation: originalInvocation(coordinator),
        }),
      ).toEqual({ alreadyEnded: true })
      expect(submissions.map(item => item.count)).toEqual([2, 1])
      const readback = await binding.log.readSince(session, 0)
      if ('failure' in readback) throw new Error('readback unavailable')
      expect(readback.entries).toHaveLength(3)
    })
  })

  it('rejects persisted before coordinator submission', async () => {
    await controlled('service-settle-persisted', async ({ coordinator, submissions }) => {
      const illegal = { ...vetoed, disposition: 'persisted' } as unknown as SettleReplyInput
      expect(
        await settlePendingReply({
          request: illegal,
          pending: pending(),
          invocation: originalInvocation(coordinator),
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      const malformed = {
        ...vetoed,
        disposition: { consumed: { by: 'side_query' }, vetoed: { by: 'gate' } },
      } as unknown as SettleReplyInput
      expect(
        await settlePendingReply({
          request: malformed,
          pending: pending(),
          invocation: originalInvocation(coordinator),
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(submissions.map(item => item.count)).toEqual([2])
    })
  })

  it('retains an unknown append while a committed original is recognized on repeat', async () => {
    await controlled('service-settle-lost-ack', async ({ binding, owner, wrap, submissions }) => {
      const unknownReceipt: SessionLog = {
        ...binding.log,
        async append(...args) {
          await binding.log.append(...args)
          return { failure: 'unavailable' }
        },
      }
      const coordinator = createSettlementCoordinator({
        binding: wrap(unknownReceipt),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      try {
        expect(
          await settlePendingReply({
            request: vetoed,
            pending: pending(),
            invocation: originalInvocation(coordinator),
          }),
        ).toEqual({ unavailable: true })
        expect(
          await settlePendingReply({
            request: vetoed,
            pending: pending(),
            invocation: originalInvocation(coordinator),
          }),
        ).toEqual({ callId: 'call', state: 'complete' })
        expect(submissions.map(item => item.count)).toEqual([2, 1])
      } finally {
        await coordinator.close()
      }
    })
  })
})

describe('S-33 noRun recovered full-prefix read', () => {
  it('returns unavailable without partial state for a missing response, then reads a settled original without a new append', async () => {
    await controlled(
      'service-reconcile-no-run',
      async ({ binding, owner, coordinator, submissions }) => {
        let entered = 0
        let closed = 0
        const reconcile = createRuntimeReconcile({
          contention: policy(),
          recovery: {
            async enter() {
              entered++
              return {
                scope: {
                  binding: { log: binding } as SessionRuntimeBinding,
                  owner,
                  async close() {
                    closed++
                  },
                },
              }
            },
          },
        })
        expect(await reconcile({ session })).toEqual({ unavailable: true })
        const h = coordinator.settle(request)
        expect(await h.completion).toHaveProperty('settled')
        await h.stopped
        expect(await reconcile({ session })).toEqual({
          calls: [{ callId: 'call', state: 'complete' }],
        })
        expect(submissions.map(item => item.count)).toEqual([2, 2])
        expect(entered).toBe(2)
        expect(closed).toBe(2)
        expect(owner.active).toBe(0)
      },
    )
  })
})

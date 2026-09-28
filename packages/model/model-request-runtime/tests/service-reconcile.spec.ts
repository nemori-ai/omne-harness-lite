import { describe, expect, it, vi } from 'vitest'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import { createSettlementCoordinator } from '../src/settlement-coordinator.ts'
import { modelLogJsonEqual } from '../src/log-codec.ts'
import { inspectCurrentModelLogPrefix } from '../src/log-codec-settlement.ts'
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
  SystemStopControl,
  RuntimeRecoveryScope,
} from '../src/service-types.ts'
import type { AnchoredInvocationHandle } from '../src/anchored-invocation-types.ts'
import type { PlannedSemantics } from '../src/types.ts'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { dispatched as dispatchedFixture, prepare, session } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'
import { controlled, deferred, noWaitScheduler, policy, request } from './settlement-fixture.ts'

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
          // This S-49 fixture has already settled through the real coordinator before cleanup.
          systemStop: async (control: SystemStopControl<PlannedSemantics, never>) =>
            control.view().operation.phase === 'ready' ? { released: true } : { unavailable: true },
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
          observedFacts: () => ({ unavailable: true }),
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
                  originalInvocation: () => ({ absent: true }),
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

describe('S-33 retained recovery ownership', () => {
  it('keeps a late enter owned after close and never starts business work', async () => {
    await controlled('service-reconcile-late-enter', async ({ binding, owner, submissions }) => {
      const gate = deferred<{ scope: RuntimeRecoveryScope }>()
      let enters = 0
      let closes = 0
      const component = createRuntimeReconcile({
        contention: policy(),
        scheduler: noWaitScheduler,
        now: () => '2026-09-27T00:00:03Z',
        diagnostic() {},
        recovery: {
          enter() {
            enters++
            return gate.promise
          },
        },
      })
      const pending = component.reconcile({ session })
      await vi.waitFor(() => expect(enters).toBe(1))
      expect(await component.close()).toEqual({ unavailable: true })
      gate.resolve({
        scope: {
          binding: { log: binding } as SessionRuntimeBinding,
          owner,
          originalInvocation: () => ({ absent: true }),
          async close() {
            closes++
          },
        },
      })
      expect(await pending).toEqual({ unavailable: true })
      expect(await component.close()).toEqual({ released: true })
      expect(await component.close()).toEqual({ released: true })
      expect(closes).toBe(1)
      expect(enters).toBe(1)
      expect(submissions.map(item => item.count)).toEqual([2])
    })
  })

  it('retains the original scope while a read task has not actually stopped', async () => {
    await controlled('service-reconcile-held-read', async ({ binding, owner }) => {
      const barrier = deferred<void>()
      let scopeCloses = 0
      let otherCloses = 0
      let otherCloseAvailable = false
      const otherSession = unwrap(parseOpaqueIdentifier('other-held-read-session', 'SessionRef'))
      const component = createRuntimeReconcile({
        contention: policy(),
        scheduler: noWaitScheduler,
        now: () => '2026-09-27T00:00:03Z',
        diagnostic() {},
        recovery: {
          async enter(asked) {
            if (asked.session === otherSession)
              return {
                scope: {
                  binding: { log: { ...binding, session: otherSession } } as SessionRuntimeBinding,
                  owner,
                  originalInvocation: () => ({ absent: true }) as const,
                  async close() {
                    otherCloses++
                    if (!otherCloseAvailable) throw new Error('other exit unavailable')
                  },
                },
              }
            return {
              scope: {
                binding: { log: binding } as SessionRuntimeBinding,
                owner,
                originalInvocation: () => ({ absent: true }) as const,
                async close() {
                  scopeCloses++
                },
              },
            }
          },
        },
      })
      expect(await component.reconcile({ session: otherSession })).toEqual({ unavailable: true })
      expect(otherCloses).toBe(1)
      otherCloseAvailable = true
      const readsBefore = owner.starts.filter(kind => kind === 'read').length
      owner.stopBarrier = barrier.promise
      const pending = component.reconcile({ session })
      await vi.waitFor(() =>
        expect(owner.starts.filter(kind => kind === 'read').length).toBeGreaterThan(readsBefore),
      )
      const firstClose = component.close()
      const concurrentClose = component.close()
      expect(concurrentClose).toBe(firstClose)
      expect(await firstClose).toEqual({ unavailable: true })
      expect(scopeCloses).toBe(0)
      expect(otherCloses).toBe(2)
      expect(owner.active).toBe(1)
      barrier.resolve()
      expect(await pending).toEqual({ unavailable: true })
      expect(await component.close()).toEqual({ released: true })
      expect(scopeCloses).toBe(1)
      expect(owner.active).toBe(0)
    })
  })

  it('recognizes a committed no-dispatch ended record after an unknown receipt without reappend', async () => {
    await controlled(
      'service-reconcile-ended-unknown',
      async ({ binding, owner, wrap, coordinator, submissions }) => {
        const settled = coordinator.settle(request)
        expect(await settled.completion).toHaveProperty('settled')
        await settled.stopped
        const intent = prepare(
          'record',
          { kind: 'model_call_interrupt_intent', call: 'fresh-call', initiator: 'user' },
          { kind: 'record' },
        )
        const appendedIntent = await binding.log.append(
          session,
          [intent],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
        if ('failure' in appendedIntent) throw new Error('intent fixture')
        let endedWrites = 0
        const unknownEnded: SessionLog = {
          ...binding.log,
          async append(...args) {
            const actual = await binding.log.append(...args)
            if (writeJsonLossless(args[1]).includes('model_call_ended')) {
              endedWrites++
              return { failure: 'unavailable' }
            }
            return actual
          },
        }
        let scopeCloses = 0
        let enters = 0
        const component = createRuntimeReconcile({
          contention: { ...policy(), limits: { ...policy().limits, concurrent: 1 } },
          scheduler: noWaitScheduler,
          now: () => '2026-09-27T00:00:03Z',
          diagnostic() {},
          recovery: {
            async enter() {
              enters++
              return {
                scope: {
                  binding: { log: wrap(unknownEnded) } as SessionRuntimeBinding,
                  owner,
                  originalInvocation: () => ({ absent: true }) as const,
                  async close() {
                    scopeCloses++
                  },
                },
              }
            },
          },
        })
        expect(await component.reconcile({ session })).toEqual({ unavailable: true })
        expect(endedWrites).toBe(1)
        expect(scopeCloses).toBe(0)
        expect(owner.active).toBe(1)
        expect(await component.reconcile({ session })).toEqual({
          calls: [
            { callId: 'call', state: 'complete' },
            { callId: 'fresh-call', state: 'interrupted' },
          ],
        })
        expect(endedWrites).toBe(1)
        expect(enters).toBe(1)
        expect(scopeCloses).toBe(1)
        expect(owner.active).toBe(0)
        expect(submissions.map(item => item.count)).toEqual([2, 2, 1, 1])
        expect(await component.close()).toEqual({ released: true })
      },
    )
  })

  it('holds an unknown original response until the same binding reads its complete batch', async () => {
    await controlled(
      'service-reconcile-response-unknown',
      async ({ binding, owner, wrap, submissions }) => {
        let readable = true
        let responseWrites = 0
        const unknownResponse: SessionLog = {
          ...binding.log,
          async readSince(...args) {
            return readable ? binding.log.readSince(...args) : { failure: 'unavailable' }
          },
          async append(...args) {
            const actual = await binding.log.append(...args)
            if ('failure' in actual) return actual
            responseWrites++
            readable = false
            return { failure: 'unavailable' }
          },
        }
        let scopeCloses = 0
        let otherCloses = 0
        let otherCloseAvailable = false
        let enters = 0
        const otherSession = unwrap(parseOpaqueIdentifier('other-recovery-session', 'SessionRef'))
        const component = createRuntimeReconcile({
          contention: policy(),
          scheduler: noWaitScheduler,
          now: () => '2026-09-27T00:00:03Z',
          diagnostic() {},
          recovery: {
            async enter(asked) {
              enters++
              if (asked.session === otherSession)
                return {
                  scope: {
                    binding: {
                      log: { ...binding, session: otherSession },
                    } as SessionRuntimeBinding,
                    owner,
                    originalInvocation: () => ({ absent: true }) as const,
                    async close() {
                      otherCloses++
                      if (!otherCloseAvailable) throw new Error('other scope exit unavailable')
                    },
                  },
                }
              return {
                scope: {
                  binding: { log: wrap(unknownResponse) } as SessionRuntimeBinding,
                  owner,
                  originalInvocation: () => ({ absent: true }) as const,
                  async close() {
                    scopeCloses++
                  },
                },
              }
            },
          },
        })
        expect(await component.reconcile({ session })).toEqual({ unavailable: true })
        expect(responseWrites).toBe(1)
        expect(scopeCloses).toBe(0)
        expect(await component.reconcile({ session })).toEqual({ unavailable: true })
        expect(enters).toBe(1)
        expect(await component.reconcile({ session: otherSession })).toEqual({ unavailable: true })
        expect(otherCloses).toBe(1)
        expect(scopeCloses).toBe(0)
        otherCloseAvailable = true
        expect(await component.close()).toEqual({ unavailable: true })
        expect(scopeCloses).toBe(0)
        expect(otherCloses).toBe(2)
        readable = true
        expect(await component.close()).toEqual({ released: true })
        expect(scopeCloses).toBe(1)
        expect(enters).toBe(2)
        const raw = await binding.log.readSince(session, 0)
        if ('failure' in raw) throw new Error('actual response readback')
        const checked = inspectCurrentModelLogPrefix({
          session,
          tenant: binding.tenant,
          prefix: raw,
        })
        if (!('ok' in checked)) throw new Error('complete response batch')
        const actual = checked.ok.filter(item => item.captured.response !== null)
        expect(actual).toHaveLength(1)
        expect(actual[0]?.captured.response?.id).toBe('response')
        expect(actual[0]?.captured.response?.timing.sentAt).toBeNull()
        expect(submissions.map(item => item.count)).toEqual([2, 1])
        expect(owner.active).toBe(0)
      },
    )
  })

  it('keeps a response writer that was already appending when close sealed admission', async () => {
    await controlled(
      'service-reconcile-response-close-race',
      async ({ binding, owner, wrap, submissions }) => {
        const started = deferred<void>()
        const allowAppend = deferred<void>()
        let writes = 0
        const gated: SessionLog = {
          ...binding.log,
          async append(...args) {
            writes++
            started.resolve()
            await allowAppend.promise
            return binding.log.append(...args)
          },
        }
        let scopeCloses = 0
        const component = createRuntimeReconcile({
          contention: policy(),
          scheduler: noWaitScheduler,
          now: () => '2026-09-27T00:00:03Z',
          diagnostic() {},
          recovery: {
            async enter() {
              return {
                scope: {
                  binding: { log: wrap(gated) } as SessionRuntimeBinding,
                  owner,
                  originalInvocation: () => ({ absent: true }) as const,
                  async close() {
                    scopeCloses++
                  },
                },
              }
            },
          },
        })
        const pending = component.reconcile({ session })
        await started.promise
        expect(await component.close()).toEqual({ unavailable: true })
        expect(scopeCloses).toBe(0)
        allowAppend.resolve()
        expect(await pending).toEqual({ unavailable: true })
        expect(await component.close()).toEqual({ released: true })
        expect(scopeCloses).toBe(1)
        expect(writes).toBe(1)
        expect(submissions.map(item => item.count)).toEqual([2, 1])
        expect(owner.active).toBe(0)
      },
    )
  })
})

describe('S-33 noRun recovered full-prefix read', () => {
  it('cold-recovers a durable opened call with null actual send time and no resend', async () => {
    await controlled(
      'service-reconcile-no-run',
      async ({ binding, owner, coordinator, submissions }) => {
        let entered = 0
        let closed = 0
        const reconcile = createRuntimeReconcile({
          contention: policy(),
          scheduler: noWaitScheduler,
          now: () => '2026-09-27T00:00:03Z',
          diagnostic() {},
          recovery: {
            async enter() {
              entered++
              return {
                scope: {
                  binding: { log: binding } as SessionRuntimeBinding,
                  owner,
                  originalInvocation: () => ({ absent: true }),
                  async close() {
                    closed++
                  },
                },
              }
            },
          },
        })
        expect(await reconcile.reconcile({ session })).toEqual({
          calls: [{ callId: 'call', state: 'interrupted' }],
        })
        const raw = await binding.log.readSince(session, 0)
        if ('failure' in raw) throw new Error('recovered prefix')
        const inspected = inspectCurrentModelLogPrefix({
          session,
          tenant: binding.tenant,
          prefix: raw,
        })
        if (!('ok' in inspected)) throw new Error('recovered model prefix')
        const restored = inspected.ok.find(item => item.captured.response !== null)?.captured
          .response
        expect(restored?.timing.sentAt).toBeNull()
        expect(restored?.timing.firstTokenAt).toBe('2026-09-27T00:00:01Z')
        expect(restored?.usage.input_tokens).toBe('unknown')
        expect(restored?.cost.cost_usd).toBe('unknown')
        const h = coordinator.settle(request)
        expect(await h.completion).toMatchObject({ settled: { mode: 'read' } })
        await h.stopped
        expect(await reconcile.reconcile({ session })).toEqual({
          calls: [{ callId: 'call', state: 'interrupted' }],
        })
        expect(submissions.map(item => item.count)).toEqual([2, 1])
        expect(entered).toBe(2)
        expect(closed).toBe(2)
        expect(owner.active).toBe(0)
      },
    )
  })
  it('recognizes an original complete batch before asking for original handle facts', async () => {
    await controlled(
      'service-reconcile-original-winner',
      async ({ binding, owner, coordinator, submissions }) => {
        const task = coordinator.settle(request)
        expect(await task.completion).toHaveProperty('settled')
        await task.stopped
        let queried = 0
        const reconcile = createRuntimeReconcile({
          contention: policy(),
          scheduler: noWaitScheduler,
          now: () => '2026-09-27T00:00:03Z',
          diagnostic() {},
          recovery: {
            async enter() {
              return {
                scope: {
                  binding: { log: binding } as SessionRuntimeBinding,
                  owner,
                  originalInvocation: () => {
                    queried++
                    return { unavailable: true } as const
                  },
                  async close() {},
                },
              }
            },
          },
        })
        expect(await reconcile.reconcile({ session })).toEqual({
          calls: [{ callId: 'call', state: 'complete' }],
        })
        expect(await reconcile.reconcile({ session })).toEqual({
          calls: [{ callId: 'call', state: 'complete' }],
        })
        expect(queried).toBe(0)
        expect(submissions.map(item => item.count)).toEqual([2, 2])
        expect(owner.active).toBe(0)
      },
    )
  })
  it('withholds all calls on one unavailable original, then resumes only unresolved rows', async () => {
    await controlled('service-reconcile-partial', async ({ binding, owner, submissions }) => {
      const additional = prepare(
        'record',
        {
          ...dispatchedFixture,
          call: 'second-call',
          response: 'second-response',
        },
        { kind: 'record' },
      )
      const added = await binding.log.append(
        session,
        [additional],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in added) throw new Error('second durable dispatch')
      let secondAvailable = false
      let enters = 0
      const reconcile = createRuntimeReconcile({
        contention: policy(),
        scheduler: noWaitScheduler,
        now: () => '2026-09-27T00:00:03Z',
        diagnostic() {},
        recovery: {
          async enter() {
            enters++
            return {
              scope: {
                binding: { log: binding } as SessionRuntimeBinding,
                owner,
                originalInvocation: (key: { callId: string }) =>
                  key.callId === 'second-call' && !secondAvailable
                    ? ({ unavailable: true } as const)
                    : ({ absent: true } as const),
                async close() {},
              },
            }
          },
        },
      })
      expect(await reconcile.reconcile({ session })).toEqual({ unavailable: true })
      expect(submissions.map(item => item.count)).toEqual([2, 1, 1])
      secondAvailable = true
      expect(await reconcile.reconcile({ session })).toEqual({
        calls: [
          { callId: 'call', state: 'interrupted' },
          { callId: 'second-call', state: 'resumable' },
        ],
      })
      expect(submissions.map(item => item.count)).toEqual([2, 1, 1, 1])
      expect(enters).toBe(1)
      expect(owner.active).toBe(0)
    })
  })
  it('preserves stable original send, account and header facts after an opened call', async () => {
    await controlled(
      'service-reconcile-original-facts',
      async ({ binding, owner, submissions }) => {
        const original: AnchoredInvocationHandle = {
          outcome: Promise.resolve({ unavailable: true }),
          snapshot: () => ({ blocks: [], position: 0 }),
          abort() {},
          observedFacts(target) {
            if (
              target.call !== 'call' ||
              target.response !== 'response' ||
              !modelLogJsonEqual(target.dispatch, 1)
            )
              return { unavailable: true }
            return {
              facts: {
                sentAt: '2026-09-27T00:00:00Z',
                upstreamRequestId: 'actual-upstream-request',
                usage: {
                  input_tokens: 0,
                  output_tokens: 2,
                  cache_read_tokens: 'unknown',
                  cache_write_tokens: 0,
                  source: 'upstream',
                },
                cost: {
                  cost_usd: new LosslessNumber('0.0000000000000000000000000310'),
                  source: 'upstream_usage',
                },
                rawHeaders: { 'x-actual': ['first', 'second'] },
              },
            }
          },
          async settleReply() {
            return { unavailable: true, reason: 'candidate' }
          },
          async close() {
            return { released: true }
          },
        }
        const reconcile = createRuntimeReconcile({
          contention: policy(),
          scheduler: noWaitScheduler,
          now: () => '2026-09-27T00:00:03Z',
          diagnostic() {},
          recovery: {
            async enter() {
              return {
                scope: {
                  binding: { log: binding } as SessionRuntimeBinding,
                  owner,
                  originalInvocation: () => ({ original }),
                  async close() {},
                },
              }
            },
          },
        })
        expect(await reconcile.reconcile({ session })).toEqual({
          calls: [{ callId: 'call', state: 'interrupted' }],
        })
        const raw = await binding.log.readSince(session, 0)
        if ('failure' in raw) throw new Error('actual prefix')
        const checked = inspectCurrentModelLogPrefix({
          session,
          tenant: binding.tenant,
          prefix: raw,
        })
        if (!('ok' in checked)) throw new Error('actual model prefix')
        const response = checked.ok.find(item => item.captured.response !== null)?.captured.response
        expect(response?.timing.sentAt).toBe('2026-09-27T00:00:00Z')
        expect(response?.usage.input_tokens).toBe(0)
        expect(writeJsonLossless(response?.cost.cost_usd)).toBe('0.0000000000000000000000000310')
        expect(response?.raw).toEqual({ headers: { 'x-actual': ['first', 'second'] } })
        expect(response?.route.upstreamRequestId).toBe('actual-upstream-request')
        expect(submissions.map(item => item.count)).toEqual([2, 1])
      },
    )
  })
})

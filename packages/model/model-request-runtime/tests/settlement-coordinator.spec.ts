import { describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import {
  createSettlementCoordinator,
  readSettlementPrefix,
  interpretSettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import {
  openJsonlSessionLog,
  type SessionLog,
  type AppendResult,
} from '@omne-harness-lite/session-log-jsonl'
import { join } from 'node:path'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { response, anchors, session } from './log-codec-fixture.ts'
import { batchV2, responseV5 } from './log-codec-v2-fixture.ts'
import {
  controlled,
  ControlledSettlementOwner,
  deferred,
  noWaitScheduler,
  policy,
  request,
} from './settlement-fixture.ts'

function noReply(): JsonObject {
  const { reply: _reply, replyDisposition: _disposition, ...base } = responseV5
  return { ...base, outcome: 'interrupted', initiator: 'runtime_lost' }
}
describe('A1a actual SQL/SL3 coordinator; controlled all-writer scope', () => {
  it('once whole [M,R], exact MR5 original value and close/reopen', async () => {
    await controlled('whole', async ({ coordinator, binding, owner, submissions, dir, reopen }) => {
      const handle = coordinator.settle(request)
      const result = await handle.completion
      expect(result).toHaveProperty('settled')
      await handle.stopped
      expect(owner.active).toBe(0)
      expect(owner.releases).toBe(1)
      expect(submissions.map(x => x.count)).toEqual([2, 2])
      expect(
        submissions.every(
          x =>
            modelLogJsonEqual(x.fence, { kind: 'unfenced' }) &&
            modelLogJsonEqual(x.condition, { kind: 'unconditional' }),
        ),
      ).toBe(true)
      const second = coordinator.settle(request)
      expect(await second.completion).toMatchObject({ origin: 'recognized' })
      await second.stopped
      expect(submissions).toHaveLength(2)
      await coordinator.close()
      // The actual log owner must close independently; this coordinator does not own it.
      const prefix = await binding.log.readSince(session, 0)
      expect(prefix).toHaveProperty('tail', 4)
      const reopened = await reopen()
      const restored = createSettlementCoordinator({
        binding: reopened,
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const recognized = restored.settle(request)
      const original = await recognized.completion
      expect(original).toMatchObject({ origin: 'recognized' })
      if (!('settled' in original)) throw new Error('reopened original')
      expect(writeJsonLossless(original.settled.response.value)).toBe(writeJsonLossless(responseV5))
      await recognized.stopped
      await restored.close()
      expect(submissions).toHaveLength(2)
      expect(dir).toContain('whole-')
    })
  })
  it('no reply is a single R append, never a fake message', async () => {
    await controlled('single', async ({ binding, owner, submissions }) => {
      const coordinator = createSettlementCoordinator({
        binding,
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const handle = coordinator.settle({
        ...request,
        current: { messageId: null, disposition: null },
        response: noReply(),
      })
      expect(await handle.completion).toHaveProperty('settled')
      await handle.stopped
      await coordinator.close()
      expect(submissions.map(x => x.count)).toEqual([2, 1])
    })
  })
  for (const first of ['single', 'persisted'])
    it(`${first} winner remains original, loser has zero orphan M`, async () => {
      await controlled(`race-${first}`, async ({ binding, owner, submissions }) => {
        const coordinator = createSettlementCoordinator({
          binding,
          owner,
          settlementContention: policy(),
          settlementScheduler: noWaitScheduler,
          diagnostic() {},
        })
        const single = {
          ...request,
          current: { messageId: null, disposition: null },
          response: noReply(),
        }
        const winner = coordinator.settle(first === 'single' ? single : request)
        expect(await winner.completion).toHaveProperty('settled')
        await winner.stopped
        const loser = coordinator.settle(first === 'single' ? request : single)
        const result = await loser.completion
        expect(result).toMatchObject({ origin: 'recognized' })
        await loser.stopped
        if (!('settled' in result)) throw new Error('settled original')
        expect(
          modelLogJsonEqual(
            result.settled.response.value,
            first === 'single' ? single.response : responseV5,
          ),
        ).toBe(true)
        expect(submissions.map(x => x.count)).toEqual([2, first === 'single' ? 1 : 2])
        await coordinator.close()
      })
    })
  it('actual committed lost ack recognizes the original while retaining unknown receipt', async () => {
    await controlled('lost-ack', async ({ binding, owner, wrap, submissions }) => {
      const uncertain: SessionLog = {
        ...binding.log,
        async append(...args) {
          await binding.log.append(...args)
          return { failure: 'unavailable' }
        },
      }
      const coordinator = createSettlementCoordinator({
        binding: wrap(uncertain),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      expect(await first.completion).toMatchObject({ unavailable: true, reason: 'write_unknown' })
      await first.stopped
      const second = coordinator.settle(request)
      expect(await second.completion).toMatchObject({ origin: 'recognized' })
      await second.stopped
      expect(submissions).toHaveLength(2)
      await coordinator.close()
    })
  })
  it('uncommitted unknown is never absence permission to resubmit', async () => {
    await controlled('unknown-absent', async ({ binding, owner, wrap, submissions }) => {
      let tries = 0
      const uncertain: SessionLog = {
        ...binding.log,
        async append() {
          tries++
          return { failure: 'unavailable' }
        },
      }
      const coordinator = createSettlementCoordinator({
        binding: wrap(uncertain),
        owner,
        settlementContention: policy(2),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      for (let n = 0; n < 2; n++) {
        const h = coordinator.settle(request)
        expect(await h.completion).toMatchObject({ unavailable: true, reason: 'write_unknown' })
        await h.stopped
      }
      expect(tries).toBe(1)
      expect(submissions).toHaveLength(1)
      await coordinator.close()
    })
  })
  it('opened unknown strong gate writes no response even with a complete prefix', async () => {
    await controlled('opened-unknown', async ({ coordinator, owner, submissions }) => {
      const stop = deferred<void>()
      owner.openedState = {
        unknown: {
          completion: Promise.resolve('unknown'),
          stopped: stop.promise,
          requestStop() {},
        },
      }
      const h = coordinator.settle(request)
      expect(await h.completion).toMatchObject({ reason: 'opened_unknown' })
      await h.stopped
      expect(submissions).toHaveLength(1)
      stop.resolve()
    })
  })
  it('response completion/abort is not stopped and owner permit stays live', async () => {
    await controlled('live-owner', async ({ coordinator, owner }) => {
      const barrier = deferred<void>()
      owner.stopBarrier = barrier.promise
      const h = coordinator.settle(request)
      expect(await h.completion).toHaveProperty('settled')
      h.requestStop()
      expect(owner.active).toBe(1)
      expect(owner.releases).toBe(0)
      let stopped = false
      h.stopped.then(() => {
        stopped = true
      })
      await Promise.resolve()
      expect(stopped).toBe(false)
      barrier.resolve()
      await h.stopped
      expect(owner.active).toBe(0)
    })
  })
  for (const limit of ['submissions', 'elapsedMs', 'retainedBytes'])
    it(`${limit}=0 stops without response append`, async () => {
      await controlled(`zero-${limit}`, async ({ binding, owner, submissions }) => {
        const selected = policy()
        const coordinator = createSettlementCoordinator({
          binding,
          owner,
          settlementContention: { ...selected, limits: { ...selected.limits, [limit]: 0 } },
          settlementScheduler: noWaitScheduler,
          diagnostic() {},
        })
        const h = coordinator.settle(request)
        expect(await h.completion).toMatchObject({ reason: 'budget' })
        await h.stopped
        await coordinator.close()
        expect(submissions).toHaveLength(1)
      })
    })
  it('illegal/thrown policy and diagnostic failure do not change durable facts', async () => {
    await controlled('policy-sink', async ({ binding, owner, submissions }) => {
      const bad = createSettlementCoordinator({
        binding,
        owner,
        settlementContention: {
          ...policy(),
          decide() {
            throw new Error('secret policy payload')
          },
        },
        settlementScheduler: noWaitScheduler,
        diagnostic() {
          throw new Error('sink')
        },
      })
      const h = bad.settle(request)
      expect(await h.completion).toMatchObject({ reason: 'policy' })
      await h.stopped
      await bad.close()
      expect(submissions).toHaveLength(1)
      const good = createSettlementCoordinator({
        binding,
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {
          throw new Error('sink')
        },
      })
      const pass = good.settle(request)
      expect(await pass.completion).toHaveProperty('settled')
      await pass.stopped
      await good.close()
    })
  })
  it('wrong generation, tenant and session cannot become a full prefix', async () => {
    await controlled('prefix', async ({ binding, owner }) => {
      const grant = owner.acquire(2)
      if ('unavailable' in grant) throw new Error('grant')
      const rotated = { ...binding, currentGeneration: () => Object.freeze({}) }
      expect(
        await readSettlementPrefix({ binding: rotated, registration: grant.registration }),
      ).toMatchObject({ reason: 'generation' })
      const read = await readSettlementPrefix({ binding, registration: grant.registration })
      if (!('prefix' in read)) throw new Error('full prefix')
      expect(
        interpretSettlementPrefix({
          prefix: read.prefix,
          target: request.target,
          current: request.current,
        }),
      ).toHaveProperty('facts')
      grant.registration.release()
    })
  })
})

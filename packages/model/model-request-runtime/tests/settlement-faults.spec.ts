import { describe, expect, it } from 'vitest'
import { LosslessNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import {
  createSettlementCoordinator,
  readSettlementPrefix,
  type SettlementScheduler,
  type SettlementOwner,
} from '@omne-harness-lite/model-request-runtime'
import {
  modelLogJsonEqual,
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime/log-codec/v2'
import type { SessionLog, AppendResult } from '@omne-harness-lite/session-log-jsonl'
import { anchors, reply, session, jsonObject } from './log-codec-fixture.ts'
import { batchV2, responseV5 } from './log-codec-v2-fixture.ts'
import {
  controlled,
  ControlledSettlementOwner,
  deferred,
  noWaitScheduler,
  policy,
  request,
} from './settlement-fixture.ts'

function lostReply(): JsonObject {
  const { reply: _reply, replyDisposition: _disposition, ...rest } = responseV5
  return { ...rest, outcome: 'interrupted', initiator: 'runtime_lost' }
}
function otherTenant() {
  const parsed = parseTenantId({ organization: 'other', account: 'other' })
  if (!('ok' in parsed)) throw new Error('tenant')
  return parsed.ok
}
describe('A1a actual IO fault boundaries; no production G29/G30 claim', () => {
  for (const winner of ['single', 'persisted'])
    it(`actual concurrent ${winner} winner leaves no orphan or second account`, async () => {
      await controlled(`concurrent-${winner}`, async ({ binding, owner, wrap, submissions }) => {
        const release = deferred<void>(),
          both = deferred<void>()
        let calls = 0
        const source: SessionLog = {
          ...binding.log,
          async append(...args) {
            calls++
            if (calls === 2) both.resolve()
            await release.promise
            return await binding.log.append(...args)
          },
        }
        const coordinator = createSettlementCoordinator({
          binding: wrap(source),
          owner,
          settlementContention: policy(),
          settlementScheduler: noWaitScheduler,
          diagnostic() {},
        })
        const single = {
          ...request,
          current: { messageId: null, disposition: null },
          response: lostReply(),
        }
        const first = coordinator.settle(winner === 'single' ? single : request)
        const second = coordinator.settle(winner === 'single' ? request : single)
        await both.promise
        expect(owner.active).toBe(2)
        release.resolve()
        const a = await first.completion,
          b = await second.completion
        expect(a).toMatchObject({ origin: 'appended' })
        expect(b).toMatchObject({ origin: 'recognized' })
        if (!('settled' in b)) throw new Error('winner')
        expect(
          modelLogJsonEqual(
            b.settled.response.value,
            winner === 'single' ? single.response : responseV5,
          ),
        ).toBe(true)
        await first.stopped
        await second.stopped
        await coordinator.close()
        const raw = await binding.log.readSince(session, 0)
        if ('failure' in raw) throw new Error('read')
        expect(raw.entries.length).toBe(winner === 'single' ? 3 : 4)
        expect(submissions).toHaveLength(3)
      })
    })
  it('old unknown writer can arrive late: absence/THIS rejection cannot close its ownership', async () => {
    await controlled('late-writer', async ({ binding, owner, wrap, submissions }) => {
      const startLate = deferred<void>(),
        realStop = deferred<void>()
      let actual: Promise<AppendResult> | undefined,
        tries = 0
      owner.stopBarrier = realStop.promise
      const source: SessionLog = {
        ...binding.log,
        async append(...args) {
          tries++
          actual = (async () => {
            await startLate.promise
            return await binding.log.append(...args)
          })()
          actual.then(
            () => realStop.resolve(),
            () => realStop.resolve(),
          )
          return { failure: 'unavailable' }
        },
      }
      const coordinator = createSettlementCoordinator({
        binding: wrap(source),
        owner,
        settlementContention: policy(2),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      expect(await first.completion).toMatchObject({ reason: 'write_unknown' })
      const second = coordinator.settle(request)
      expect(await second.completion).toMatchObject({ reason: 'write_unknown' })
      expect(tries).toBe(1)
      expect(owner.releases).toBe(0)
      expect(owner.active).toBe(2)
      // A different THIS submission is rejected while the old writer is still registered.
      const already = await binding.log.append(
        session,
        anchors().entries.map(({ session: _s, position: _p, ...entry }) => entry),
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      expect(already).toMatchObject({ failure: 'alreadyRecorded' })
      expect(owner.active).toBe(2)
      startLate.resolve()
      const committed = await actual
      expect(committed).toHaveProperty('positions')
      await first.stopped
      await second.stopped
      const after = coordinator.settle(request)
      expect(await after.completion).toMatchObject({ origin: 'recognized' })
      await after.stopped
      await coordinator.close()
      expect(tries).toBe(1)
      expect(submissions).toHaveLength(3)
    })
  })
  for (const fault of ['gap', 'tail', 'session', 'tenant'])
    it(`full prefix rejects ${fault} and never appends`, async () => {
      await controlled(`invalid-${fault}`, async ({ binding, owner, wrap, submissions }) => {
        const alternateSession = parseOpaqueIdentifier('another-session', 'SessionRef')
        if (!('ok' in alternateSession)) throw new Error('session')
        const source: SessionLog = {
          ...binding.log,
          async readSince(...args) {
            const result = await binding.log.readSince(...args)
            if ('failure' in result) return result
            return {
              entries:
                fault === 'gap'
                  ? result.entries.slice(1)
                  : result.entries.map(entry =>
                      fault === 'session'
                        ? { ...entry, session: alternateSession.ok }
                        : fault === 'tenant'
                          ? { ...entry, tenant: otherTenant() }
                          : entry,
                    ),
              tail: fault === 'tail' ? new LosslessNumber('9007199254740993') : result.tail,
            }
          },
        }
        const coordinator = createSettlementCoordinator({
          binding: wrap(source),
          owner,
          settlementContention: policy(),
          settlementScheduler: noWaitScheduler,
          diagnostic() {},
        })
        const h = coordinator.settle(request)
        expect(await h.completion).toMatchObject({ reason: 'prefix' })
        await h.stopped
        await coordinator.close()
        expect(submissions).toHaveLength(1)
      })
    })
  it('generation replacement while a read waits invalidates its exact response', async () => {
    await controlled('rotating', async ({ binding, owner, submissions }) => {
      const entered = deferred<void>(),
        release = deferred<void>()
      let current = binding.generation
      const source: SessionLog = {
        ...binding.log,
        async readSince(...args) {
          const result = await binding.log.readSince(...args)
          entered.resolve()
          await release.promise
          return result
        },
      }
      const coordinator = createSettlementCoordinator({
        binding: { ...binding, log: source, currentGeneration: () => current },
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const h = coordinator.settle(request)
      await entered.promise
      current = Object.freeze({})
      release.resolve()
      expect(await h.completion).toMatchObject({ reason: 'generation' })
      await h.stopped
      await coordinator.close()
      expect(submissions).toHaveLength(1)
    })
  })
  for (const fault of ['binding', 'parameters', 'timing', 'reply'])
    it(`candidate ${fault} mismatches are not repaired`, async () => {
      await controlled(`candidate-${fault}`, async ({ coordinator, submissions }) => {
        let value: JsonObject = responseV5
        if (fault === 'binding')
          value = {
            ...value,
            route: { ...jsonObject(responseV5.route ?? null), provider: 'second' },
          }
        if (fault === 'parameters')
          value = {
            ...value,
            route: { ...jsonObject(responseV5.route ?? null), parameters: { temperature: 9 } },
          }
        if (fault === 'timing')
          value = {
            ...value,
            timing: {
              sentAt: '2026-09-27T00:00:00Z',
              firstTokenAt: '2026-09-27T00:00:01.001Z',
              endedAt: '2026-09-27T00:00:02Z',
            },
          }
        if (fault === 'reply')
          value = { ...value, reply: { ...reply, response: 'different-response' } }
        const h = coordinator.settle({ ...request, response: value })
        expect(await h.completion).toHaveProperty('unavailable', true)
        await h.stopped
        expect(submissions).toHaveLength(1)
      })
    })
  it('same-owner concurrency has no hidden pending queue', async () => {
    await controlled('concurrency', async ({ binding, owner, wrap, submissions }) => {
      const entered = deferred<void>(),
        release = deferred<void>()
      const source: SessionLog = {
        ...binding.log,
        async readSince(...args) {
          entered.resolve()
          await release.promise
          return await binding.log.readSince(...args)
        },
      }
      const selected = policy()
      const coordinator = createSettlementCoordinator({
        binding: wrap(source),
        owner,
        settlementContention: { ...selected, limits: { ...selected.limits, concurrent: 1 } },
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const first = coordinator.settle(request)
      await entered.promise
      const second = coordinator.settle(request)
      expect(await second.completion).toMatchObject({ reason: 'concurrent' })
      await second.stopped
      expect(owner.starts).toEqual(['read'])
      release.resolve()
      expect(await first.completion).toHaveProperty('settled')
      await first.stopped
      await coordinator.close()
      expect(submissions).toHaveLength(2)
    })
  })
  it('config and exact budgets are captured, including beyond safe-integer precision', async () => {
    await controlled('budget-snapshot', async ({ binding, owner, wrap }) => {
      const entered = deferred<void>(),
        release = deferred<void>()
      const source: SessionLog = {
        ...binding.log,
        async readSince(...args) {
          entered.resolve()
          await release.promise
          return await binding.log.readSince(...args)
        },
      }
      const limits = {
        submissions: new LosslessNumber('1.0'),
        elapsedMs: new LosslessNumber('9007199254740993.125'),
        retainedBytes: new LosslessNumber('9007199254740993'),
        concurrent: new LosslessNumber('2.0'),
      }
      const coordinator = createSettlementCoordinator({
        binding: wrap(source),
        owner,
        settlementContention: {
          name: 'explicit-exact',
          limits,
          decide: () => ({ proceed: { waitMs: 0 } }),
        },
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const h = coordinator.settle(request)
      await entered.promise
      limits.submissions = new LosslessNumber('0')
      limits.retainedBytes = new LosslessNumber('0')
      release.resolve()
      expect(await h.completion).toHaveProperty('settled')
      await h.stopped
      await coordinator.close()
    })
  })
  it('elapsed budget is never reset after real read cost', async () => {
    await controlled('elapsed', async ({ binding, owner, wrap, submissions }) => {
      let now = 0
      const source: SessionLog = {
        ...binding.log,
        async readSince(...args) {
          const result = await binding.log.readSince(...args)
          now = 100001
          return result
        },
      }
      const coordinator = createSettlementCoordinator({
        binding: wrap(source),
        owner,
        settlementContention: policy(),
        settlementScheduler: { ...noWaitScheduler, nowMonotonicMs: () => now },
        diagnostic() {},
      })
      const h = coordinator.settle(request)
      expect(await h.completion).toMatchObject({ reason: 'budget' })
      await h.stopped
      await coordinator.close()
      expect(submissions).toHaveLength(1)
    })
  })
  it('cancelled wait retains the actual timer owner until stopped; no append', async () => {
    await controlled('wait-stop', async ({ binding, owner, submissions }) => {
      const started = deferred<void>(),
        end = deferred<'elapsed' | 'cancelled'>(),
        stopped = deferred<void>()
      let requested = 0
      const scheduler: SettlementScheduler = {
        nowMonotonicMs: () => 0,
        wait(_ms, signal) {
          started.resolve()
          const cancel = () => end.resolve('cancelled')
          signal.addEventListener('abort', cancel, { once: true })
          return {
            completion: end.promise,
            requestStop() {
              requested++
              end.resolve('cancelled')
            },
            stopped: stopped.promise.then(() => {
              signal.removeEventListener('abort', cancel)
            }),
          }
        },
      }
      const coordinator = createSettlementCoordinator({
        binding,
        owner,
        settlementContention: {
          ...policy(),
          decide: () => ({ proceed: { waitMs: new LosslessNumber('1.25') } }),
        },
        settlementScheduler: scheduler,
        diagnostic() {},
      })
      const h = coordinator.settle(request)
      await started.promise
      h.requestStop()
      expect(owner.active).toBe(1)
      stopped.resolve()
      expect(await h.completion).toHaveProperty('unavailable', true)
      await h.stopped
      await coordinator.close()
      expect(requested).toBeGreaterThan(0)
      expect(submissions).toHaveLength(1)
    })
  })
  it('missing port is unavailable; malformed policy is startup failure, never defaulted', async () => {
    await controlled('missing-policy', async ({ binding, owner }) => {
      const absent = createSettlementCoordinator({ binding, owner, diagnostic() {} })
      const h = absent.settle(request)
      expect(await h.completion).toMatchObject({ reason: 'dependency' })
      await h.stopped
      await absent.close()
      expect(() =>
        createSettlementCoordinator({
          binding,
          owner,
          settlementContention: { ...policy(), limits: { ...policy().limits, concurrent: 0 } },
          settlementScheduler: noWaitScheduler,
          diagnostic() {},
        }),
      ).toThrow(TypeError)
    })
  })
  for (const obstacle of ['orphanMessage', 'partialKey', 'unknownFormat'])
    it(`${obstacle} cannot be completed or repaired`, async () => {
      await controlled(`obstacle-${obstacle}`, async ({ binding, coordinator, submissions }) => {
        const batch = batchV2()
        const first = batch[0],
          last = batch[1]
        if (first === undefined || last === undefined) throw new Error('whole batch fixture')
        const bad =
          obstacle === 'orphanMessage'
            ? first
            : {
                ...last,
                payload: {
                  format: obstacle === 'unknownFormat' ? 'mrr/999' : 'external',
                  category: 'response',
                  value: responseV5,
                },
              }
        expect(
          await binding.log.append(session, [bad], { kind: 'unfenced' }, { kind: 'unconditional' }),
        ).toHaveProperty('positions')
        const h = coordinator.settle(request)
        expect(await h.completion).toHaveProperty('unavailable', true)
        await h.stopped
        expect(submissions).toHaveLength(2)
      })
    })
  it('withRun is unavailable without the formal Run owner; unknown is not false', async () => {
    await controlled('with-run-unknown', async ({ binding, owner, submissions }) => {
      const newSession = parseOpaqueIdentifier('controlled-with-run', 'SessionRef')
      if (!('ok' in newSession)) throw new Error('session')
      const originals = anchors().entries.map(entry => {
        const captured = captureModelLogValue({
          category: 'record',
          input: { kind: 'value', value: jsonObject(entry.payload).value },
        })
        if (!('ok' in captured)) throw new Error('withRun record capture')
        const prepared = prepareModelLogEntry({
          session: newSession.ok,
          shell: { tenant: binding.tenant, run: 'controlled-run', attempt: 1 },
          captured: captured.ok,
          purpose: { kind: 'record' },
          messagePrefix: [],
        })
        if (!('ok' in prepared)) throw new Error('withRun record prepare')
        return prepared.ok
      })
      expect(
        await binding.log.append(
          newSession.ok,
          originals,
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      const coordinator = createSettlementCoordinator({
        binding: { ...binding, session: newSession.ok },
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const h = coordinator.settle(request)
      expect(await h.completion).toMatchObject({ reason: 'run_history_unavailable' })
      await h.stopped
      await coordinator.close()
      expect(submissions).toHaveLength(2)
    })
  })
  it('post-send current binding/accounting never overwrite a lawful first batch', async () => {
    await controlled('first-original', async ({ coordinator, submissions }) => {
      const h = coordinator.settle(request)
      expect(await h.completion).toHaveProperty('settled')
      await h.stopped
      const value = {
        ...responseV5,
        cost: { cost_usd: 99, source: 'upstream_usage' },
        route: { ...jsonObject(responseV5.route ?? null), provider: 'second' },
      }
      const later = coordinator.settle({ ...request, response: value })
      const result = await later.completion
      expect(result).toMatchObject({ origin: 'recognized' })
      if (!('settled' in result)) throw new Error('original')
      expect(modelLogJsonEqual(result.settled.response.value, responseV5)).toBe(true)
      await later.stopped
      expect(submissions).toHaveLength(2)
    })
  })
  for (const problem of ['illegalDecision', 'backwardsClock'])
    it(`${problem} stops without model failure or new append`, async () => {
      await controlled(`bad-${problem}`, async ({ binding, owner, submissions }) => {
        let readings = 0
        const invalid = { proceed: { waitMs: 0 }, invented: true }
        const coordinator = createSettlementCoordinator({
          binding,
          owner,
          settlementContention: {
            ...policy(),
            decide() {
              return problem === 'illegalDecision' ? invalid : { proceed: { waitMs: 0 } }
            },
          },
          settlementScheduler: {
            ...noWaitScheduler,
            nowMonotonicMs() {
              readings++
              return readings === 1 ? 5 : 4
            },
          },
          diagnostic() {},
        })
        const h = coordinator.settle(request)
        expect(await h.completion).toMatchObject({ reason: 'policy' })
        await h.stopped
        await coordinator.close()
        expect(submissions).toHaveLength(1)
      })
    })
  it('close cannot announce stopped or free a read owner while its real read is live', async () => {
    await controlled('close-read', async ({ binding, owner, wrap, submissions }) => {
      const entered = deferred<void>(),
        release = deferred<void>()
      const source: SessionLog = {
        ...binding.log,
        async readSince(...args) {
          entered.resolve()
          await release.promise
          return await binding.log.readSince(...args)
        },
      }
      const coordinator = createSettlementCoordinator({
        binding: wrap(source),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const h = coordinator.settle(request)
      await entered.promise
      let done = false
      const closing = coordinator.close().then(() => {
        done = true
      })
      await Promise.resolve()
      expect(done).toBe(false)
      expect(owner.releases).toBe(0)
      release.resolve()
      expect(await h.completion).toMatchObject({ reason: 'closed' })
      await h.stopped
      await closing
      expect(owner.active).toBe(0)
      expect(submissions).toHaveLength(1)
    })
  })
  it('mutable response/current source cannot alter the originally captured candidate', async () => {
    await controlled('candidate-snapshot', async ({ binding, owner, wrap }) => {
      const entered = deferred<void>(),
        release = deferred<void>()
      const source: SessionLog = {
        ...binding.log,
        async readSince(...args) {
          entered.resolve()
          await release.promise
          return await binding.log.readSince(...args)
        },
      }
      const mutableResponse = {
          ...responseV5,
          cost: {
            cost_usd: new LosslessNumber('0.12345678901234567890'),
            source: 'upstream_usage',
          },
        },
        current = { messageId: 'winner-message', disposition: 'persisted' as const }
      const coordinator = createSettlementCoordinator({
        binding: wrap(source),
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const h = coordinator.settle({ ...request, current, response: mutableResponse })
      await entered.promise
      mutableResponse.cost.cost_usd = new LosslessNumber('999')
      current.messageId = 'changed-after-read'
      release.resolve()
      const result = await h.completion
      expect(result).toHaveProperty('settled')
      if (!('settled' in result)) throw new Error('captured result')
      expect(
        modelLogJsonEqual(jsonObject(result.settled.response.value).cost, {
          cost_usd: new LosslessNumber('0.12345678901234567890'),
          source: 'upstream_usage',
        }),
      ).toBe(true)
      await h.stopped
      await coordinator.close()
    })
  })
  for (const receipt of [
    {},
    { positions: [3], tail: 3 },
    { positions: [3, 5], tail: 5 },
    { positions: [3, 4], tail: 99 },
  ])
    it(`malformed success receipt ${JSON.stringify(receipt)} is never settled`, async () => {
      await controlled('bad-receipt', async ({ binding, owner, submissions }) => {
        // Deliberate JavaScript boundary input; no assertion widens a compliant typed port.
        const coordinator = Reflect.apply(createSettlementCoordinator, undefined, [
          {
            binding: {
              ...binding,
              log: {
                ...binding.log,
                async append() {
                  return receipt
                },
              },
            },
            owner,
            settlementContention: policy(2),
            settlementScheduler: noWaitScheduler,
            diagnostic() {},
          },
        ])
        const first = coordinator.settle(request)
        expect(await first.completion).toMatchObject({ reason: 'write_unknown' })
        await first.stopped
        const second = coordinator.settle(request)
        expect(await second.completion).toMatchObject({ reason: 'write_unknown' })
        await second.stopped
        await coordinator.close()
        expect(submissions).toHaveLength(1)
      })
    })
})

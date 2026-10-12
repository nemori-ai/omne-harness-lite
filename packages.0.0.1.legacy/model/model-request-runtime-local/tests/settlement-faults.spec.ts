import { readAttemptStarted } from '@omne-harness-lite/session-runtime'
import { modelValue, modelCategory } from './log-codec-fixture.ts'
import { prepareAttemptFact } from './attempt-fact-fixture.ts'
import { describe, expect, it } from 'vitest'
import { LosslessNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { createSettlementCoordinator } from '@omne-harness-lite/session-runtime-local'
import { readSettlementPrefix } from '@omne-harness-lite/model-request-runtime'
import {
  type SettlementScheduler,
  type SettlementOwner,
} from '@omne-harness-lite/model-request-runtime'
import {
  modelLogJsonEqual,
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import {
  interpretRunAtPrefix,
  readSettlementPrefix as readRunPrefix,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionLog, AppendResult } from '@omne-harness-lite/session-log'
import {
  anchors,
  binding as fixtureBinding,
  reply,
  session,
  jsonObject,
} from './log-codec-fixture.ts'
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
        // Like #40: the first complete batch to commit wins, and once both appends are released
        // together, which one commits first depends on real IO completion order. Pin it: the
        // second settlement starts only after the first one's append has arrived, and the
        // second append commits only after the first one's returned. Both are still prepared
        // against the same prefix before either commits.
        const release = deferred<void>(),
          firstArrived = deferred<void>(),
          both = deferred<void>(),
          firstCommitted = deferred<void>()
        let calls = 0
        const source: SessionLog = {
          ...binding.log,
          async append(...args) {
            const call = ++calls
            if (call === 1) firstArrived.resolve()
            if (call === 2) both.resolve()
            await release.promise
            if (call === 2) await firstCommitted.promise
            try {
              return await binding.log.append(...args)
            } finally {
              if (call === 1) firstCommitted.resolve()
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
        const single = {
          ...request,
          current: { messageId: null, disposition: null },
          response: lostReply(),
        }
        const first = coordinator.settle(winner === 'single' ? single : request)
        await firstArrived.promise
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
          input: { kind: 'value', value: modelValue(entry.payload) },
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
      const h = coordinator.settle({
        ...request,
        response: {
          ...responseV5,
          call: { callId: 'call', runId: 'controlled-run' },
          attemptId: 1,
        },
      })
      expect(await h.completion).toMatchObject({ reason: 'run_history_unavailable' })
      await h.stopped
      await coordinator.close()
      let called = 0
      const noMs6 = createSettlementCoordinator({
        binding: { ...binding, session: newSession.ok },
        owner,
        run(_prefix, run, originalAttempt) {
          called++
          return { known: { run, originalAttempt, latestAttempt: 1, terminal: 'open' } }
        },
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const missingStart = noMs6.settle({
        ...request,
        response: {
          ...responseV5,
          call: { callId: 'call', runId: 'controlled-run' },
          attemptId: 1,
        },
      })
      expect(await missingStart.completion).toMatchObject({ reason: 'run_history_unavailable' })
      await missingStart.stopped
      await noMs6.close()
      expect(called).toBe(0)
      expect(submissions).toHaveLength(2)
    })
  })
  for (const race of [false, true])
    it(`uses one real SQL journal prefix for a superseded Run response with tail race=${race}`, async () => {
      await controlled(`with-run-tail-${race}`, async ({ binding, owner, submissions, wrap }) => {
        const parsed = parseOpaqueIdentifier('controlled-run-tail', 'SessionRef')
        if (!('ok' in parsed)) throw new Error('session')
        const runSession = parsed.ok
        async function appendStart(attempt: number) {
          const entry = prepareAttemptFact({
            session: runSession,
            shell: { tenant: binding.tenant, run: 'controlled-run', attempt },
            key: `attempt-${attempt}`,
            reason: attempt === 1 ? 'first' : 'resumed_after_interruption',
            at: '2026-09-29T00:00:00Z',
          })
          if (!('ok' in entry)) throw new Error('attempt message prepare')
          const appended = await binding.log.append(
            runSession,
            [entry.ok],
            { kind: 'fenced', run: 'controlled-run', attempt },
            { kind: 'unconditional' },
          )
          if ('failure' in appended) throw new Error('attempt message append')
        }
        await appendStart(1)
        const original = anchors().entries.map(entry => {
          const captured = captureModelLogValue({
            category: 'record',
            input: { kind: 'value', value: modelValue(entry.payload) },
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
        expect(
          await binding.log.append(
            runSession,
            original,
            { kind: 'fenced', run: 'controlled-run', attempt: 1 },
            { kind: 'unconditional' },
          ),
        ).toHaveProperty('positions')
        await appendStart(2)
        if (!race) {
          const acquired = owner.acquire(2)
          if (!('registration' in acquired)) throw new Error('Run prefix owner')
          const read = await readRunPrefix({
            binding: { ...binding, session: runSession },
            registration: acquired.registration,
          })
          acquired.registration.release()
          if (!('prefix' in read)) throw new Error('Run full prefix unavailable')
          const source: NonNullable<Parameters<typeof interpretRunAtPrefix>[0]['source']> = (
            prefix,
            run,
            originalAttempt,
          ) => {
            expect(prefix).toBe(read.prefix)
            return {
              known: { run, originalAttempt, latestAttempt: 2, terminal: 'open' as const },
            }
          }
          expect(
            interpretRunAtPrefix({
              prefix: read.prefix,
              run: 'controlled-run',
              attempt: 1,
              source,
            }),
          ).toMatchObject({ known: { originalAttempt: 1, latestAttempt: 2, late: true } })
          for (const wrong of [
            { run: 'another-run', originalAttempt: 1, latestAttempt: 2 },
            { run: 'controlled-run', originalAttempt: 2, latestAttempt: 2 },
            { run: 'controlled-run', originalAttempt: 1, latestAttempt: 1 },
          ])
            expect(
              interpretRunAtPrefix({
                prefix: read.prefix,
                run: 'controlled-run',
                attempt: 1,
                source: () => ({ known: { ...wrong, terminal: 'open' } }),
              }),
            ).toEqual({ unavailable: true })
          let called = false
          expect(
            interpretRunAtPrefix({
              prefix: read.prefix,
              run: 'controlled-run',
              attempt: 3,
              source: () => {
                called = true
                return source(read.prefix, 'controlled-run', 3)
              },
            }),
          ).toEqual({ unavailable: true })
          expect(called).toBe(false)
          expect(
            interpretRunAtPrefix({
              prefix: read.prefix,
              run: 'controlled-run',
              attempt: 1,
              source: () => ({ unavailable: true }),
            }),
          ).toEqual({ unavailable: true })
        }
        const wrongLatest = createSettlementCoordinator({
          binding: { ...binding, session: runSession },
          owner,
          run(_prefix, run, originalAttempt) {
            return { known: { run, originalAttempt, latestAttempt: 1, terminal: 'open' } }
          },
          settlementContention: policy(),
          settlementScheduler: noWaitScheduler,
          diagnostic() {},
        })
        const refused = wrongLatest.settle({
          ...request,
          response: {
            ...responseV5,
            call: { callId: 'call', runId: 'controlled-run' },
            attemptId: 1,
          },
        })
        expect(await refused.completion).toMatchObject({ reason: 'run_history_unavailable' })
        await refused.stopped
        await wrongLatest.close()
        let raced = false
        const unrelated = prepareModelLogEntry({
          session: runSession,
          shell: { tenant: binding.tenant },
          captured: (() => {
            const value = captureModelLogValue({
              category: 'record',
              input: {
                kind: 'value',
                value: {
                  kind: 'model_call_ended',
                  call: 'unrelated',
                  ending: 'undispatched',
                  cause: 'credential_unavailable',
                },
              },
            })
            if (!('ok' in value)) throw new Error('unrelated capture')
            return value.ok
          })(),
          purpose: { kind: 'record' },
          messagePrefix: [],
        })
        if (!('ok' in unrelated)) throw new Error('unrelated prepare')
        const racingLog: SessionLog = {
          ...binding.log,
          async append(...args) {
            if (race && !raced && args[3].kind === 'tailEquals') {
              raced = true
              const winner = await binding.log.append(
                runSession,
                [unrelated.ok],
                { kind: 'unfenced' },
                { kind: 'unconditional' },
              )
              if ('failure' in winner) throw new Error('unrelated append')
            }
            return await binding.log.append(...args)
          },
        }
        const coordinator = createSettlementCoordinator({
          binding: { ...wrap(racingLog), session: runSession },
          owner,
          settlementContention: policy(race ? 2 : 1),
          settlementScheduler: noWaitScheduler,
          run(prefix, originalRun, originalAttempt) {
            expect(prefix.binding.session).toBe(runSession)
            expect(originalRun).toBe('controlled-run')
            expect(originalAttempt).toBe(1)
            return {
              known: { run: originalRun, originalAttempt, latestAttempt: 2, terminal: 'open' },
            }
          },
          diagnostic() {},
        })
        const response = {
          ...responseV5,
          call: { callId: 'call', runId: 'controlled-run' },
          attemptId: 1,
        }
        const handle = coordinator.settle({ ...request, response })
        const result = await handle.completion
        await handle.stopped
        expect(result).toHaveProperty('origin', 'appended')
        if (!('settled' in result)) throw new Error('not settled')
        expect(result.settled.response.response?.late).toBe(true)
        expect(result.settled.response.response?.attemptId).toBe(1)
        expect(result.settled.response.response?.call.runId).toBe('controlled-run')
        const responseEntry = result.settled.entries.at(-1)
        expect(responseEntry?.run).toBe('controlled-run')
        expect(responseEntry?.attempt).toBe(2)
        const responseSubmissions = submissions.filter(
          item =>
            typeof item.condition === 'object' &&
            item.condition !== null &&
            'kind' in item.condition &&
            item.condition.kind === 'tailEquals',
        )
        expect(responseSubmissions.map(item => item.condition)).toEqual(
          race
            ? [
                { kind: 'tailEquals', tail: 4 },
                { kind: 'tailEquals', tail: 5 },
              ]
            : [{ kind: 'tailEquals', tail: 4 }],
        )
        const durable = await binding.log.readSince(runSession, 0)
        if ('failure' in durable) throw new Error('durable Run batch unavailable')
        expect(
          durable.entries.filter(entry => modelCategory(entry.payload) === 'response'),
        ).toHaveLength(1)
        expect(
          durable.entries.filter(entry => modelCategory(entry.payload) === 'message'),
        ).toHaveLength(1)
        expect(
          durable.entries.filter(entry => {
            const read = readAttemptStarted(entry)
            return 'kind' in read && read.kind === 'fact'
          }),
        ).toHaveLength(2)
        await coordinator.close()
        const originalFirst = createSettlementCoordinator({
          binding: { ...binding, session: runSession },
          owner,
          settlementContention: policy(),
          settlementScheduler: noWaitScheduler,
          diagnostic() {},
        })
        const reread = originalFirst.settle({ ...request, response })
        const recognized = await reread.completion
        await reread.stopped
        expect(recognized).toHaveProperty('origin', 'recognized')
        if (!('settled' in recognized)) throw new Error('original batch unavailable')
        expect(recognized.settled.response.response?.late).toBe(true)
        expect(responseSubmissions).toHaveLength(race ? 2 : 1)
        await originalFirst.close()
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
  for (const alternative of ['consumed', 'vetoed', 'no_reply'] as const)
    for (const persistedFirst of [true, false])
      it(`lets one complete withRun batch win a real SQL journal race, ${alternative}, persistedFirst=${persistedFirst}`, async () => {
        await controlled(
          `with-run-disposition-race-${alternative}-${persistedFirst}`,
          async ({ binding, owner, submissions }) => {
            const parsed = parseOpaqueIdentifier('run-disposition-race', 'SessionRef')
            if (!('ok' in parsed)) throw new Error('Run session')
            const runSession = parsed.ok
            const run = 'disposition-run'
            const attempt = 1

            const started = prepareAttemptFact({
              session: runSession,
              shell: { tenant: binding.tenant, run, attempt },
              key: 'race-attempt-start',
              reason: 'first',
              at: '2026-09-29T00:00:00Z',
            })
            if (!('ok' in started)) throw new Error('start entry')
            const anchorsWithRun = anchors().entries.map(entry => {
              const captured = captureModelLogValue({
                category: 'record',
                input: { kind: 'value', value: modelValue(entry.payload) },
              })
              if (!('ok' in captured)) throw new Error('anchor value')
              const prepared = prepareModelLogEntry({
                session: runSession,
                shell: { tenant: binding.tenant, run, attempt },
                captured: captured.ok,
                purpose: { kind: 'record' },
                messagePrefix: [],
              })
              if (!('ok' in prepared)) throw new Error('anchor entry')
              return prepared.ok
            })
            const opened = await binding.log.append(
              runSession,
              [started.ok, ...anchorsWithRun],
              { kind: 'fenced', run, attempt },
              { kind: 'unconditional' },
            )
            if ('failure' in opened) throw new Error('Run anchors')
            // #40: the contract says the first complete batch to commit wins, not the first caller,
            // and which side commits first otherwise depends on real IO completion order. Pin it:
            // the leader may commit only after the follower has read the same prefix, and the
            // follower may submit only after the leader's append returned. Both hold one tail, the
            // leader commits first, and the follower loses at the SQL journal commit point and recognizes
            // the durable winner.
            const followerRead = deferred<void>(),
              leaderCommitted = deferred<void>()
            const ordered = (leader: boolean): SessionLog => {
              let reads = 0
              return {
                ...binding.log,
                async readSince(...args) {
                  try {
                    return await binding.log.readSince(...args)
                  } finally {
                    if (!leader && ++reads === 1) followerRead.resolve()
                  }
                },
                async append(...args) {
                  await (leader ? followerRead.promise : leaderCommitted.promise)
                  try {
                    return await binding.log.append(...args)
                  } finally {
                    if (leader) leaderCommitted.resolve()
                  }
                },
              }
            }
            const coordinator = (leader: boolean) =>
              createSettlementCoordinator({
                binding: { ...binding, log: ordered(leader), session: runSession },
                owner,
                run(_prefix, originalRun, originalAttempt) {
                  return {
                    known: {
                      run: originalRun,
                      originalAttempt,
                      latestAttempt: 1,
                      terminal: 'open',
                    },
                  }
                },
                settlementContention: policy(2),
                settlementScheduler: noWaitScheduler,
                diagnostic() {},
              })
            const persisted = coordinator(persistedFirst)
            const competing = coordinator(!persistedFirst)
            const calibration = {
              requestInput: {
                kind: 'known',
                projectionRevision: 'fixture-v1',
                prefixBoundary: 1,
                prefixDigest: 'a'.repeat(64),
                inputEnvelopeDigest: 'b'.repeat(64),
                countingBasis: {
                  binding: fixtureBinding,
                  model: 'teaching/model',
                  provider: 'first',
                  tokenizerRevision: 'fixture-v1',
                  meterRevision: 'fixture-v1',
                  projectionRevision: 'fixture-v1',
                  replayRevision: 'fixture-v1',
                  transformRevision: 'fixture-v1',
                },
              },
              observedInput: {
                kind: 'upstream_total',
                tokens: 11,
                provenance: { adapterRevision: 'fixture-v1', fieldPaths: ['usage.prompt_tokens'] },
              },
              outputGroup: {
                kind: 'known',
                projectionRevision: 'fixture-v1',
                source: 'reply',
                blockDigests: ['c'.repeat(64)],
                completeness: 'complete',
                usageRef: 'usage',
              },
            }
            const base = {
              ...responseV5,
              call: { callId: 'call', runId: run },
              attemptId: attempt,
              inputCalibration: calibration,
            }
            const persistedRequest = { ...request, response: base }
            const {
              reply: _reply,
              replyDisposition: _disposition,
              ...withoutReplyBody
            } = responseV5
            const withoutReply = {
              ...withoutReplyBody,
              call: { callId: 'call', runId: run },
              attemptId: attempt,
              inputCalibration: calibration,
            }
            const alternateCalibration =
              alternative === 'no_reply'
                ? {
                    ...calibration,
                    outputGroup: { ...calibration.outputGroup, source: 'none', blockDigests: [] },
                  }
                : calibration
            const alternateDisposition =
              alternative === 'consumed'
                ? { consumed: { by: 'compaction' as const } }
                : { vetoed: { by: 'moderation', reason: 'explicit' } }
            const alternateRequest =
              alternative === 'no_reply'
                ? {
                    ...request,
                    current: { messageId: null, disposition: null },
                    response: {
                      ...withoutReply,
                      outcome: 'interrupted',
                      initiator: 'runtime_lost',
                      inputCalibration: alternateCalibration,
                    },
                  }
                : {
                    ...request,
                    current: { messageId: 'winner-message', disposition: alternateDisposition },
                    response: { ...base, replyDisposition: alternateDisposition },
                  }
            const first = persistedFirst
              ? persisted.settle(persistedRequest)
              : competing.settle(alternateRequest)
            const second = persistedFirst
              ? competing.settle(alternateRequest)
              : persisted.settle(persistedRequest)
            const results = await Promise.all([first.completion, second.completion])
            await Promise.all([first.stopped, second.stopped])
            expect(
              results.filter(result => 'origin' in result && result.origin === 'appended'),
            ).toHaveLength(1)
            expect(
              results.filter(result => 'origin' in result && result.origin === 'recognized'),
            ).toHaveLength(1)
            const raw = await binding.log.readSince(runSession, 0)
            if ('failure' in raw) throw new Error('winning Run batch')
            const responses = raw.entries.filter(
              entry => modelCategory(entry.payload) === 'response',
            )
            const assistantMessages = raw.entries.filter(entry => {
              return (
                modelCategory(entry.payload) === 'message' &&
                jsonObject(modelValue(entry.payload)).type === 'assistant'
              )
            })
            expect(responses).toHaveLength(1)
            const result = responses[0]
            if (result === undefined) throw new Error('response winner')
            const value = jsonObject(modelValue(result.payload))
            expect(value.replyDisposition).toEqual(
              persistedFirst
                ? 'persisted'
                : alternative === 'no_reply'
                  ? undefined
                  : alternateDisposition,
            )
            expect(value.attemptId).toBe(attempt)
            expect(value.inputCalibration).toEqual(
              persistedFirst ? calibration : alternateCalibration,
            )
            expect(value.usage).toEqual(responseV5.usage)
            expect(value.cost).toEqual(responseV5.cost)
            expect(assistantMessages).toHaveLength(value.replyDisposition === 'persisted' ? 1 : 0)
            // M17-V4: the losing side answers with the durable winner, never its own candidate.
            for (const result of results) {
              if (!('settled' in result)) throw new Error('race side not settled')
              expect(modelLogJsonEqual(result.settled.response.value, value)).toBe(true)
            }
            expect(
              submissions.filter(
                item =>
                  typeof item.condition === 'object' &&
                  item.condition !== null &&
                  'kind' in item.condition &&
                  item.condition.kind === 'tailEquals',
              ).length,
            ).toBe(2)
            await persisted.close()
            await competing.close()
          },
        )
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

// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 JSONL 会话日志。
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap, type TenantId } from '@omne-harness-lite/identity-values'
import {
  createModelCallSemanticDigest,
  judgeModelCallSemanticDigest,
} from '@omne-harness-lite/messages'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import type { LogEntry, SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { payload } from './anchored-invocation-fixture.ts'
import { captureModelLogValue, prepareModelLogEntry } from '../src/log-codec.ts'
import {
  acknowledgementHost,
  acknowledgements,
  kinds,
  type HostOptions,
} from './acknowledgement-host-fixture.ts'
import type {
  SettlementOwner,
  SettlementRegistration,
  SettlementScheduler,
  SettlementTask,
} from '../src/settlement-types.ts'

/** Another writer moves the tail before the first ACK batch: that batch writes nothing. */
function racingFirstAck(race: { raced: boolean }): NonNullable<HostOptions['append']> {
  return real => async (session, entries, fence, condition) => {
    const [entry] = entries
    const wrapper = entry?.payload
    const isAck =
      typeof wrapper === 'object' &&
      wrapper !== null &&
      'value' in wrapper &&
      typeof wrapper.value === 'object' &&
      wrapper.value !== null &&
      'kind' in wrapper.value &&
      wrapper.value.kind === 'model_call_acknowledged'
    if (isAck && !race.raced && entry !== undefined) {
      // Another writer moves the tail first: THIS ACK batch writes nothing (tailChanged).
      race.raced = true
      const unrelated = captureModelLogValue({
        category: 'record',
        input: {
          kind: 'value',
          value: {
            kind: 'model_call_ended',
            call: 'a22-unrelated',
            ending: 'undispatched',
            cause: 'credential_unavailable',
          },
        },
      })
      if (!('ok' in unrelated)) throw new Error('unrelated capture')
      const prepared = prepareModelLogEntry({
        session,
        shell: { tenant: entry.tenant },
        captured: unrelated.ok,
        purpose: { kind: 'record' },
        messagePrefix: [],
      })
      if (!('ok' in prepared)) throw new Error('unrelated prepare')
      const moved = await real(
        session,
        [prepared.ok],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in moved) throw new Error('unrelated append')
    }
    return await real(session, entries, fence, condition)
  }
}

describe('A22 acknowledgement acceptance on real SQLite/JSONL (inline, noRun)', () => {
  it('A22-V1/V2/V8: only current ack authority confirms; all fifteen entries then answer small', async () => {
    const h = await acknowledgementHost()
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      h.grant('reader', ['read', 'wait'])
      h.grant('revoked', ['ack']).abort()
      const foreign: TenantId = {
        ...h.host.tenant,
        organization: unwrap(parseOpaqueIdentifier('a22-foreign-organization', 'OrganizationId')),
      }
      h.grant('foreign', ['ack'], foreign)
      const parameters = {
        maxOutputTokens: 100,
        seed: new LosslessNumber('9007199254740993'),
        stopSequences: ['a', 'b'],
        extra: { a: 1, b: 2 },
      }
      const opened = await h.service.openCall(h.request('a22_create_1', { parameters }))
      expect(opened).toMatchObject({ callId: 'a22-call-1', state: 'open' })
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      expect(dispatched).toHaveProperty('replyPending')
      expect(
        await h.service.settleReply({ ...ref, disposition: { vetoed: { by: 'a22-gate' } } }),
      ).toEqual({ callId: 'a22-call-1', state: 'complete' })
      const target = { kind: 'response' as const, response: 'a22-response-1' }

      // A22-V1: read/wait, revoked and cross-tenant authority never confirm.
      for (const name of ['reader', 'revoked', 'foreign']) {
        h.as(name)
        expect(await h.service.acknowledgeCall({ ref, expectedResult: target })).toEqual({
          unavailable: true,
        })
      }
      // Releasing a read consumer or holding only a ref is not an implicit ACK.
      h.as('reader')
      const consumer = await h.service.acquireCall({ ref, mode: 'read' })
      expect(consumer).toHaveProperty('view')
      expect(acknowledgements(await h.entries(), 'a22-call-1')).toHaveLength(0)
      h.as('owner')
      expect(
        await h.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: 'a22-response-1', ending: 'released' },
        } as never),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(
        await h.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'ended', ending: 'released' },
        }),
      ).toEqual({ wrongPhase: { phase: 'complete' } })
      expect(
        await h.service.acknowledgeCall({
          ref: { ...ref, callId: 'a22-call-missing' },
          expectedResult: target,
        }),
      ).toEqual({ callNotFound: true })
      expect(acknowledgements(await h.entries(), 'a22-call-1')).toHaveLength(0)

      const first = await h.service.acknowledgeCall({ ref, expectedResult: target })
      expect(first).toMatchObject({ acknowledged: { ref, target, cleanup: 'released' } })
      if (!('acknowledged' in first)) throw new Error('acknowledged')
      expect(first.acknowledged).not.toHaveProperty('pendingReasons')
      expect(await h.contentRows('a22-call-1')).toBe(0)
      const confirmed = await h.entries()
      expect(acknowledgements(confirmed, 'a22-call-1')).toHaveLength(1)
      const sends = h.wire.sends()

      // A22-V2: the same target recognizes the original fact; another target is wrongPhase.
      expect(await h.service.acknowledgeCall({ ref, expectedResult: target })).toEqual(first)
      expect(
        await h.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'ended', ending: 'interrupted' },
        }),
      ).toEqual({ wrongPhase: { phase: 'complete' } })

      // A22-V2/V8: every entry, for any consumer with its own current authority.
      const small = {
        ref,
        acknowledged: { ref, target, acknowledgedAt: first.acknowledged.acknowledgedAt },
        origin: { tenant: h.host.tenant, session: h.host.session },
        terminalState: 'complete',
        attempts: [
          {
            response: 'a22-response-1',
            dispatch: 1,
            outcome: 'complete',
            disposition: 'final',
            replyDisposition: { vetoed: { by: 'a22-gate' } },
          },
        ],
      }
      h.as('reader')
      const read = await h.service.acquireCall({ ref, mode: 'read' })
      expect(read).toMatchObject({ view: small })
      if (!('view' in read)) throw new Error('view')
      for (const forbidden of ['state', 'presence', 'result', 'reply', 'route', 'raw'])
        expect(read.view).not.toHaveProperty(forbidden)
      const waited = await h.service.acquireCall({ ref, mode: 'wait' })
      expect(waited).toMatchObject({ view: small })
      expect(waited).not.toHaveProperty('consumer')
      if ('consumer' in consumer && consumer.consumer !== undefined) {
        expect(await consumer.consumer.wait({})).toMatchObject({ view: small })
        consumer.consumer.release()
      }
      h.as('owner')
      expect(await h.service.readAttempts(ref)).toMatchObject({ acknowledged: small })
      expect(await h.service.canDispatchAgain({ ...ref, plan: { provider: 'test' } })).toEqual({
        alreadyEnded: true,
      })
      expect(await h.service.dispatch(ref)).toEqual({ alreadyEnded: true })
      expect(await h.service.dispatchAgain({ ...ref, plan: { provider: 'test' } })).toEqual({
        alreadyEnded: true,
      })
      expect(await h.service.interrupt({ ...ref, initiator: 'user' })).toEqual({
        alreadyEnded: true,
      })
      expect(await h.service.releaseCall(ref)).toEqual({ alreadyEnded: true })
      expect(
        await h.service.settleReply({ ...ref, disposition: { vetoed: { by: 'a22-gate' } } }),
      ).toEqual({ callId: 'a22-call-1', state: 'complete' })
      expect(
        await h.service.settleReply({ ...ref, disposition: { consumed: { by: 'compaction' } } }),
      ).toEqual({ alreadyEnded: true })
      const reconciled = await h.service.reconcile({ session: h.host.session })
      if (!('calls' in reconciled)) throw new Error('reconcile')
      expect(reconciled.calls.find(item => item.callId === 'a22-call-1')).toMatchObject({
        acknowledged: small,
      })
      // A22-V9 through openCall: the same creation is recognized by its semantic digest.
      expect(
        await h.service.openCall(
          h.request('a22_create_1', {
            parameters: {
              extra: { b: 2, a: 1 },
              stopSequences: ['a', 'b'],
              seed: new LosslessNumber('9007199254740993'),
              maxOutputTokens: new LosslessNumber('100.0'),
            },
          }),
        ),
      ).toMatchObject({ ref, callId: 'a22-call-1', acknowledged: small })
      for (const differing of [
        { ...parameters, maxOutputTokens: 101 },
        { ...parameters, stopSequences: ['b', 'a'] },
        { ...parameters, extra: { a: 1, b: 2, c: null } },
        { ...parameters, seed: new LosslessNumber('9007199254740992') },
      ])
        expect(
          await h.service.openCall(h.request('a22_create_1', { parameters: differing })),
        ).toEqual({ creationConflict: true })
      h.changeSourceVersions({ fixture: 'a22-v2' })
      expect(await h.service.openCall(h.request('a22_create_1', { parameters }))).toEqual({
        creationConflict: true,
      })
      h.restoreSourceVersions()
      // Selection reads are unchanged by ACK.
      expect(await h.service.legalTargets({ session: h.host.session })).toHaveProperty(
        'legalTargets',
      )
      expect(await h.service.displayList({ session: h.host.session })).toHaveProperty('displayList')
      expect(
        await h.service.selectModel({ session: h.host.session, routeName: 'example/model-a' }),
      ).toEqual({ selected: 'example/model-a' })

      // Zero sends and no durable write for this call after its ACK.
      expect(h.wire.sends()).toBe(sends)
      const after = await h.entries()
      expect(
        after.slice(confirmed.length).filter(entry => payload(entry).call === 'a22-call-1'),
      ).toEqual([])
      expect(await h.runtime.close()).toEqual({ released: true })
      // RT12 S-100: host stop does not hide the durable ACK and its cleanup progress.
      expect(await h.service.acknowledgeCall({ ref, expectedResult: target })).toEqual(first)
    } finally {
      await h.host.close()
    }
  }, 30_000)

  it('A22-V2/V8/V11: a ready reply ACK fixes the witness, pends on a real reader, then a caller-held value settles', async () => {
    const h = await acknowledgementHost()
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      expect(await h.service.openCall(h.request('a22_create_ready'))).toMatchObject({
        callId: 'a22-call-1',
      })
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('ready reply')
      const retained: PendingModelResponse = dispatched.replyPending
      const target = { kind: 'response' as const, response: retained.id }
      // A running operation holds the call's in-memory copy: cleanup must report it.
      const holder = h.calls.reserve(ref)
      if (!('reservation' in holder)) throw new Error('reservation')
      const acknowledged = await h.service.acknowledgeCall({ ref, expectedResult: target })
      expect(acknowledged).toEqual({
        acknowledged: {
          ref,
          target,
          acknowledgedAt: expect.any(String),
          cleanup: 'pending',
          pendingReasons: ['read_in_flight'],
        },
      })
      const log = await h.entries()
      const [record] = acknowledgements(log, 'a22-call-1')
      expect(payload(record as LogEntry)).toMatchObject({
        terminalState: 'complete',
        accountingWitness: { response: retained.id, dispatch: 1, outcome: 'complete' },
        retainedResultDigest: { role: 'model-call-retained-result-semantic-sha256/v1' },
      })
      // ACK is neither a disposition nor a message.
      expect(kinds(log).filter(kind => kind === 'model_call_ended')).toHaveLength(0)
      expect(log.filter(entry => payload(entry).replyDisposition !== undefined)).toHaveLength(0)
      // A22-V8: pending cleanup still hands out only the small branch.
      const pendingRead = await h.service.acquireCall({ ref, mode: 'read' })
      expect(pendingRead).toMatchObject({
        view: {
          acknowledged: { cleanup: 'pending', pendingReasons: ['read_in_flight'] },
          attempts: [{ response: retained.id, disposition: 'disposition_pending' }],
        },
      })
      expect(pendingRead).not.toHaveProperty('view.result')
      expect(await h.contentRows('a22-call-1')).toBe(2)
      holder.reservation.release()
      expect(await h.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { acknowledged: { cleanup: 'released' } },
      })
      expect(await h.contentRows('a22-call-1')).toBe(0)
      // RT12 S-99: after release the caller's own value is required and checked.
      const disposition = { vetoed: { by: 'a22-gate' } }
      expect(await h.service.settleReply({ ...ref, disposition })).toEqual({
        wrongPhase: { phase: 'complete' },
      })
      expect(
        await h.service.settleReply({
          ...ref,
          disposition,
          retainedResult: { ...retained, stopReason: 'tampered' },
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(
        await h.service.settleReply({
          ...ref,
          disposition,
          retainedResult: { ...retained, usage: { ...retained.usage, input_tokens: 999 } },
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      // S-99⑧: a validated caller-held original starts one staged write and completes it.
      const before = await h.entries()
      expect(
        await h.service.settleReply({ ...ref, disposition, retainedResult: retained }),
      ).toEqual({ callId: 'a22-call-1', state: 'complete' })
      const written = (await h.entries()).slice(before.length)
      expect(written).toHaveLength(1)
      expect(payload(written[0] as LogEntry)).toMatchObject({
        id: retained.id,
        replyDisposition: disposition,
      })
      // The staging row is retired with the confirmed final; the ACK cleanup never regresses.
      expect(await h.workRows('a22-call-1')).toBe(0)
      expect(await h.contentRows('a22-call-1')).toBe(0)
      const settledRead = await h.service.acquireCall({ ref, mode: 'read' })
      expect(settledRead).toMatchObject({
        view: {
          acknowledged: { cleanup: 'released' },
          attempts: [
            { response: retained.id, disposition: 'final', replyDisposition: disposition },
          ],
        },
      })
      expect(settledRead).not.toHaveProperty('view.result')
      // S-99⑦: the committed final decides repeats without any full value.
      expect(await h.service.settleReply({ ...ref, disposition })).toEqual({
        callId: 'a22-call-1',
        state: 'complete',
      })
      expect(
        await h.service.settleReply({ ...ref, disposition: { consumed: { by: 'compaction' } } }),
      ).toEqual({ alreadyEnded: true })
      // A22-V1: a non-terminal call is never acknowledged.
      expect(await h.service.openCall(h.request('a22_create_open'))).toMatchObject({
        callId: 'a22-call-2',
        state: 'open',
      })
      expect(
        await h.service.acknowledgeCall({
          ref: { ...ref, callId: 'a22-call-2' },
          expectedResult: { kind: 'ended', ending: 'undispatched' },
        }),
      ).toEqual({ wrongPhase: { phase: 'open' } })
      expect(acknowledgements(await h.entries(), 'a22-call-2')).toHaveLength(0)
      expect(await h.runtime.close()).toEqual({ released: true })
    } finally {
      await h.host.close()
    }
  }, 30_000)

  it.each([
    ['a different value under the same key is not recognized', true],
    ['the same value read back is recognized', false],
  ] as const)(
    'A22-V2 (review S1): alreadyRecorded is not recognition; %s',
    async (_name, differ) => {
      let injected = false
      const h = await acknowledgementHost({
        append: real => async (session, entries, fence, condition) => {
          const [entry] = entries
          const wrapper = entry?.payload
          const value =
            typeof wrapper === 'object' && wrapper !== null && 'value' in wrapper
              ? wrapper.value
              : undefined
          if (
            !injected &&
            entry !== undefined &&
            typeof wrapper === 'object' &&
            wrapper !== null &&
            typeof value === 'object' &&
            value !== null &&
            'kind' in value &&
            value.kind === 'model_call_acknowledged'
          ) {
            // Another writer lands the same log key first; the log then answers alreadyRecorded.
            injected = true
            const other = differ
              ? {
                  ...entry,
                  payload: {
                    ...wrapper,
                    value: { ...value, acknowledgedAt: '2026-09-29T00:00:00Z' },
                  },
                }
              : entry
            const landed = await real(
              session,
              [other],
              { kind: 'unfenced' },
              { kind: 'unconditional' },
            )
            if ('failure' in landed) throw new Error(`inject: ${landed.failure}`)
          }
          return await real(session, entries, fence, condition)
        },
      })
      try {
        h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
        expect(await h.service.openCall(h.request('a22_create_s1'))).toMatchObject({
          callId: 'a22-call-1',
        })
        const ref = { session: h.host.session, callId: 'a22-call-1' }
        const dispatched = await h.service.dispatch(ref)
        if (!('replyPending' in dispatched)) throw new Error('ready reply')
        const target = { kind: 'response' as const, response: dispatched.replyPending.id }
        expect(
          await h.service.settleReply({ ...ref, disposition: { vetoed: { by: 'a22-gate' } } }),
        ).toEqual({ callId: 'a22-call-1', state: 'complete' })
        const answered = await h.service.acknowledgeCall({ ref, expectedResult: target })
        expect(injected).toBe(true)
        const recorded = acknowledgements(await h.entries(), 'a22-call-1')
        expect(recorded).toHaveLength(1)
        if (differ) {
          expect(answered).toEqual({ unavailable: true })
          expect(payload(recorded[0] as LogEntry).acknowledgedAt).toBe('2026-09-29T00:00:00Z')
        } else {
          expect(answered).toMatchObject({ acknowledged: { ref, target } })
        }
        expect(await h.runtime.close()).toEqual({ released: true })
      } finally {
        await h.host.close()
      }
    },
    30_000,
  )

  it('A22-V5 (B-1): a zero-write ACK whose policy stops retreats to retained; nothing is deleted', async () => {
    const race = { raced: false }
    let stop = true
    const h = await acknowledgementHost({
      settlementContention: {
        name: 'a22-stop-after-conflict',
        limits: { submissions: 4, elapsedMs: 100000, retainedBytes: 1000000, concurrent: 2 },
        decide: ({ stage }) =>
          stage !== 'initial' && stop ? { stop: true } : { proceed: { waitMs: 0 } },
      },
      append: racingFirstAck(race),
    })
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      expect(await h.service.openCall(h.request('a22_withdraw'))).toMatchObject({
        callId: 'a22-call-1',
      })
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('ready reply')
      const target = { kind: 'response' as const, response: dispatched.replyPending.id }
      expect(await h.service.acknowledgeCall({ ref, expectedResult: target })).toEqual({
        unavailable: true,
      })
      expect(race.raced).toBe(true)
      expect(acknowledgements(await h.entries(), 'a22-call-1')).toHaveLength(0)
      // The one retreat: back to retained with the original contents readable again.
      expect(await h.contentRows('a22-call-1')).toBe(2)
      const read = await h.service.acquireCall({ ref, mode: 'read' })
      expect(read).toMatchObject({ view: { state: 'complete' } })
      // A later ACK prepares afresh and confirms.
      stop = false
      expect(await h.service.acknowledgeCall({ ref, expectedResult: target })).toMatchObject({
        acknowledged: { ref, target, cleanup: 'released' },
      })
      expect(acknowledgements(await h.entries(), 'a22-call-1')).toHaveLength(1)
      await h.runtime.close()
    } finally {
      await h.host.close()
    }
  }, 30_000)

  it('N-5: after a zero-write ACK the retry wait of a scheduler that stops only on request neither hangs nor leaks', async () => {
    const race = { raced: false }
    const stopRequests: number[] = []
    const settlementScheduler: SettlementScheduler = {
      nowMonotonicMs: () => 0,
      wait() {
        let stop = () => {}
        const stopped = new Promise<void>(resolve => {
          stop = resolve
        })
        const index = stopRequests.push(0) - 1
        return {
          completion: Promise.resolve('elapsed' as const),
          // This timer owner certifies its stop only once it was asked to stop.
          requestStop: () => {
            stopRequests[index] = (stopRequests[index] ?? 0) + 1
            stop()
          },
          stopped,
        }
      },
    }
    const h = await acknowledgementHost({
      settlementScheduler,
      settlementContention: {
        name: 'a22-wait-then-retry',
        limits: { submissions: 4, elapsedMs: 100000, retainedBytes: 1000000, concurrent: 2 },
        decide: () => ({ proceed: { waitMs: 1 } }),
      },
      append: racingFirstAck(race),
    })
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      expect(await h.service.openCall(h.request('a22_wait_stop'))).toMatchObject({
        callId: 'a22-call-1',
      })
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('ready reply')
      const target = { kind: 'response' as const, response: dispatched.replyPending.id }
      const outcome = await Promise.race([
        h.service.acknowledgeCall({ ref, expectedResult: target }),
        new Promise(resolve => setTimeout(() => resolve('hung'), 5_000)),
      ])
      expect(race.raced).toBe(true)
      expect(outcome).toMatchObject({ acknowledged: { ref, target, cleanup: 'released' } })
      expect(stopRequests).toEqual([1])
      expect(acknowledgements(await h.entries(), 'a22-call-1')).toHaveLength(1)
      await h.runtime.close()
    } finally {
      await h.host.close()
    }
  }, 30_000)

  it('N-5: an anchored dispatch and close over tasks that stop only on request neither hang nor leak a registration', async () => {
    let active = 0
    const controllers = new Set<AbortController>()
    const owner: SettlementOwner = {
      name: 'a22-stop-on-request',
      admission: () => 'open',
      opened: () => ({ confirmed: true }),
      unresolvedWrites: () => [],
      acquire: () => {
        active++
        let running = 0
        const registration: SettlementRegistration = {
          start<T>(_kind: unknown, operation: (signal: AbortSignal) => Promise<T>) {
            running++
            const controller = new AbortController()
            controllers.add(controller)
            const completion = Promise.resolve().then(() => operation(controller.signal))
            const asked = new Promise<void>(resolve =>
              controller.signal.addEventListener('abort', () => resolve(), { once: true }),
            )
            // Completion alone never certifies the stop: only a stop request does.
            const stopped = completion
              .then(
                () => asked,
                () => asked,
              )
              .then(() => {
                running--
                controllers.delete(controller)
              })
            return {
              completion,
              requestStop: () => controller.abort(),
              stopped,
            } satisfies SettlementTask<T>
          },
          release: () => {
            if (running !== 0) throw new Error('released a live registration')
            active--
          },
        }
        return { registration }
      },
    }
    const h = await acknowledgementHost({ owner })
    const bounded = <T>(promise: Promise<T>, what: string) =>
      Promise.race([
        promise,
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error(`${what} hung`)), 5_000),
        ),
      ])
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      expect(await h.service.openCall(h.request('a22_drain'))).toMatchObject({
        callId: 'a22-call-1',
      })
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      expect(await bounded(h.service.dispatch(ref), 'dispatch')).toHaveProperty('replyPending')
      expect(await bounded(h.runtime.close(), 'runtime.close')).toEqual({ released: true })
      expect(active, 'registrations still held after close').toBe(0)
    } finally {
      for (const controller of controllers) controller.abort()
      await h.host.close()
    }
  }, 30_000)

  it('S-99⑦/S-86 (no ACK): repeating settleReply after a final recognizes the same disposition and answers alreadyEnded for another, with no write', async () => {
    const h = await acknowledgementHost()
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      expect(await h.service.openCall(h.request('a22_repeat_final'))).toMatchObject({
        callId: 'a22-call-1',
      })
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('ready reply')
      const vetoed = { ...ref, disposition: { vetoed: { by: 'input-gate', reason: 'no' } } }
      const consumed = { ...ref, disposition: { consumed: { by: 'side_query' as const } } }
      const complete = { callId: 'a22-call-1', state: 'complete' }
      expect(await h.service.settleReply(vetoed)).toEqual(complete)
      const settled = (await h.entries()).length
      // The committed final decides by itself: same disposition recognized, another refused.
      expect(await h.service.settleReply(vetoed)).toEqual(complete)
      expect(await h.service.settleReply(consumed)).toEqual({ alreadyEnded: true })
      // A caller-held value adds nothing once a final exists.
      expect(
        await h.service.settleReply({ ...vetoed, retainedResult: dispatched.replyPending }),
      ).toEqual(complete)
      // The current settle authority still comes first.
      h.grant('reader', ['read', 'wait'])
      h.as('reader')
      expect(await h.service.settleReply(vetoed)).toEqual({ unavailable: true })
      h.as('owner')
      // A restarted process answers the same from the durable final alone.
      const restarted = h.restarted()
      expect(await restarted.service.settleReply(vetoed)).toEqual(complete)
      expect(await restarted.service.settleReply(consumed)).toEqual({ alreadyEnded: true })
      expect((await h.entries()).length).toBe(settled)
      await restarted.runtime.close()
      await h.runtime.close()
    } finally {
      await h.host.close()
    }
  }, 30_000)

  it('A22-V9: the core semantic digest, not a byte hash or another role, identifies a creation', () => {
    const input = { messages: [], sourceVersions: { fixture: 'v1' }, n: 1 }
    const digest = createModelCallSemanticDigest('model-call-creation-semantic-sha256/v1', input)
    if (!('ok' in digest)) throw new Error('digest')
    expect(
      judgeModelCallSemanticDigest(
        'model-call-creation-semantic-sha256/v1',
        { n: new LosslessNumber('1.0'), sourceVersions: { fixture: 'v1' }, messages: [] },
        digest.ok,
      ),
    ).toEqual(digest)
    expect(
      judgeModelCallSemanticDigest('model-call-creation-semantic-sha256/v1', input, {
        role: 'model-call-creation-semantic-sha256/v1',
        hex: createHash('sha256').update(writeJsonLossless(input)).digest('hex'),
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelCallSemanticDigest('model-call-retained-result-semantic-sha256/v1', input, {
        ...digest.ok,
        role: 'model-call-retained-result-semantic-sha256/v1',
      }),
    ).toEqual({ rejected: 'malformed' })
  })
})

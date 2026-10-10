import { describe, expect, it } from 'vitest'
import type {
  AfterModelCallFailureSubject,
  ModelRetryConclusion,
} from '@omne-harness-lite/loop-extension'
import { readFailureSubject } from '@omne-harness-lite/session-runtime-local'
import { readSettlementPrefix } from '@omne-harness-lite/model-request-runtime'
import type { SettlementTask, SettlementTaskKind } from '@omne-harness-lite/model-request-runtime'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { controlled } from './settlement-fixture.ts'
import { prepareV2, responseV5 } from './log-codec-v2-fixture.ts'
import { jsonObject } from './log-codec-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'

describe('RT7 S-76 failure subject from one complete prefix', () => {
  it('does not consult or invent runner history without a failed response', async () => {
    const host = await selectionHost()
    const created = host.create()
    await created.component.close()
    const acquired = created.owner.acquire(1)
    if (!('registration' in acquired)) throw new Error('read registration unavailable')
    const registration = acquired.registration
    if (registration === undefined) throw new Error('read registration missing')
    const tasks: SettlementTask<unknown>[] = []
    try {
      const read = await readSettlementPrefix({
        binding: created.input.binding,
        registration: {
          start<T>(kind: SettlementTaskKind, work: (signal: AbortSignal) => Promise<T>) {
            const task = registration.start(kind, work)
            tasks.push(task)
            return task
          },
          release: registration.release,
        },
      })
      if (!('prefix' in read)) throw new Error(`real prefix unavailable: ${read.reason}`)
      let called = false
      expect(
        readFailureSubject({
          prefix: read.prefix,
          callId: 'absent-call',
          dispatches: [],
          source() {
            called = true
            return { unavailable: true }
          },
        }),
      ).toEqual({ unavailable: true })
      expect(called).toBe(false)
    } finally {
      await Promise.all(tasks.map(task => task.stopped))
      registration.release()
      await host.close()
    }
  })
  it('checks every failed fact against one real full SQL journal read and preserves repeated conclusions', async () => {
    await controlled('failure-subject-v17', async ({ binding, owner }) => {
      const { reply: _reply, replyDisposition: _disposition, ...rest } = responseV5
      const delivered = jsonObject(_reply).blocks
      if (!Array.isArray(delivered)) throw new Error('fixture delivered blocks unavailable')
      const failed = {
        ...rest,
        outcome: 'failed',
        failure: { cause: 'interrupted_mid_reply', statusCode: 503 },
        delivered,
      }
      expect(
        await binding.log.append(
          binding.session,
          [prepareV2('response', failed, { kind: 'response' })],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      const acquired = owner.acquire(2)
      if (!('registration' in acquired)) throw new Error('full read registration unavailable')
      const read = await readSettlementPrefix({ binding, registration: acquired.registration })
      acquired.registration.release()
      if (!('prefix' in read)) throw new Error('full failed prefix unavailable')
      const history = interpretCallHistory({ prefix: read.prefix, callId: 'call' })
      if (!('known' in history)) throw new Error('failed call unavailable')
      const dispatches = history.known.dispatches
      const record = dispatches[0]?.record
      if (record === undefined) throw new Error('original dispatched record unavailable')
      const retry: ModelRetryConclusion = {
        extension: 'tenant:custom',
        position: 'after_model_call' as const,
        dimension: { ending: 'failure' as const },
        power: 'rewrite' as const,
        modelCallId: 'call',
        output: { kind: 'retry' as const, plan: { provider: 'second', after: 'PT1S' } },
        at: '2026-09-29T00:00:00Z',
      }
      const valid = {
        failure: 'interrupted_mid_reply' as const,
        statusCode: 503,
        profile: record.profileSnapshot,
        dispatches: [record] as const,
        retryConclusions: [retry, retry],
      } satisfies AfterModelCallFailureSubject
      let calls = 0
      const source = (prefix: typeof read.prefix, callId: string) => {
        calls++
        expect(prefix).toBe(read.prefix)
        expect(callId).toBe('call')
        return { subject: valid }
      }
      const positive = readFailureSubject({
        prefix: read.prefix,
        callId: 'call',
        dispatches,
        source,
      })
      if (!('subject' in positive)) throw new Error('valid failed subject rejected')
      expect(positive.subject.retryConclusions).toEqual([retry, retry])
      expect(calls).toBe(1)
      const wrong: readonly AfterModelCallFailureSubject[] = [
        { ...valid, failure: 'request_rejected' as const },
        { ...valid, statusCode: 502 },
        { ...valid, inBand: true as const },
        { ...valid, profile: { ...record.profileSnapshot, allowFallback: false } },
        { ...valid, dispatches: [{ ...record, provider: 'wrong' }] },
        { ...valid, dispatches: [{ ...record, call: 'wrong-call' }] },
      ]
      for (const changed of wrong) {
        expect(
          readFailureSubject({
            prefix: read.prefix,
            callId: 'call',
            dispatches,
            source: () => ({ subject: changed }),
          }),
        ).toEqual({ unavailable: true })
      }
    })
  })
})

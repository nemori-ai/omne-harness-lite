import { modelCategory } from './log-codec-fixture.ts'
import { modelValue } from './log-codec-fixture.ts'
import { prepareAttemptFact } from './attempt-fact-fixture.ts'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { createSettlementCoordinator } from '../src/settlement-coordinator.ts'
import { interpretRunAtPrefix, readSettlementPrefix } from '../src/settlement-prefix.ts'
import type { RunHistoryReader } from '../src/settlement-types.ts'
import { anchors, jsonObject } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'
import { controlled, noWaitScheduler, policy, request } from './settlement-fixture.ts'

const RUN = 't08-controlled-run'
const ATTEMPT = 1

async function withRunPrefix(
  label: string,
  latest: 1 | 2,
  work: (input: {
    readonly binding: Parameters<Parameters<typeof controlled>[1]>[0]['binding']
    readonly owner: Parameters<Parameters<typeof controlled>[1]>[0]['owner']
    readonly session: SessionRef
    readonly submissions: Parameters<Parameters<typeof controlled>[1]>[0]['submissions']
  }) => Promise<void>,
) {
  await controlled(label, async ({ binding, owner, submissions }) => {
    const parsed = parseOpaqueIdentifier(`t08-terminal-${label}`, 'SessionRef')
    if (!('ok' in parsed)) throw new Error('Run session id')
    const session = parsed.ok
    for (let attempt = 1; attempt <= latest; attempt++) {
      const prepared = prepareAttemptFact({
        session: session,
        shell: { tenant: binding.tenant, run: RUN, attempt },
        key: `t08-start-${attempt}`,
        reason: attempt === 1 ? 'first' : 'resumed_after_interruption',
        at: '2026-09-29T00:00:00Z',
      })
      if (!('ok' in prepared)) throw new Error('attempt prepare')
      const appended = await binding.log.append(
        session,
        [prepared.ok],
        { kind: 'fenced', run: RUN, attempt },
        { kind: 'unconditional' },
      )
      if ('failure' in appended) throw new Error('attempt append')
      if (attempt === 1) {
        const original = anchors().entries.map(entry => {
          const value = captureModelLogValue({
            category: 'record',
            input: { kind: 'value', value: modelValue(entry.payload) },
          })
          if (!('ok' in value)) throw new Error('original anchor capture')
          const encoded = prepareModelLogEntry({
            session,
            shell: { tenant: binding.tenant, run: RUN, attempt: ATTEMPT },
            captured: value.ok,
            purpose: { kind: 'record' },
            messagePrefix: [],
          })
          if (!('ok' in encoded)) throw new Error('original anchor prepare')
          return encoded.ok
        })
        const anchorsAppended = await binding.log.append(
          session,
          original,
          { kind: 'fenced', run: RUN, attempt: ATTEMPT },
          { kind: 'unconditional' },
        )
        if ('failure' in anchorsAppended) throw new Error('original anchors append')
      }
    }
    await work({ binding, owner, session, submissions })
  })
}

function withRunResponse() {
  return {
    ...request,
    response: {
      ...responseV5,
      call: { callId: 'call', runId: RUN },
      attemptId: ATTEMPT,
    },
  }
}

describe('M17-V1 original/latest and terminal are independent owned-prefix axes', () => {
  it('marks the original attempt late when it is also latest but the Run has ended', async () => {
    await withRunPrefix('ended-original', 1, async ({ binding, owner, session, submissions }) => {
      const coordinator = createSettlementCoordinator({
        binding: { ...binding, session },
        owner,
        run(prefix, run, originalAttempt) {
          expect(prefix.binding.session).toBe(session)
          return { known: { run, originalAttempt, latestAttempt: 1, terminal: 'ended' } }
        },
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const before = submissions.length
      const result = coordinator.settle(withRunResponse())
      const completed = await result.completion
      await result.stopped
      if (!('settled' in completed)) throw new Error('ended original did not settle')
      expect(completed.settled.response.response?.late).toBe(true)
      expect(completed.settled.response.response?.attemptId).toBe(ATTEMPT)
      expect(submissions.length).toBe(before + 1)
      const read = await binding.log.readSince(session, 0)
      if ('failure' in read) throw new Error('actual SQL journal read')
      expect(
        read.entries.filter(entry => modelCategory(entry.payload) === 'response'),
      ).toHaveLength(1)
      await coordinator.close()
    })
  })

  for (const terminal of ['invalid', 'unknown'] as const)
    it(`rejects superseded latest when terminal is ${terminal} without a response append`, async () => {
      await withRunPrefix(
        `bad-${terminal}`,
        2,
        async ({ binding, owner, session, submissions }) => {
          let calls = 0
          const source: RunHistoryReader = (prefix, run, originalAttempt) => {
            calls++
            expect(prefix.binding.session).toBe(session)
            // Deliberately cross the untrusted source boundary with an invalid terminal value.
            return JSON.parse(
              JSON.stringify({
                known: { run, originalAttempt, latestAttempt: 2, terminal },
              }),
            )
          }
          const coordinator = createSettlementCoordinator({
            binding: { ...binding, session },
            owner,
            run: source,
            settlementContention: policy(),
            settlementScheduler: noWaitScheduler,
            diagnostic() {},
          })
          const before = submissions.length
          const pre = await binding.log.readSince(session, 0)
          if ('failure' in pre) throw new Error('actual SQL journal read before')
          const result = coordinator.settle(withRunResponse())
          expect(await result.completion).toMatchObject({ reason: 'run_history_unavailable' })
          await result.stopped
          expect(calls).toBe(1)
          expect(submissions).toHaveLength(before)
          expect(await binding.log.readSince(session, 0)).toEqual(pre)
          await coordinator.close()
        },
      )
    })

  it('rejects spread, prototype and descriptor copies of an actual read prefix before consulting source', async () => {
    await withRunPrefix('forged-prefix', 1, async ({ binding, owner, session }) => {
      const admitted = owner.acquire(2)
      if (!('registration' in admitted)) throw new Error('read owner missing')
      const received = await readSettlementPrefix({
        binding: { ...binding, session },
        registration: admitted.registration,
      })
      admitted.registration.release()
      if (!('prefix' in received)) throw new Error('actual owned prefix missing')
      const genuine = received.prefix
      let calls = 0
      const source: RunHistoryReader = (_prefix, run, originalAttempt) => {
        calls++
        return { known: { run, originalAttempt, latestAttempt: 1, terminal: 'open' } }
      }
      expect(
        interpretRunAtPrefix({ prefix: genuine, run: RUN, attempt: ATTEMPT, source }),
      ).toMatchObject({ known: { originalAttempt: 1, latestAttempt: 1, late: false } })
      expect(calls).toBe(1)
      calls = 0
      const copiedByDescriptor = Object.create(
        Object.getPrototypeOf(genuine),
        Object.getOwnPropertyDescriptors(genuine),
      )
      for (const forged of [
        { ...genuine },
        Object.assign(Object.create(Object.getPrototypeOf(genuine)), genuine),
        copiedByDescriptor,
      ]) {
        const result = Reflect.apply(interpretRunAtPrefix, undefined, [
          { prefix: forged, run: RUN, attempt: ATTEMPT, source },
        ])
        expect(result).toEqual({ unavailable: true })
        expect(calls).toBe(0)
      }
    })
  })
})

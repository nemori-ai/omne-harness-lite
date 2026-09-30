import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import {
  judgeConclusionForSubject,
  type AfterModelCallFailureSubject,
  type ModelRetryConclusion,
} from '@omne-harness-lite/loop-extension'
import {
  prepareRunnerConclusion,
  readRunnerRetryConclusions,
} from '@omne-harness-lite/loop-extension-runner'
import { RUN, ready, user } from './runner-service-fixture.ts'

describe('P5 retry remains a decision until explicit wait and a new runtime guard', () => {
  it('reads repeated default, custom, and cross-call retry facts from one physical prefix', async () => {
    const f = await ready('runner-retry-owned-prefix')
    try {
      const initial = await f.log.readSince(f.session, 0)
      if (!('entries' in initial)) throw Error('initial physical retry prefix unavailable')
      const firstRead = readRunnerRetryConclusions({
        session: f.session,
        tenant: f.who.tenant,
        callId: f.callId,
        entries: initial.entries,
        tail: initial.tail,
      })
      if (!('conclusions' in firstRead) || firstRead.conclusions.length !== 1)
        throw Error('original P5 conclusion absent')
      const original = firstRead.conclusions[0]
      if (original === undefined) throw Error('original retry absent')
      const firstHistory = await f.service.readAttempts({ session: f.session, callId: f.callId })
      if (!('state' in firstHistory) || firstHistory.state !== 'awaiting_decision')
        throw Error('original failed subject absent')
      async function append(
        value: ModelRetryConclusion,
        anchor: string,
        subject: AfterModelCallFailureSubject,
      ) {
        const judged = judgeConclusionForSubject(value, {
          positionedSubject: {
            position: 'after_model_call',
            dimension: { ending: 'failure' },
            subject,
          },
          extensionName: value.extension,
        })
        if (!('ok' in judged)) throw Error(`retry candidate not admitted: ${anchor}`)
        const prepared = prepareRunnerConclusion({
          session: f.session,
          tenant: f.who.tenant,
          execution: { kind: 'withRun', run: RUN, attempt: 1 },
          anchor,
          occurrence: { kind: 'final' },
          value: judged.ok,
          reminders: [],
        })
        if (!('entry' in prepared)) throw Error(`retry wrapper rejected: ${anchor}`)
        const appended = await f.log.append(
          f.session,
          [prepared.entry],
          { kind: 'fenced', run: RUN, attempt: 1 },
          { kind: 'unconditional' },
        )
        if (!('positions' in appended)) throw Error(`physical retry append failed: ${anchor}`)
      }
      const custom = { ...original, extension: 'tenant:custom' }
      await append(custom, 'custom-pass', firstHistory.failureSubject)
      const second = await f.app.startServiceCall(f.who, f.session, {
        user: user('cross-call-retry-user'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: f.host.host,
        run: RUN,
        attempt: 1,
        report: f.report,
      })
      if (!('callId' in second) || !('result' in second) || !('settled' in second.result))
        throw Error(`second failed call absent: ${JSON.stringify(second)}`)
      expect(second.result.settled.outcome).toBe('failed')
      const secondHistory = await f.service.readAttempts({
        session: f.session,
        callId: second.callId,
      })
      if (!('state' in secondHistory) || secondHistory.state !== 'awaiting_decision')
        throw Error('cross-call failed subject absent')
      const crossCall = { ...original, modelCallId: second.callId }
      await append(crossCall, 'cross-call-pass', secondHistory.failureSubject)
      await append(original, 'repeat-default-pass', firstHistory.failureSubject)
      const physical = await f.log.readSince(f.session, 0)
      if (!('entries' in physical)) throw Error('full physical retry prefix unavailable')
      const firstActual = readRunnerRetryConclusions({
        session: f.session,
        tenant: f.who.tenant,
        callId: f.callId,
        entries: physical.entries,
        tail: physical.tail,
      })
      const secondActual = readRunnerRetryConclusions({
        session: f.session,
        tenant: f.who.tenant,
        callId: second.callId,
        entries: physical.entries,
        tail: physical.tail,
      })
      expect(firstActual).toEqual({ conclusions: [original, custom, original] })
      expect(secondActual).toEqual({ conclusions: [crossCall] })
      const firstSource = await f.service.readAttempts(
        { session: f.session, callId: f.callId },
        { consumeFailure: true },
      )
      if (firstSource.consumption.kind !== 'failure') throw Error('same-prefix source absent')
      try {
        expect(firstSource.consumption.source.subject.retryConclusions).toEqual([
          original,
          custom,
          original,
        ])
        expect(
          firstSource.consumption.source.verify(firstSource.consumption.source.subject, {
            run: RUN,
            attempt: 1,
          }),
        ).toHaveProperty('authoritativeSubject')
      } finally {
        firstSource.consumption.source.release()
      }
      const secondSource = await f.service.readAttempts(
        { session: f.session, callId: second.callId },
        { consumeFailure: true },
      )
      if (secondSource.consumption.kind !== 'failure') throw Error('cross-call source absent')
      try {
        expect(secondSource.consumption.source.subject.retryConclusions).toEqual([crossCall])
      } finally {
        secondSource.consumption.source.release()
      }
      expect(f.tls.requests).toHaveLength(2)
    } finally {
      await f.close()
    }
  })

  it('waits the accepted nonzero delay, then dispatches the original call through a second TLS request', async () => {
    const f = await ready('runner-after-wait')
    try {
      expect(
        await f.service.canDispatchAgain({ session: f.session, callId: f.callId, plan: f.plan }),
      ).toEqual({ allowed: true })
      const beforeRetry = await f.app.readSessionLog(f.who, f.session)
      if (!('entries' in beforeRetry)) throw Error('durable retry prefix unavailable')
      await sleep(550)
      f.tls.setMode('complete')
      const retried = await f.service.dispatchAgain({
        session: f.session,
        callId: f.callId,
        plan: f.plan,
        attempt: 1,
      })
      if (!('replyPending' in retried))
        throw Error(`retry did not send: ${JSON.stringify(retried)}`)
      expect(f.tls.requests).toHaveLength(2)
      expect(retried.replyPending.call.callId).toBe(f.callId)
      expect(await f.app.persistModelReply(f.who, f.session, retried.replyPending)).toHaveProperty(
        'settled',
      )
      const after = await f.service.readAttempts({ session: f.session, callId: f.callId })
      if (!('dispatches' in after)) throw Error('retried history unavailable')
      expect(after.dispatches).toHaveLength(2)
      const afterRetry = await f.app.readSessionLog(f.who, f.session)
      if (!('entries' in afterRetry)) throw Error('durable retry history unavailable')
      expect(afterRetry.entries.slice(0, beforeRetry.entries.length)).toEqual(beforeRetry.entries)
    } finally {
      await f.close()
    }
  })

  it('retains the P5 conclusion when current EIS timing limits disappear before dispatchAgain', async () => {
    const f = await ready('runner-limits-after-p5')
    try {
      const before = await f.app.readSessionLog(f.who, f.session)
      f.changeLimits()
      expect(await f.app.prepareModelInputs(f.who, f.session)).toEqual({ prepared: true })
      expect(
        await f.service.canDispatchAgain({ session: f.session, callId: f.callId, plan: f.plan }),
      ).toEqual({ allowed: true })
      const withNewInput = await f.app.readSessionLog(f.who, f.session)
      expect(
        await f.service.dispatchAgain({
          session: f.session,
          callId: f.callId,
          plan: f.plan,
          attempt: 1,
        }),
      ).toEqual({ unavailable: true })
      expect(await f.app.readSessionLog(f.who, f.session)).toEqual(withNewInput)
      expect(f.tls.requests).toHaveLength(1)
      const after = await f.service.readAttempts({ session: f.session, callId: f.callId })
      if (!('state' in after) || after.state !== 'awaiting_decision')
        throw Error('retry history lost')
      expect(after.failureSubject.retryConclusions).toHaveLength(1)
      expect(before).not.toEqual({ unavailable: true })
    } finally {
      await f.close()
    }
  })
})

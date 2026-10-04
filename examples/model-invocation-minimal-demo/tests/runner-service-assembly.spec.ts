import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import {interpretCallHistory} from '@omne-harness-lite/model-request-runtime-local'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type { RunnerDispatchRequest } from '@omne-harness-lite/loop-extension-runner'
import { createAcceptanceApplication, type ControlledRunFixturePort } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { messagePrefixWithSources } from '../src/model-request-text.ts'
import { DEMO_DEFAULT_RETRY, DEMO_ROOT, demoPublication } from '../src/deployment.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'
const AT = '2026-09-29T00:00:00Z'
function user() {
  const checked = judgeMessage({
    type: 'user',
    id: 'runner-failed-user',
    createdAt: AT,
    blocks: [
      {
        id: 'runner-failed-text',
        kind: 'text',
        text: 'controlled failure',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in checked) || checked.ok.type !== 'user') throw Error('runner user invalid')
  return checked.ok
}
function handle<B extends string>(value: string, brand: B) {
  const parsed = parseOpaqueIdentifier(value, brand)
  if (!('ok' in parsed)) throw Error('controlled owner handle invalid')
  return parsed.ok
}

describe('formal runner and P5 demo assembly', () => {
  it('uses the actual current E, scoped failure source, and one physical SL3 host; replay is read-only', async () => {
    const base = await callDeployment('runner-service-assembly')
    const config = {
      ...base,
      modelRequest: {
        ...base.modelRequest,
        evaluationInputs: {
          ...base.modelRequest.evaluationInputs,
          deployedOfficial: [
            { capability: DEMO_ROOT, meta: false },
            { capability: DEMO_DEFAULT_RETRY, meta: false },
          ],
          async prepare(who: Awaited<ReturnType<typeof actor>>) {
            return {
              publication: demoPublication(who),
              recipe: { rootDefinition: DEMO_ROOT },
            }
          },
        },
      },
    }
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    let validOwner = true,
      handleReleases = 0,
      handleOpens = 0,
      externalAcquires = 0
    let controlledRun: ControlledRunFixturePort | undefined
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
      controlledRunFixture(port) {
        controlledRun = port
      },
      runHistory(prefix, run, attempt) {
        if (run !== 'controlled-run-1' || attempt !== 1) return { unavailable: true }
        const selected = messagePrefixWithSources(prefix, { run, attempt })
        if ('unavailable' in selected) return { unavailable: true }
        const starts = selected.messages.filter(
          message =>
            message.type === 'system_reminder' && message.source.kind === 'attempt_started',
        )
        if (starts.length !== 1) return { unavailable: true }
        // This finite controlled owner never writes a Run end fact; it cannot certify a general G28 owner.
        return {
          known: { run, originalAttempt: attempt, latestAttempt: attempt, terminal: 'open' },
        }
      },
      calibrationHistory(prefix, messages, target) {
        if (target.run !== 'controlled-run-1' || target.attempt !== 1 || target.dispatch !== 1)
          return { sourceUnavailable: true }
        const selected = messagePrefixWithSources(prefix, {
          run: target.run,
          attempt: target.attempt,
        })
        if (
          'unavailable' in selected ||
          selected.messages.length !== messages.length ||
          selected.selectedMessageSources.length !== messages.length ||
          !messages.every((message, index) => modelLogJsonEqual(message, selected.messages[index]))
        )
          return { sourceUnavailable: true }
        const current = interpretCallHistory({ prefix, callId: target.callId })
        return 'absent' in current ? { noObservation: true } : { sourceUnavailable: true }
      },
      async runnerExternal(_who, request) {
        externalAcquires++
        if (!validOwner || request.run !== 'controlled-run-1') return { unavailable: true }
        return {
          readAskState: async () => ({ kind: 'unavailable' }),
          async openHandles() {
            handleOpens++
            return {
              log: handle('controlled-log-1', 'LogHandle'),
              environment: handle('controlled-environment-1', 'EnvironmentHandle'),
              release() {
                handleReleases++
              },
            }
          },
          mintReminder: () => ({ unavailable: true }),
          fallbackNeedsProjection: async () => false,
          commandPresence: async () => 'unavailable',
          invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
        }
      },
    })
    const host = createDemoCallHost()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    let releaseRun: (() => void) | undefined
    try {
      await app.ready
      const who = await actor(app)
      const outsider = await actor(app, 'runner-outsider')
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'runner-service-session')
      if (!('session' in prepared)) throw Error('session preparation unavailable')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      const bound = await app.bindModelRuntime(who, session)
      if (!('service' in bound)) throw Error('runtime binding unavailable')
      expect(await bound.service.selectModel({ session, routeName: MODEL })).toEqual({
        selected: MODEL,
      })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('runner-service-credential'),
          body: Buffer.from('controlled-runner-key'),
        })),
      ).toEqual({ stored: true })
      if (controlledRun === undefined) throw Error('controlled Run port absent')
      const started = await controlledRun.startAttempt(who, session, 'controlled-run-1', 1)
      if (!('report' in started))
        throw Error(`controlled Run unavailable: ${JSON.stringify(started)}`)
      releaseRun = started.release
      releaseRun()
      const effectiveAfterStart = await bound.service.effectiveModel({ session })
      expect(effectiveAfterStart).toHaveProperty('effectiveModel.routeName', MODEL)
      const beforeWrongRun = await app.readSessionLog(who, session)
      expect(
        await app.startServiceCall(who, session, {
          user: user(),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: host.host,
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(await app.readSessionLog(who, session)).toEqual(beforeWrongRun)
      expect(tls.requests).toHaveLength(0)
      tls.setMode('http503')
      const sent = await app.startServiceCall(who, session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
        run: 'controlled-run-1',
        attempt: new LosslessNumber('1'),
        report: started.report,
      })
      if (!('callId' in sent) || !('result' in sent) || !('settled' in sent.result))
        throw Error(
          `controlled failure not settled: ${JSON.stringify({ sent, requests: tls.requests.length })}`,
        )
      expect(sent.result.settled.outcome).toBe('failed')
      expect(tls.requests).toHaveLength(1)
      const attempts = await bound.service.readAttempts({ session, callId: sent.callId })
      if (!('state' in attempts) || attempts.state !== 'awaiting_decision')
        throw Error(`failure source absent: ${JSON.stringify(attempts)}`)
      const request: RunnerDispatchRequest = {
        position: 'after_model_call',
        dimension: { ending: 'failure' },
        subject: attempts.failureSubject,
        manifest: session,
        anchor: sent.callId,
        run: 'controlled-run-1',
        attempt: new LosslessNumber('1'),
      }
      expect(
        await app.dispatchRunner(
          who,
          session,
          {
            position: request.position,
            dimension: request.dimension,
            subject: request.subject,
            manifest: session,
            anchor: request.anchor,
          },
          new AbortController().signal,
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(externalAcquires).toBe(0)
      expect(
        await app.dispatchRunner(
          who,
          session,
          { ...request, run: 'controlled-run-2' },
          new AbortController().signal,
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(externalAcquires).toBe(0)
      expect(
        await app.dispatchRunner(outsider, session, request, new AbortController().signal),
      ).toEqual({ failure: 'unavailable' })
      expect(externalAcquires).toBe(0)
      expect(
        await app.dispatchRunner(who, 'other-session', request, new AbortController().signal),
      ).toEqual({ failure: 'identityMismatch' })
      expect(externalAcquires).toBe(0)
      const tamperedSubject: typeof request.subject = {
        ...request.subject,
        failure: 'request_rejected',
      }
      expect(
        await app.dispatchRunner(
          who,
          session,
          { ...request, subject: tamperedSubject },
          new AbortController().signal,
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(externalAcquires).toBe(0)
      expect(tls.requests).toHaveLength(1)
      validOwner = false
      expect(await app.dispatchRunner(who, session, request, new AbortController().signal)).toEqual(
        { failure: 'unavailable' },
      )
      expect(tls.requests).toHaveLength(1)
      validOwner = true
      const result = await app.dispatchRunner(who, session, request, new AbortController().signal)
      if (!('conclusions' in result))
        throw Error(`runner dispatch unavailable: ${JSON.stringify(result)}`)
      const retry = result.conclusions.find(item => item.output?.kind === 'retry')?.output
      if (retry?.kind !== 'retry') throw Error('P5 did not produce a durable retry plan')
      expect(handleOpens).toBeGreaterThan(0)
      expect(handleReleases).toBe(handleOpens)
      expect(tls.requests).toHaveLength(1)
      const beforeReplay = await app.readSessionLog(who, session)
      if (!('entries' in beforeReplay)) throw Error('runner log unavailable')
      const beforeReplayExternal = externalAcquires
      const replayed = await app.replayRunner(who, session, {
        position: request.position,
        dimension: request.dimension,
        subject: request.subject,
        manifest: session,
        anchor: request.anchor,
        run: 'controlled-run-1',
      })
      expect(replayed).toEqual(result.conclusions)
      expect(externalAcquires).toBe(beforeReplayExternal)
      expect(await app.readSessionLog(who, session)).toEqual(beforeReplay)
      expect(tls.requests).toHaveLength(1)
      const observed = await bound.service.readAttempts({ session, callId: sent.callId })
      if (!('state' in observed) || observed.state !== 'awaiting_decision')
        throw Error('retry history was not recognized')
      expect(observed.failureSubject.retryConclusions).toHaveLength(1)
      const liveSource = await bound.service.readAttempts(
        { session, callId: sent.callId },
        { consumeFailure: true },
      )
      if (liveSource.consumption.kind !== 'failure') throw Error('live failure source absent')
      const source = liveSource.consumption.source
      expect(source.verify(source.subject, { run: 'controlled-run-1', attempt: 1 })).toEqual({
        authoritativeSubject: source.subject,
      })
      const originalRetry = source.subject.retryConclusions[0]
      const originalDispatch = source.subject.dispatches[0]
      if (originalRetry === undefined || originalDispatch === undefined)
        throw Error('durable retry and dispatch facts absent')
      async function rejectChangedSubject(changedSubject: typeof source.subject) {
        expect(source.verify(changedSubject, { run: 'controlled-run-1', attempt: 1 })).toEqual({
          invalidInput: true,
        })
        expect(
          await app.dispatchRunner(
            who,
            session,
            {
              position: 'after_model_call',
              dimension: { ending: 'failure' },
              subject: changedSubject,
              manifest: session,
              anchor: request.anchor,
              run: 'controlled-run-1',
              attempt: 1,
            },
            new AbortController().signal,
          ),
        ).toEqual({ failure: 'invalidInput' })
        expect(externalAcquires).toBe(beforeReplayExternal)
        expect(tls.requests).toHaveLength(1)
      }
      await rejectChangedSubject({
        ...source.subject,
        retryConclusions: [originalRetry, originalRetry],
      })
      await rejectChangedSubject({
        ...source.subject,
        retryConclusions: [{ ...originalRetry, extension: 'tenant:custom' }],
      })
      await rejectChangedSubject({
        ...source.subject,
        dispatches: [{ ...originalDispatch, call: 'another-call' }],
      })
      expect(source.verify(source.subject, { run: 'controlled-run-2', attempt: 1 })).toEqual({
        invalidInput: true,
      })
      expect(source.verify(source.subject, { run: 'controlled-run-1', attempt: 2 })).toEqual({
        authoritativeSubject: source.subject,
      })
      source.release()
      expect(source.verify(source.subject, { run: 'controlled-run-1', attempt: 1 })).toEqual({
        unavailable: true,
      })
      expect(
        await bound.service.canDispatchAgain({ session, callId: sent.callId, plan: retry.plan }),
      ).toEqual({ allowed: true })
      expect(await bound.service.releaseCall({ session, callId: sent.callId })).toEqual({
        callId: sent.callId,
        state: 'handed_up',
      })
      const afterStop = await app.readSessionLog(who, session)
      expect(
        await bound.service.canDispatchAgain({ session, callId: sent.callId, plan: retry.plan }),
      ).toEqual({ alreadyEnded: true })
      expect(
        await bound.service.dispatchAgain({
          session,
          callId: sent.callId,
          plan: retry.plan,
          attempt: 1,
        }),
      ).toEqual({ alreadyEnded: true })
      expect(await app.readSessionLog(who, session)).toEqual(afterStop)
      expect(tls.requests).toHaveLength(1)
      expect(await host.stop()).toEqual({ released: true })
      const stoppedSource = await bound.service.readAttempts(
        { session, callId: sent.callId },
        { consumeFailure: true },
      )
      if (stoppedSource.consumption.kind === 'failure') {
        expect(
          stoppedSource.consumption.source.verify(stoppedSource.consumption.source.subject, {
            run: 'controlled-run-1',
            attempt: 1,
          }),
        ).toEqual({
          unavailable: true,
        })
        stoppedSource.consumption.source.release()
      } else expect(stoppedSource.consumption).toEqual({ kind: 'notApplicable' })
      expect(await app.dispatchRunner(who, session, request, new AbortController().signal)).toEqual(
        { failure: 'unavailable' },
      )
      expect(tls.requests).toHaveLength(1)
    } finally {
      releaseRun?.()
      await host.stop()
      if (diagnostics) {
        const closed = await diagnostics.closeAfterBusiness(() => app.close())
        expect(closed.complete).toBe(true)
      } else expect((await app.close()).complete).toBe(true)
      await tls.close()
    }
  })

  it('rejects laundering an actual noRun failure into a controlled Run before external acquisition', async () => {
    const config = await callDeployment('runner-service-no-run-source')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    let externalAcquires = 0
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
      async runnerExternal() {
        externalAcquires++
        return { unavailable: true }
      },
    })
    const host = createDemoCallHost()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'runner-no-run-source-session')
      if (!('session' in prepared)) throw Error('noRun session unavailable')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.selectModel(who, session, MODEL)).toEqual({ selected: MODEL })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      const bound = await app.bindModelRuntime(who, session)
      if (!('service' in bound)) throw Error('noRun runtime unavailable')
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('runner-no-run-source-credential'),
          body: Buffer.from('controlled-runner-key'),
        })),
      ).toEqual({ stored: true })
      tls.setMode('http503')
      const sent = await app.startServiceCall(who, session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('callId' in sent) || !('result' in sent) || !('settled' in sent.result))
        throw Error(`actual noRun failure unavailable: ${JSON.stringify(sent)}`)
      expect(sent.result.settled.outcome).toBe('failed')
      const attempts = await bound.service.readAttempts({ session, callId: sent.callId })
      if (!('state' in attempts) || attempts.state !== 'awaiting_decision')
        throw Error('actual noRun failure history unavailable')
      const before = await app.readSessionLog(who, session)
      expect(
        await app.dispatchRunner(
          who,
          session,
          {
            position: 'after_model_call',
            dimension: { ending: 'failure' },
            subject: attempts.failureSubject,
            manifest: session,
            anchor: sent.callId,
            run: 'controlled-run-1',
            attempt: 1,
          },
          new AbortController().signal,
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(externalAcquires).toBe(0)
      expect(await app.readSessionLog(who, session)).toEqual(before)
      expect(tls.requests).toHaveLength(1)
    } finally {
      await host.stop()
      if (diagnostics) {
        const closed = await diagnostics.closeAfterBusiness(() => app.close())
        expect(closed.complete).toBe(true)
      } else expect((await app.close()).complete).toBe(true)
      await tls.close()
    }
  })
})

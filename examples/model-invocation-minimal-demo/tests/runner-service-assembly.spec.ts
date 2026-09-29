import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { RunnerDispatchRequest } from '@omne-harness-lite/loop-extension-runner'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
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
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
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
      tls.setMode('http503')
      const sent = await app.startServiceCall(who, session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('callId' in sent) || !('result' in sent) || !('settled' in sent.result))
        throw Error(`controlled failure not settled: ${JSON.stringify(sent)}`)
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
        attempt: 1,
      }
      expect(
        await app.dispatchRunner(outsider, session, request, new AbortController().signal),
      ).toEqual({ failure: 'unavailable' })
      expect(externalAcquires).toBe(0)
      expect(
        await app.dispatchRunner(who, 'other-session', request, new AbortController().signal),
      ).toEqual({ failure: 'identityMismatch' })
      expect(externalAcquires).toBe(0)
      validOwner = false
      expect(await app.dispatchRunner(who, session, request, new AbortController().signal)).toEqual(
        { failure: 'unavailable' },
      )
      expect(tls.requests).toHaveLength(1)
      validOwner = true
      const result = await app.dispatchRunner(who, session, request, new AbortController().signal)
      if (!('conclusions' in result))
        throw Error(`runner dispatch unavailable: ${JSON.stringify(result)}`)
      expect(result.conclusions.some(item => item.output?.kind === 'retry')).toBe(true)
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
      expect(await host.stop()).toEqual({ released: true })
      expect(await app.dispatchRunner(who, session, request, new AbortController().signal)).toEqual(
        { failure: 'unavailable' },
      )
      expect(tls.requests).toHaveLength(1)
    } finally {
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})

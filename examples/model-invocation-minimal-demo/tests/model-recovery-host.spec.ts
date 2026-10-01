import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'

function user(id: string) {
  const judged = judgeMessage({
    type: 'user',
    id: `recovery-user-${id}`,
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: `recovery-text-${id}`,
        kind: 'text',
        text: 'recover the completed batch',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('invalid user fixture')
  return judged.ok
}

describe('demo real recovery host', () => {
  it('stops a held real HTTPS dispatch before draining the call and closing the application', async () => {
    const config = await callDeployment('demo-recovery-held-http')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    tls.setMode('hold')
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    const stopStarted = deferred()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'recovery-held-http')
      if (!('session' in prepared)) throw new Error('session unavailable')
      expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
      expect(await app.selectModel(who, prepared.session, MODEL)).toEqual({ selected: MODEL })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('recovery-held-key'),
          body: Buffer.from('controlled-recovery-key'),
        })),
      ).toEqual({ stored: true })
      expect(
        await app.attachModelCallHost(who, prepared.session, {
          host: host.host,
          async stop() {
            stopStarted.resolve()
            return await host.stop()
          },
          released: () => host.released?.() === true,
        }),
      ).toEqual({ attached: true })
      const dispatch = app.startServiceCall(who, prepared.session, {
        user: user('held'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      await tls.contentSent.promise
      expect(tls.requests).toHaveLength(1)
      const recovering = app.reconcileModelRuntime(who, prepared.session)
      await stopStarted.promise
      let businessClose: Awaited<ReturnType<typeof app.close>> | undefined
      const closing = diagnostics.closeAfterBusiness(async () => {
        businessClose = await app.close()
        return businessClose
      })
      // The server never finishes its held SSE body; only host cancellation may close the socket.
      await tls.socketClosed.promise
      const sent = await dispatch
      if (!('callId' in sent)) throw new Error('held call never opened')
      expect(await recovering).toEqual({ calls: [{ callId: sent.callId, state: 'interrupted' }] })
      expect(host.released?.()).toBe(true)
      expect((await closing).complete).toBe(true)
      expect(businessClose?.complete).toBe(true)
      expect(tls.requests).toHaveLength(1)
    } finally {
      tls.finishHeld()
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })

  it('authenticates, stops the real call host, and recognizes the original JSONL batch twice without another HTTP request', async () => {
    const config = await callDeployment('demo-recovery-complete')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    const recoveryEvents: string[] = []
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: {
        record(event) {
          if (event.phase === 'recovery') recoveryEvents.push(event.outcome)
        },
      },
    })
    const host = createDemoCallHost()
    const nextHost = createDemoCallHost()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const other = await actor(app, 'other')
      const prepared = await app.prepareSession(who, 'recovery-session')
      if (!('session' in prepared)) throw new Error('session unavailable')
      expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
      expect(await app.selectModel(who, prepared.session, MODEL)).toEqual({ selected: MODEL })
      const bound = await app.bindModelRuntime(who, prepared.session)
      if (!('service' in bound)) throw new Error('runtime binding unavailable')
      expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('recovery-key'),
          body: Buffer.from('controlled-recovery-key'),
        })),
      ).toEqual({ stored: true })
      const sent = await app.startServiceCall(who, prepared.session, {
        user: user('first'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('callId' in sent) || !('result' in sent) || !('replyPending' in sent.result))
        throw new Error(`reply not handed off: ${JSON.stringify(sent)}`)
      expect(
        await app.persistModelReply(who, prepared.session, sent.result.replyPending),
      ).toHaveProperty('settled')
      const before = await app.readSessionLog(who, prepared.session)
      if (!('entries' in before)) throw new Error('original batch unreadable')
      expect(await app.reconcileModelRuntime(other, prepared.session)).toEqual({
        failure: 'identityMismatch',
      })
      expect(await app.reconcileModelRuntime(who, prepared.session)).toEqual({
        calls: [{ callId: sent.callId, state: 'complete' }],
      })
      expect(await bound.service.reconcile({ session: prepared.session })).toEqual({
        calls: [{ callId: sent.callId, state: 'complete' }],
      })
      const after = await app.readSessionLog(who, prepared.session)
      if (!('entries' in after)) throw new Error('recovered batch unreadable')
      expect(after.entries).toEqual(before.entries)
      expect(tls.requests).toHaveLength(1)
      expect(host.released?.()).toBe(true)
      expect(recoveryEvents).toEqual(['entered', 'closed', 'entered', 'closed'])
      expect(await app.attachModelCallHost(who, prepared.session, nextHost)).toEqual({
        attached: true,
      })
      const next = await app.startServiceCall(who, prepared.session, {
        user: user('second'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: nextHost.host,
      })
      if (!('result' in next) || !('replyPending' in next.result))
        throw new Error(`next reply unavailable: ${JSON.stringify(next)}`)
      expect(
        await app.persistModelReply(who, prepared.session, next.result.replyPending),
      ).toHaveProperty('settled')
      expect(tls.requests).toHaveLength(2)
      expect(await nextHost.stop()).toEqual({ released: true })
    } finally {
      await host.stop()
      await nextHost.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })

  it('seals a previously acquired service while the actual host stop is still pending', async () => {
    const config = await callDeployment('demo-recovery-seal')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    const stopping = deferred(),
      releaseStop = deferred()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'recovery-seal')
      if (!('session' in prepared)) throw new Error('session unavailable')
      expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
      const bound = await app.bindModelRuntime(who, prepared.session)
      if (!('service' in bound)) throw new Error('runtime binding unavailable')
      expect(await bound.service.legalTargets({ session: prepared.session })).toHaveProperty(
        'legalTargets',
      )
      const other = await app.prepareSession(who, 'recovery-other-session')
      if (!('session' in other)) throw new Error('other session unavailable')
      const otherBound = await app.bindModelRuntime(who, other.session)
      if (!('service' in otherBound)) throw new Error('other runtime binding unavailable')
      expect(await bound.service.legalTargets({ session: other.session })).toEqual({
        unavailable: true,
      })
      expect(
        await app.attachModelCallHost(who, prepared.session, {
          host: host.host,
          async stop() {
            const result = await host.stop()
            stopping.resolve()
            await releaseStop.promise
            return result
          },
        }),
      ).toEqual({ attached: true })
      const recovering = app.reconcileModelRuntime(who, prepared.session)
      await stopping.promise
      expect(await app.reconcileModelRuntime(who, prepared.session)).toEqual({ unavailable: true })
      expect(await bound.service.legalTargets({ session: prepared.session })).toEqual({
        unavailable: true,
      })
      expect(
        await otherBound.service.readAttempts({ session: other.session, callId: 'absent-call' }),
      ).toEqual({ callNotFound: true })
      expect(
        await bound.service.dispatch({ session: prepared.session, callId: 'blocked-call' }),
      ).toEqual({
        runtimeStopped: true,
      })
      let closeSettled = false
      let businessClose: Awaited<ReturnType<typeof app.close>> | undefined
      const closing = diagnostics.closeAfterBusiness(async () => {
        businessClose = await app.close()
        closeSettled = true
        return businessClose
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(closeSettled).toBe(false)
      releaseStop.resolve()
      expect(await recovering).toEqual({ calls: [] })
      expect((await closing).complete).toBe(true)
      expect(businessClose?.complete).toBe(true)
    } finally {
      releaseStop.resolve()
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})

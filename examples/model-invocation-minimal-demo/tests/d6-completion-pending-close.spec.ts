import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoDiagnosticConfig, ensureDemoDiagnosticParent } from '../src/demo.ts'
import { openDemoDiagnosticAssembly } from '../src/diagnostic-assembly.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment, demoRetirement } from './model-request-support.ts'
import { actor, ref } from './support.ts'

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function user() {
  const result = judgeMessage({
    type: 'user',
    id: 'd6-pending-user',
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: 'd6-pending-text',
        kind: 'text',
        text: 'private pending sink prompt',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in result) || result.ok.type !== 'user') throw new Error('invalid D6 user')
  return result.ok
}

describe('D6 actual application close ownership', () => {
  it('keeps the business reply durable while an engineering sink is pending, then closes the real journal', async () => {
    const config = await callDeployment('d6-completion-pending-sink')
    const directory = dirname(config.databaseFile)
    const tls = await createLocalTls(join(directory, 'tls'))
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    const entered = deferred()
    const release = deferred()
    let diagnostics: Awaited<ReturnType<typeof openDemoDiagnosticAssembly>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      await ensureDemoDiagnosticParent(directory)
      const base = createDemoDiagnosticConfig(directory, who.tenant, demoRetirement())
      diagnostics = await openDemoDiagnosticAssembly({
        ...base,
        collector: {
          ...base.collector,
          sink: {
            mode: 'async',
            maxPending: 1,
            maxQueuedRecords: 256,
            maxQueuedBytes: 1_048_576,
            record() {
              entered.resolve()
              return release.promise
            },
          },
        },
      })
      expect(await app.activateModelRequest(who, diagnostics, diagnostics.transports)).toEqual({
        activated: true,
      })
      const prepared = await app.prepareSession(who, 'd6-pending-session')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
      expect(await app.selectModel(who, prepared.session, 'deepseek/deepseek-v4-pro-0813')).toEqual(
        { selected: 'deepseek/deepseek-v4-pro-0813' },
      )
      expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('d6-pending-key'),
          body: Buffer.from('d6-pending-private-key'),
        })),
      ).toEqual({ stored: true })
      const sent = await app.startServiceCall(who, prepared.session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('result' in sent) || !('replyPending' in sent.result))
        throw new Error('model reply not handed off')
      expect(
        await app.persistModelReply(who, prepared.session, sent.result.replyPending),
      ).toHaveProperty('settled')
      const beforeClose = await app.readSessionLog(who, prepared.session)
      expect('entries' in beforeClose && beforeClose.entries.length > 0).toBe(true)
      await entered.promise
      expect(diagnostics.tenant.health().pendingSinks).toBeGreaterThan(0)
      let businessClose: Awaited<ReturnType<typeof app.close>> | undefined
      const incomplete = await diagnostics.closeAfterBusiness(async () => {
        businessClose = await app.close()
        return businessClose
      })
      expect(businessClose?.complete).toBe(true)
      expect(incomplete).toMatchObject({ complete: false, businessComplete: true })
      expect(diagnostics.tenant.health().pendingSinks).toBeGreaterThan(0)
      expect(tls.requests).toHaveLength(1)
      release.resolve()
      const complete = await diagnostics.closeAfterBusiness(() => app.close())
      expect(complete).toMatchObject({ complete: true, businessComplete: true })
      expect(diagnostics.tenant.health().pendingSinks).toBe(0)
      expect(diagnostics.tenant.health().writeState).toBe('closed')
      const afterClose = await diagnostics.tenant.query({
        scope: diagnostics.tenant.scope,
        limit: 128,
        maxBytes: 1_048_576,
      })
      if (!('page' in afterClose)) throw new Error('post-close journal unavailable')
      expect(afterClose.page.records.some(row => row.stage === 'settlement')).toBe(true)
      expect(JSON.stringify(afterClose.page.records)).not.toContain('d6-pending-private-key')
    } finally {
      release.resolve()
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})

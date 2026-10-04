import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { jsonNumberSource, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoDiagnosticConfig, ensureDemoDiagnosticParent } from '../src/demo.ts'
import { openDemoDiagnosticAssembly } from '../src/diagnostic-assembly.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment, demoRetirement } from './model-request-support.ts'
import { actor, ref } from './support.ts'

function user() {
  const result = judgeMessage({
    type: 'user',
    id: 'd6-sink-full-user',
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: 'd6-sink-full-text',
        kind: 'text',
        text: 'private queue-full prompt',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in result) || result.ok.type !== 'user') throw new Error('invalid D6 user')
  return result.ok
}

function latch() {
  let resolve = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('D6 bounded diagnostic output under a real service call', () => {
  it('drops only engineering sink output when its one-slot wait queue fills', async () => {
    const config = await callDeployment('d6-completion-sink-full')
    const directory = dirname(config.databaseFile)
    const tls = await createLocalTls(join(directory, 'tls'))
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    const release = latch()
    let heldTenant = false
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
            maxQueuedRecords: 1,
            maxQueuedBytes: 4096,
            record(record) {
              if (record.scope.kind === 'tenant' && !heldTenant) {
                heldTenant = true
                return release.promise
              }
              return Promise.resolve()
            },
          },
        },
      })
      expect(await app.activateModelRequest(who, diagnostics, diagnostics.transports)).toEqual({
        activated: true,
      })
      const prepared = await app.prepareSession(who, 'd6-sink-full')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
      expect(await app.selectModel(who, prepared.session, 'deepseek/deepseek-v4-pro-0813')).toEqual(
        {
          selected: 'deepseek/deepseek-v4-pro-0813',
        },
      )
      expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('d6-sink-full-key'),
          body: Buffer.from('d6-sink-full-private-key'),
        })),
      ).toEqual({ stored: true })
      const sent = await app.startServiceCall(who, prepared.session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('result' in sent) || !('replyPending' in sent.result))
        throw new Error('real model reply missing')
      const pending = sent.result.replyPending
      expect(pending.outcome).toBe('complete')
      expect(pending.cost.source).toBe('upstream_usage')
      if (pending.cost.cost_usd === 'unknown') throw new Error('upstream cost unexpectedly unknown')
      expect(jsonNumberSource(pending.cost.cost_usd)).toBe('0.0000117')
      expect(await app.persistModelReply(who, prepared.session, pending)).toHaveProperty('settled')
      const logged = await app.readSessionLog(who, prepared.session)
      if (!('entries' in logged)) throw new Error('durable response unavailable')
      expect(writeJsonLossless(logged.entries.map(entry => entry.payload))).toContain(
        '"cost_usd":0.0000117',
      )
      expect(tls.requests).toHaveLength(1)
      expect(diagnostics.tenant.health().sinkDropped).toBeGreaterThan(0)
      expect(diagnostics.tenant.health().pendingSinks).toBeGreaterThan(0)
      expect(diagnostics.tenant.health().pendingSinks).toBeLessThanOrEqual(2)
      let businessClose: Awaited<ReturnType<typeof app.close>> | undefined
      const incomplete = await diagnostics.closeAfterBusiness(async () => {
        businessClose = await app.close()
        return businessClose
      })
      expect(businessClose?.complete).toBe(true)
      expect(incomplete).toMatchObject({ complete: false, businessComplete: true })
      expect(diagnostics.tenant.health().pendingSinks).toBeGreaterThan(0)
      release.resolve()
      const complete = await diagnostics.closeAfterBusiness(() => app.close())
      expect(complete).toMatchObject({ complete: true, businessComplete: true })
      expect(diagnostics.tenant.health()).toMatchObject({ pendingSinks: 0, coverage: 'degraded' })
      expect(tls.requests).toHaveLength(1)
    } finally {
      release.resolve()
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})

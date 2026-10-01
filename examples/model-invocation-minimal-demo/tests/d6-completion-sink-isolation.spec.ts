import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { jsonNumberSource, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import type { AcceptanceEvent } from '../src/types.ts'
import { createDemoDiagnosticConfig, ensureDemoDiagnosticParent } from '../src/demo.ts'
import { openDemoDiagnosticAssembly } from '../src/diagnostic-assembly.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment, demoRetirement } from './model-request-support.ts'
import { actor, ref } from './support.ts'

function user() {
  const result = judgeMessage({
    type: 'user',
    id: 'd6-sink-user',
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: 'd6-sink-text',
        kind: 'text',
        text: 'private sink fault prompt',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in result) || result.ok.type !== 'user') throw new Error('invalid D6 user')
  return result.ok
}

describe('D6 application business isolation from diagnostic sink failure', () => {
  it.each(['syncThrow', 'asyncReject'] as const)(
    '%s keeps the actual reply, fee, and one HTTP send while health reports sink failure',
    async mode => {
      const config = await callDeployment(`d6-completion-sink-${mode}`)
      const directory = dirname(config.databaseFile)
      const tls = await createLocalTls(join(directory, 'tls'))
      const events: AcceptanceEvent[] = []
      const app = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: {
          record(event) {
            events.push(event)
          },
        },
      })
      const host = createDemoCallHost()
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
            sink:
              mode === 'syncThrow'
                ? {
                    mode: 'sync',
                    record() {
                      throw new Error('private diagnostic sink failure')
                    },
                  }
                : {
                    mode: 'async',
                    maxPending: 1,
                    maxQueuedRecords: 256,
                    maxQueuedBytes: 1_048_576,
                    record() {
                      return Promise.reject(new Error('private diagnostic sink rejection'))
                    },
                  },
          },
        })
        expect(await app.activateModelRequest(who, diagnostics, diagnostics.transports)).toEqual({
          activated: true,
        })
        const prepared = await app.prepareSession(who, `d6-sink-${mode}`)
        if (!('session' in prepared)) throw new Error('session preparation failed')
        expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
        expect(
          await app.selectModel(who, prepared.session, 'deepseek/deepseek-v4-pro-0813'),
        ).toEqual({ selected: 'deepseek/deepseek-v4-pro-0813' })
        expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({
          attached: true,
        })
        expect(
          await app.publishCredential(who, async checked => ({
            account: checked.account,
            tenant: checked.tenant,
            sourceRef: ref(`d6-sink-${mode}-key`),
            body: Buffer.from('d6-sink-private-key'),
          })),
        ).toEqual({ stored: true })
        const sent = await app.startServiceCall(who, prepared.session, {
          user: user(),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: host.host,
        })
        if (!('result' in sent) || !('replyPending' in sent.result))
          throw new Error('model reply not handed off')
        const pending = sent.result.replyPending
        expect(pending.outcome).toBe('complete')
        expect(pending.cost.source).toBe('upstream_usage')
        if (pending.cost.cost_usd === 'unknown')
          throw new Error('upstream fee unexpectedly unknown')
        expect(jsonNumberSource(pending.cost.cost_usd)).toBe('0.0000117')
        expect(await app.persistModelReply(who, prepared.session, pending)).toHaveProperty(
          'settled',
        )
        // The demo's own persisted-message settlement reports through the typed acceptance port;
        // the runtime's ready handoff is a published marker, not a runtime settlement batch.
        expect(
          events.some(
            event =>
              event.phase === 'settlement' &&
              event.outcome === 'settlement.committed' &&
              event.settlement?.call === pending.call.callId,
          ),
        ).toBe(true)
        const logged = await app.readSessionLog(who, prepared.session)
        if (!('entries' in logged)) throw new Error('durable session prefix unavailable')
        expect(writeJsonLossless(logged.entries.map(entry => entry.payload))).toContain(
          '"cost_usd":0.0000117',
        )
        expect(tls.requests).toHaveLength(1)
        await expect.poll(() => diagnostics?.tenant.health().sinkFailures).toBeGreaterThan(0)
        const closed = await diagnostics.closeAfterBusiness(() => app.close())
        expect(closed.businessComplete).toBe(true)
        expect(closed.complete).toBe(true)
        expect(diagnostics.tenant.health()).toMatchObject({
          pendingSinks: 0,
          coverage: 'degraded',
        })
        const rows = await diagnostics.tenant.query({
          scope: diagnostics.tenant.scope,
          limit: 128,
          maxBytes: 1_048_576,
        })
        if (!('page' in rows)) throw new Error('tenant journal unavailable after sink failure')
        expect(
          rows.page.records.some(
            row =>
              row.source === 'runtime' &&
              row.stage === 'reply_handoff' &&
              row.association?.call === pending.call.callId,
          ),
        ).toBe(true)
        expect(JSON.stringify(rows.page.records)).not.toContain('private diagnostic sink')
      } finally {
        await host.stop()
        if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
        else await app.close()
        await tls.close()
      }
    },
  )
})

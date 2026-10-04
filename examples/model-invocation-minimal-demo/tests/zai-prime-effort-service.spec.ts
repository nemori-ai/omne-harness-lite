import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { zaiDefinitions, createZaiCommercialInputMeter, createOfficialProfileContent } from '@omne-harness-lite/pi-ai-transport'
import { type InputMeter } from '@omne-harness-lite/model-request-runtime'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment } from './model-request-support.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const cases = zaiDefinitions
  .filter(definition => definition.modelId === 'z-ai/glm-5.3-prime')
  .flatMap(definition =>
    (['low', 'high', 'max'] as const).map(effort => ({ model: definition.modelId, effort })),
  )
function user(index: number) {
  const judged = judgeMessage({
    type: 'user',
    id: `remaining-user-${index}`,
    createdAt: '2026-09-29T00:00:00Z',
    blocks: [
      {
        id: `text-${index}`,
        kind: 'text',
        text: `Visible turn ${index}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw Error('invalid user fixture')
  return judged.ok
}
describe.each(cases)(
  'ZAI Prime declared effort through authorized service: $model $effort',
  ({ model, effort }) => {
    it.each([false, true])('actual service, excess admission reserve %s', async overLimit => {
      const definition = zaiDefinitions.find(value => value.modelId === model)
      if (!definition) throw Error('official ZAI Prime definition missing')
      const base = await callDeployment('zai-prime-effort-service')
      const profile = createOfficialProfileContent(definition, {
        providers: ['alibaba'],
        allowFallback: false,
        configuration: {
          revision: 'zai-prime-effort-service-1',
          values: {
            cache: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] },
          },
        },
      })
      if ('rejected' in profile) throw Error(profile.rejected)
      const original = createZaiCommercialInputMeter(definition)
      if (!original) throw Error('ZAI Prime meter unavailable')
      let full = 0,
        delta = 0
      const meter: InputMeter = {
        ...original,
        measureFull(value) {
          full++
          return original.measureFull(value)
        },
        measureNew(value) {
          delta++
          return original.measureNew(value)
        },
      }
      const config = {
        ...base,
        officialManifest: { ordinal: 1, entries: [profile.ok] },
        modelRequest: {
          ...base.modelRequest,
          tokenMargin: { multiplier: 1.1, reserveTokens: overLimit ? 2000000 : 256 },
          transport: {
            ...base.modelRequest.transport,
            definitions: [definition],
            inputMeters: [meter],
          },
        },
      }
      const tls = await createLocalTls(
        join(dirname(config.databaseFile), 'tls'),
        async () => {},
        0,
        () => model,
        JSON.stringify({
          prompt_tokens: 10000,
          completion_tokens: 3,
          prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          cost: 0.0000117,
        }),
        'alibaba',
      )
      tls.setMode('complete')
      const app = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
      })
      const host = createDemoCallHost()
      let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
      try {
        await app.ready
        const who = await actor(app)
        diagnostics = await activateModelFixture(app, who, config)
        const prepared = await app.prepareSession(who, 'remaining-service-session')
        if (!('session' in prepared)) throw Error('session preparation failed')
        const session = prepared.session
        expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
        expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
        expect(
          await app.publishCredential(who, async checked => ({
            account: checked.account,
            tenant: checked.tenant,
            sourceRef: ref('remaining-test-key'),
            body: Buffer.from('local-only'),
          })),
        ).toEqual({ stored: true })
        expect(await app.selectModel(who, session, model)).toEqual({ selected: model })
        for (let index = 1; index <= (overLimit ? 1 : 3); index++) {
          const prior = { full, delta }
          const sent = await app.startServiceCall(who, session, {
            user: user(index),
            parameters: { reasoningEffort: effort, maxOutputTokens: 1024 },
            host: host.host,
          })
          if (overLimit) {
            expect(JSON.stringify(sent)).toContain('input_limit_exceeded')
            expect(tls.requests).toHaveLength(0)
            continue
          }
          if (!('result' in sent) || !('replyPending' in sent.result))
            throw Error(JSON.stringify(sent))
          const response = sent.result.replyPending
          expect(response.inputCalibration.observedInput).toMatchObject({ kind: 'from_usage' })
          expect(writeJsonLossless(response.usage.input_tokens)).toBe('10000')
          expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.0000117')
          expect(await app.persistModelReply(who, session, response)).toHaveProperty('settled')
          expect(full - prior.full).toBe(2)
          // Full-only: an unavailable delta never claims calibrated reuse.
          expect(delta - prior.delta).toBeLessThanOrEqual(2)
        }
        expect(tls.requests).toHaveLength(overLimit ? 0 : 3)
        if (!overLimit) {
          for (const request of tls.requests)
            expect(request.body).toMatchObject({ reasoning: { effort } })
          expect(tls.requests[1]?.body).toMatchObject({
            model,
            messages: [
              { role: 'user', content: [{ type: 'text', text: 'Visible turn 1' }] },
              { role: 'assistant', content: 'first second' },
              { role: 'user', content: [{ type: 'text', text: 'Visible turn 2' }] },
            ],
          })
        }
        expect(tls.failures).toEqual([])
      } finally {
        await host.stop()
        if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
        else await app.close()
        await tls.close()
      }
    })
  },
)

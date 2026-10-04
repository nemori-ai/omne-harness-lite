import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { jsonNumberSource, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  xaiDefinitions,
  createXaiInputMeter,
  createOfficialProfileContent,
  type InputMeter,
} from '@omne-harness-lite/pi-ai-transport'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment } from './model-request-support.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const cases = xaiDefinitions.flatMap(definition =>
  (['low', 'medium', 'high'] as const).map(effort => ({ model: definition.modelId, effort })),
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
  'xAI declared effort through authorized service: $model $effort',
  ({ model, effort }) => {
    it.each([false, true])('actual service, excess admission reserve %s', async overLimit => {
      const definition = xaiDefinitions.find(value => value.modelId === model)
      if (!definition) throw Error('official xAI definition missing')
      const base = await callDeployment('xai-effort-service')
      const profile = createOfficialProfileContent(definition, {
        providers: ['xai'],
        allowFallback: false,
        configuration: {
          revision: 'xai-effort-service-1',
          values: {
            cache: { mode: 'automatic' },
          },
        },
      })
      if ('rejected' in profile) throw Error(profile.rejected)
      const original = createXaiInputMeter(definition)
      if (!original) throw Error('xAI meter unavailable')
      let full = 0,
        delta = 0,
        replay = 0
      const marginals: { kind: 'new' | 'replay'; tokens: string; preceding: number }[] = []
      const checkMarginal = (
        kind: 'new' | 'replay',
        value: Parameters<InputMeter['measureNew']>[0] | Parameters<InputMeter['measureReplay']>[0],
        result: ReturnType<InputMeter['measureNew']>,
      ) => {
        expect(result.kind).toBe('estimated')
        if (result.kind !== 'estimated') throw Error('visible marginal unavailable')
        const envelope = Object.fromEntries(
          Object.entries(value.envelope).filter(([key]) => key !== 'tools'),
        )
        const byteCount = (messages: typeof value.units) =>
          new TextEncoder().encode(JSON.stringify({ ...envelope, messages })).length
        const expected = Math.floor(byteCount(value.units) / 4) - Math.floor(byteCount([]) / 4)
        expect(jsonNumberSource(result.tokens)).toBe(String(expected))
        marginals.push({ kind, tokens: String(expected), preceding: value.precedingUnitCount })
      }
      const meter: InputMeter = {
        ...original,
        measureFull(value) {
          full++
          return original.measureFull(value)
        },
        measureReplay(value) {
          replay++
          expect(value.observation.inputCalibration.observedInput).toMatchObject({
            kind: 'from_usage',
          })
          expect(writeJsonLossless(value.observation.usage.input_tokens)).toBe('10000')
          const result = original.measureReplay(value)
          checkMarginal('replay', value, result)
          return result
        },
        measureNew(value) {
          delta++
          const result = original.measureNew(value)
          checkMarginal('new', value, result)
          return result
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
        'xai',
      )
      tls.setMode('reasoning')
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
          const prior = { full, delta, replay }
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
          expect(full - prior.full).toBe(index === 1 ? 2 : 0)
          expect(delta - prior.delta).toBe(index === 1 ? 0 : 2)
          expect(replay - prior.replay).toBe(index === 1 ? 0 : 2)
          expect(response.inputCalibration.requestInput).toMatchObject({
            kind: 'known',
            // The xAI meter now counts each complete output group (transport X46 mapping).
            countingBasis: { replayRevision: 'xai-complete-output-group-workload-estimated/1' },
          })
        }
        expect(tls.requests).toHaveLength(overLimit ? 0 : 3)
        if (!overLimit) {
          for (const request of tls.requests)
            expect(request.body).toMatchObject({ reasoning: { effort } })
          expect(tls.requests[1]?.body).toMatchObject({
            model,
            messages: [
              { role: 'user', content: [{ type: 'text', text: 'Visible turn 1' }] },
              { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
              { role: 'user', content: [{ type: 'text', text: 'Visible turn 2' }] },
            ],
          })
        }
        if (!overLimit) {
          expect(marginals.map(value => value.preceding)).toEqual([1, 1, 1, 1, 3, 3, 3, 3])
          // Changed envelope invalidates the response anchor; visible history must be fully recounted.
          const prior = { full, delta, replay }
          const changed = await app.startServiceCall(who, session, {
            user: user(4),
            parameters: { reasoningEffort: effort, maxOutputTokens: 513 },
            host: host.host,
          })
          if (!('result' in changed) || !('replyPending' in changed.result))
            throw Error(JSON.stringify(changed))
          expect(full - prior.full).toBe(2)
          expect(delta - prior.delta).toBe(0)
          expect(replay - prior.replay).toBe(0)
          expect(tls.requests).toHaveLength(4)
          expect(tls.requests[3]?.body).toMatchObject({ max_tokens: 513 })
          expect(
            await app.persistModelReply(who, session, changed.result.replyPending),
          ).toHaveProperty('settled')
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

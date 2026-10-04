import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { openaiDefinitions, createOpenAiInputMeter, createOfficialProfileContent } from '@omne-harness-lite/pi-ai-transport'
import { type InputMeter } from '@omne-harness-lite/model-request-runtime'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment } from './model-request-support.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const cases = ['openai/gpt-5.6-sol', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-luna'].map(model => ({
  model,
  effort: 'low' as const,
}))
const detail = {
  type: 'reasoning.encrypted',
  data: 'local-encrypted-preserved',
  format: 'openai-responses-v1',
  id: 'rs_local',
  index: 0,
}

function user(index: number) {
  const judged = judgeMessage({
    type: 'user',
    id: `luna-user-${index}`,
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
  '$model complete output history effort $effort through authorized service',
  ({ model, effort }) => {
    it.each([false, true])('actual service, force full remeasurement %s', async forceFull => {
      const definition = openaiDefinitions.find(value => value.modelId === model)!
      const base = await callDeployment('openai-complete-output-history-service')
      const profile = createOfficialProfileContent(definition, {
        providers: ['openai'],
        allowFallback: false,
        configuration: { revision: 'luna-service-1', values: { cache: { mode: 'automatic' } } },
      })
      if ('rejected' in profile) throw Error(profile.rejected)
      const original = createOpenAiInputMeter(definition)
      let full = 0,
        delta = 0
      const replayContributions: unknown[] = []
      const fullGroups: number[] = [],
        newGroups: number[] = []
      const meter: InputMeter = {
        ...original,
        measureFull(value) {
          full++
          fullGroups.push(value.outputHistory.length)
          return original.measureFull(value)
        },
        measureReplay(value) {
          const measured = original.measureReplay(value)
          replayContributions.push(measured)
          return measured
        },
        measureNew(value) {
          delta++
          newGroups.push(value.outputHistory.length)
          return original.measureNew(value)
        },
      }
      const config = {
        ...base,
        officialManifest: { ordinal: 1, entries: [profile.ok] },
        modelRequest: {
          ...base.modelRequest,
          tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
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
          completion_tokens: 18,
          completion_tokens_details: { reasoning_tokens: 11 },
          prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          cost: 0.0000117,
        }),
        'OpenAI',
        [{ reasoning_details: [detail] }],
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
        const prepared = await app.prepareSession(who, 'luna-service-session')
        if (!('session' in prepared)) throw Error('session preparation failed')
        const session = prepared.session
        expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
        expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
        expect(
          await app.publishCredential(who, async checked => ({
            account: checked.account,
            tenant: checked.tenant,
            sourceRef: ref('luna-test-key'),
            body: Buffer.from('local-only'),
          })),
        ).toEqual({ stored: true })
        expect(await app.selectModel(who, session, model)).toEqual({ selected: model })
        for (let index = 1; index <= 3; index++) {
          const prior = { full, delta }
          tls.setUsageJson(
            index === 2
              ? JSON.stringify({
                  completion_tokens: 18,
                  completion_tokens_details: { reasoning_tokens: 11 },
                  cost: 0.0000117,
                })
              : JSON.stringify({
                  prompt_tokens: 10000,
                  completion_tokens: 18,
                  completion_tokens_details: { reasoning_tokens: 11 },
                  prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                  cost: 0.0000117,
                }),
          )
          const sent = await app.startServiceCall(who, session, {
            user: user(index),
            parameters: {
              ...(effort === undefined ? {} : { reasoningEffort: effort }),
              maxOutputTokens: index === 3 && forceFull ? 1025 : 1024,
            },
            host: host.host,
          })
          if (!('result' in sent) || !('replyPending' in sent.result))
            throw Error(JSON.stringify(sent))
          const response = sent.result.replyPending
          expect(response.inputCalibration.observedInput.kind).toBe(
            index === 2 ? 'unavailable' : 'from_usage',
          )
          expect(writeJsonLossless(response.usage.input_tokens)).toBe(
            index === 2 ? '"unknown"' : '10000',
          )
          expect(response.usage).toMatchObject({ output_tokens: 18, reasoning_tokens: 11 })
          expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.0000117')
          expect(await app.persistModelReply(who, session, response)).toHaveProperty('settled')
          expect(full - prior.full).toBe(index === 1 || (index === 3 && forceFull) ? 2 : 0)
          expect(delta - prior.delta).toBe(index === 1 || (index === 3 && forceFull) ? 0 : 2)
        }
        expect(tls.requests).toHaveLength(3)
        expect(tls.requests[1]?.body).toMatchObject({
          model,
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Visible turn 1' }] },
            { role: 'assistant', content: 'first second', reasoning_details: [detail] },
            { role: 'user', content: [{ type: 'text', text: 'Visible turn 2' }] },
          ],
        })
        for (const sent of tls.requests) expect(sent.body).toMatchObject({ model })
        for (const sent of tls.requests) {
          if (effort === undefined) expect(sent.body).not.toHaveProperty('reasoning')
          else expect(sent.body).toMatchObject({ reasoning: { effort } })
        }
        expect(replayContributions).toHaveLength(forceFull ? 2 : 4)
        if (forceFull) expect(fullGroups).toContain(2)
        else expect(newGroups).toContain(1)
        for (const value of replayContributions)
          expect(value).toEqual({ kind: 'estimated', tokens: 18 })
        expect(JSON.stringify(tls.requests[2]?.body).split(detail.data)).toHaveLength(3)
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

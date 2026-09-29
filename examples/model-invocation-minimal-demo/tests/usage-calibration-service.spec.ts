import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  createOfficialProfileContent,
  type InputMeter,
} from '@omne-harness-lite/pi-ai-transport'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment } from './model-request-support.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const AT = '2026-09-28T00:00:00Z'
const models = anthropicDefinitions.slice(0, 2)

function user(index: number) {
  const judged = judgeMessage({
    type: 'user',
    id: `calibration-user-${index}`,
    createdAt: AT,
    blocks: [
      {
        id: `calibration-text-${index}`,
        kind: 'text',
        text: `Turn ${index}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('invalid user fixture')
  return judged.ok
}

describe('actual service response calibration', () => {
  it('uses an older accurate anchor after missing usage and returns to full after a model switch', async () => {
    const base = await callDeployment('usage-calibration-service')
    const profiles = models.map(definition => {
      if (definition === undefined) throw new Error('official model missing')
      const profile = createOfficialProfileContent(definition, {
        providers: ['anthropic'],
        allowFallback: false,
        configuration: {
          revision: 'calibration-service-1',
          values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
        },
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      return profile.ok
    })
    const measures = new Map<string, { full: number; replay: number; fresh: number }>()
    const meters: InputMeter[] = models.map(definition => {
      if (definition === undefined) throw new Error('official meter model missing')
      const original = createAnthropicInputMeter(definition)
      const count = { full: 0, replay: 0, fresh: 0 }
      measures.set(definition.modelId, count)
      return {
        ...original,
        measureFull(input) {
          count.full++
          return original.measureFull(input)
        },
        measureReplay(input) {
          count.replay++
          return original.measureReplay(input)
        },
        measureNew(input) {
          count.fresh++
          return original.measureNew(input)
        },
      }
    })
    const config = {
      ...base,
      officialManifest: { ordinal: 1, entries: profiles },
      modelRequest: {
        ...base.modelRequest,
        transport: {
          ...base.modelRequest.transport,
          definitions: [...models],
          inputMeters: meters,
        },
      },
    }
    const tls = await createLocalTls(
      join(dirname(config.databaseFile), 'tls'),
      async () => {},
      0,
      body => {
        if (body === null || typeof body !== 'object' || !('model' in body))
          throw new Error('actual wire model missing')
        if (typeof body.model !== 'string') throw new Error('actual wire model invalid')
        return body.model
      },
      JSON.stringify({
        prompt_tokens: 10000,
        completion_tokens: 3,
        total_tokens: 10003,
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        cost: 0.0000117,
      }),
      'Anthropic',
    )
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
      const prepared = await app.prepareSession(who, 'calibration-service-session')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('calibration-service-key'),
          body: Buffer.from('controlled-calibration-key'),
        })),
      ).toEqual({ stored: true })
      const firstDefinition = models[0]
      const nextDefinition = models[1]
      if (firstDefinition === undefined || nextDefinition === undefined)
        throw new Error('two official Anthropic models required')
      const firstModel = firstDefinition.modelId
      const nextModel = nextDefinition.modelId
      expect(await app.selectModel(who, session, firstModel)).toEqual({ selected: firstModel })
      async function turn(
        index: number,
        model: string,
        observedInput: 'from_usage' | 'unavailable' = 'from_usage',
      ) {
        const count = measures.get(model)
        if (count === undefined) throw new Error('actual meter missing')
        const before = { ...count }
        const sent = await app.startServiceCall(who, session, {
          user: user(index),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: host.host,
        })
        if (!('result' in sent) || !('replyPending' in sent.result))
          throw new Error(`turn ${index} failed: ${JSON.stringify(sent)}`)
        expect(sent.result.replyPending.inputCalibration).toMatchObject({
          requestInput: { kind: 'known' },
          observedInput: { kind: observedInput },
        })
        expect(await app.persistModelReply(who, session, sent.result.replyPending)).toHaveProperty(
          'settled',
        )
        const after = measures.get(model)
        if (after === undefined) throw new Error('actual meter disappeared')
        return {
          full: after.full - before.full,
          replay: after.replay - before.replay,
          fresh: after.fresh - before.fresh,
        }
      }
      const first = await turn(1, firstModel)
      const second = await turn(2, firstModel)
      tls.setUsageJson(null)
      const third = await turn(3, firstModel, 'unavailable')
      tls.setUsageJson(undefined)
      const anchoredEarlier = await turn(4, firstModel)
      expect(first.full).toBeGreaterThan(0)
      expect(first.fresh).toBe(0)
      expect(second.full).toBe(0)
      expect(second.fresh).toBeGreaterThan(0)
      expect(third.full).toBe(0)
      expect(third.fresh).toBeGreaterThan(0)
      expect(anchoredEarlier.full).toBe(0)
      expect(anchoredEarlier.fresh).toBeGreaterThan(0)
      expect(await app.selectModel(who, session, nextModel)).toEqual({ selected: nextModel })
      const switched = await turn(5, nextModel)
      expect(switched.full).toBeGreaterThan(0)
      expect(switched.fresh).toBe(0)
      expect(tls.requests).toHaveLength(5)
      expect(tls.requests.map(request => (request.body as { model: string }).model)).toEqual([
        firstModel,
        firstModel,
        firstModel,
        firstModel,
        nextModel,
      ])
      expect(tls.requests[2]?.body).toMatchObject({
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Turn 1' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'first second' }] },
          { role: 'user', content: [{ type: 'text', text: 'Turn 2' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'first second' }] },
          { role: 'user', content: [{ type: 'text', text: 'Turn 3' }] },
        ],
      })
      expect(tls.failures).toEqual([])
    } finally {
      await host.stop()
      if (diagnostics !== undefined) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})

import { readFileSync } from 'node:fs'
import { crc32 } from 'node:zlib'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  openaiDefinitions,
  createOpenAiInputMeter,
  createOfficialProfileContent,
  type InputMeter,
} from '@omne-harness-lite/pi-ai-transport'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment } from './model-request-support.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const models = [
  'openai/gpt-6-sol',
  'openai/gpt-6-luna',
  'openai/gpt-6-sol-pro',
  'openai/gpt-6-luna-pro',
]
const image = readFileSync(
  new URL(
    '../../../packages/model/pi-ai-transport/tests/fixtures/openai-meter/1024x1024.png',
    import.meta.url,
  ),
).toString('base64')

function paddedImage(bytes: number) {
  const original = Buffer.from(image, 'base64')
  const data = Buffer.alloc(bytes - original.length - 12, 65)
  data.set(Buffer.from('Comment\0'))
  const header = Buffer.alloc(8)
  header.writeUInt32BE(data.length)
  header.write('tEXt', 4)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])))
  return Buffer.concat([
    original.subarray(0, -12),
    header,
    data,
    crc,
    original.subarray(-12),
  ]).toString('base64')
}
function user(index: number, bytes?: number) {
  const judged = judgeMessage({
    type: 'user',
    id: `sol-luna-images-user-${index}`,
    createdAt: '2026-09-29T00:00:00Z',
    blocks: [
      {
        id: `text-${index}`,
        kind: 'text',
        text: `Visible turn ${index}`,
        visibility: { toHuman: true, toModel: true },
      },
      {
        id: `image-${index}`,
        kind: 'image',
        mediaType: 'image/png',
        data: { inline: bytes === undefined ? image : paddedImage(bytes) },
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw Error('invalid user fixture')
  return judged.ok
}
describe.each(models)('%s images through authorized service', model => {
  const modes =
    model === 'openai/gpt-6-sol'
      ? (['positive', 'tokens', 'bytes', 'boundary'] as const)
      : (['positive', 'tokens', 'bytes'] as const)
  it.each(modes)('actual service %s', async mode => {
    const overLimit = mode === 'tokens' || mode === 'bytes'
    const rounds = overLimit || mode === 'boundary' ? 1 : 3
    const pro = model.endsWith('-pro')
    const definition = openaiDefinitions.find(value => value.modelId === model)!
    const base = await callDeployment('openai-sol-luna-images-completion-service')
    const profile = createOfficialProfileContent(definition, {
      providers: ['openai'],
      allowFallback: false,
      configuration: {
        revision: 'sol-luna-images-service-1',
        values: { cache: { mode: 'automatic' } },
      },
    })
    if ('rejected' in profile) throw Error(profile.rejected)
    const original = createOpenAiInputMeter(definition)
    let full = 0,
      delta = 0
    const meter: InputMeter = {
      ...original,
      measureFull(value) {
        full++
        const measurement = original.measureFull(value)
        expect(measurement.kind).toBe('estimated')
        return measurement
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
        // This byte-boundary scenario exercises a large durable history. Keep a
        // bounded operational settlement window independent of the 4 MiB gate.
        settlement: {
          ...base.modelRequest.settlement,
          contention: {
            ...base.modelRequest.settlement.contention,
            limits: {
              ...base.modelRequest.settlement.contention.limits,
              retainedBytes:
                mode === 'boundary'
                  ? 16 * 1024 * 1024
                  : base.modelRequest.settlement.contention.limits.retainedBytes,
              elapsedMs:
                mode === 'boundary'
                  ? 60000
                  : base.modelRequest.settlement.contention.limits.elapsedMs,
            },
          },
        },
        tokenMargin: { multiplier: 1.1, reserveTokens: mode === 'tokens' ? 1000000 : 256 },
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
      'OpenAI',
    )
    tls.setMode('reasoning')
    const events: unknown[] = []
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
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'sol-luna-images-service-session')
      if (!('session' in prepared)) throw Error('session preparation failed')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('sol-luna-images-test-key'),
          body: Buffer.from('local-only'),
        })),
      ).toEqual({ stored: true })
      expect(await app.selectModel(who, session, model)).toEqual({ selected: model })
      for (let index = 1; index <= rounds; index++) {
        const prior = { full, delta }
        const sent = await app.startServiceCall(who, session, {
          user: user(index, mode === 'bytes' ? 4194305 : mode === 'boundary' ? 4194304 : undefined),
          parameters: {
            reasoningEffort: 'low',
            maxOutputTokens: 1024,
          },
          host: host.host,
        })
        if (overLimit) {
          expect(JSON.stringify(sent)).toContain('input_limit_exceeded')
          expect(JSON.stringify(sent)).toContain(
            mode === 'bytes' ? 'maxImageBytes' : 'maxInputTokens',
          )
          expect(tls.requests).toHaveLength(0)
          continue
        }
        if (!('result' in sent) || !('replyPending' in sent.result))
          throw Error(
            JSON.stringify({
              sent,
              httpRequests: tls.requests.length,
              tlsFailures: tls.failures,
              full,
              delta,
              events,
            }),
          )
        const response = sent.result.replyPending
        expect(response.inputCalibration.observedInput).toMatchObject(
          pro ? { kind: 'unavailable', reason: 'scope_unknown' } : { kind: 'from_usage' },
        )
        expect(writeJsonLossless(response.usage.input_tokens)).toBe('10000')
        expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.0000117')
        expect(await app.persistModelReply(who, session, response)).toHaveProperty('settled')
        if (pro || index === 1) {
          expect(full - prior.full).toBeGreaterThan(0)
          expect(delta - prior.delta).toBe(0)
        } else {
          expect(full - prior.full).toBe(0)
          expect(delta - prior.delta).toBeGreaterThan(0)
        }
      }
      expect(tls.requests).toHaveLength(overLimit ? 0 : rounds)
      if (mode === 'positive')
        expect(tls.requests[1]?.body).toMatchObject({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Visible turn 1' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } },
              ],
            },
            { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Visible turn 2' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } },
              ],
            },
          ],
        })
      if (mode === 'boundary') {
        const expectedImage = paddedImage(4194304)
        expect(Buffer.from(expectedImage, 'base64')).toHaveLength(4194304)
        expect(tls.requests[0]?.body).toMatchObject({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Visible turn 1' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${expectedImage}` } },
              ],
            },
          ],
        })
      }
      for (const sent of tls.requests) expect(sent.body).toMatchObject({ model })
      for (const sent of tls.requests) {
        expect(sent.body).toMatchObject({ reasoning: { effort: 'low' } })
      }
      expect(tls.failures).toEqual([])
    } finally {
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})

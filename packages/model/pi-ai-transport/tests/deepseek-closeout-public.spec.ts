import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { invokeModel } from '@omne-harness-lite/model-request-runtime'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { createDeepSeekV4ProInputMeter } from '../src/input-meters/deepseek-v4-pro.ts'
import { createDeepSeekV41FlashInputMeter } from '../src/input-meters/deepseek-v41-flash.ts'
import {
  deepseekV4Pro0813Definition,
  deepseekV41FlashDefinition,
} from '../src/official-models/deepseek.ts'
import { at, certificate, fixture, input, judgedMessage, policy, sse } from './support.ts'

const models = [
  { definition: deepseekV4Pro0813Definition, createMeter: createDeepSeekV4ProInputMeter },
  { definition: deepseekV41FlashDefinition, createMeter: createDeepSeekV41FlashInputMeter },
]
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe.each(models)('$definition.modelId actual public refusal and stop', model => {
  function request() {
    const profile = createOfficialProfileContent(model.definition, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
    })
    if ('rejected' in profile) throw Error(profile.rejected)
    const base = input()
    return {
      ...base,
      routeName: model.definition.modelId,
      provider: 'deepinfra/fp8',
      parameters: { reasoningEffort: 'low' as const, maxOutputTokens: 1024 },
      snapshot: {
        ...base.snapshot,
        ...model.definition.capabilities,
        adaptation: profile.ok.adaptation,
        providers: profile.ok.providers,
        allowFallback: profile.ok.allowFallback,
        updatedAt: at,
      },
    }
  }

  it('refuses unaccountable private reasoning before HTTP and preserves original input', async () => {
    const host = await fixture(cert.tls, res => res.end(), {}, undefined, [model.definition])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [model.definition],
      inputMeters: [model.createMeter(model.definition)],
    })
    const source = request()
    const privateMessage = judgedMessage({
      type: 'assistant',
      id: 'private-history',
      response: 'prior-response',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'private-thought',
          kind: 'thinking',
          text: '',
          opaque: {
            routeName: model.definition.modelId,
            reasoning_details: [{ type: 'reasoning.encrypted', data: 'PRIVATE_OPAQUE' }],
          },
          visibility: { toHuman: false, toModel: true },
        },
      ],
    })
    const messages = [...source.messages, privateMessage]
    const original = JSON.stringify(messages)
    try {
      const result = await invokeModel({
        ...source,
        messages,
        transport,
        credential: 'local-only-credential',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      expect(result).toEqual({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxInputTokens'],
      })
      expect(host.requests).toHaveLength(0)
      expect(JSON.stringify(messages)).toBe(original)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('stops the actual streaming socket and issues no automatic retry', async () => {
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(sse({ choices: [{ delta: { content: 'pending' } }] }))
      },
      {},
      undefined,
      [model.definition],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [model.definition],
      inputMeters: [model.createMeter(model.definition)],
    })
    let waiting = false
    try {
      const handle = invokeModel({
        ...request(),
        transport,
        credential: 'local-only-credential',
        signal: new AbortController().signal,
        policy: policy(),
        beforeFirstContent: () => {
          waiting = true
          return new Promise<void>(() => {})
        },
      })
      await expect.poll(() => waiting).toBe(true)
      handle.abort()
      handle.abort()
      const result = await handle.outcome
      expect(result).toMatchObject({ outcome: 'interrupted', blocks: [] })
      await expect.poll(host.closedSockets).toBe(1)
      expect(host.requests).toHaveLength(1)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})

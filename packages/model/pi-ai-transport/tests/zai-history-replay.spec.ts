import { testImagePreparerFor } from './image-transport-support.ts'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readOpaqueJson, toOpaqueJson, type JsonObject } from '@omne-harness-lite/content-blocks'
import { start, accept, closeOut } from '@omne-harness-lite/stream-assembly'
import { invokeModel } from '@omne-harness-lite/model-request-runtime'
import { createZaiCommercialInputMeter } from '../src/input-meters/zai-commercial.ts'
import { planRequest } from '../src/plan.ts'
import { object } from '../src/json.ts'
import { definition, histories, historyInput, jsonBody } from './fixtures/zai/history-cases.ts'
import { at, certificate, fixture, judgedMessage, message, policy } from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe('authentic complete ZAI reasoning through production stream and assembly', () => {
  it.each(histories)(
    '$id retains same-head fragments, full opaque and cross-route plaintext',
    async row => {
      expect(createHash('sha256').update(row.sse).digest('hex')).toBe(row.sseSha256)
      const model = definition(row.model)
      const host = await fixture(cert.tls, response => response.end(row.sse), {}, undefined, [
        model,
      ])
      try {
        const request = historyInput(row.model)
        const planned = await host.transport.plan(request, { signal: new AbortController().signal })
        if ('rejected' in planned) throw new Error(planned.rejected)
        const signal = new AbortController().signal
        const sent = await host.transport.send(planned.planned, 'local-zai-replay-secret', signal)
        if (!('response' in sent)) throw new Error('no local response')
        const initial = start(request.target)
        if ('rejected' in initial) throw new Error(initial.rejected)
        let state = initial.ok
        const reading = host.transport.read(sent.response, planned.planned, signal)
        for (;;) {
          const step = await reading.next()
          if (step.done) {
            expect(step.value).toMatchObject({ ended: 'end' })
            break
          }
          const next = accept(state, step.value)
          if ('rejected' in next) throw new Error(next.rejected)
          state = next.ok
        }
        await sent.response.stopped
        const finished = accept(state, { t: 'finish', reason: 'end' })
        if ('rejected' in finished) throw new Error(finished.rejected)
        const settled = closeOut(finished.ok)
        if ('rejected' in settled) throw new Error(settled.rejected)
        const thinking = settled.ok.blocks.find(block => block.kind === 'thinking')
        if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
          throw new Error('missing opaque')
        expect(thinking.text).toBe(row.thought)
        expect(readOpaqueJson(thinking.opaque)).toEqual(
          jsonBody({ routeName: row.model, reasoning_details: [row.detail] }),
        )
        const assistant = judgedMessage({
          type: 'assistant',
          id: 'replayed',
          response: 'original-response',
          ending: 'complete',
          createdAt: at,
          blocks: settled.ok.blocks,
        })
        let captured: JsonObject | undefined
        const productionMeter = createZaiCommercialInputMeter(model)
        const replay = await planRequest(
          {
            ...request,
            messages: [...request.messages, assistant, message('user', 'Continue.', 'followup')],
          },
          [model],
          {
            ...productionMeter,
            measureFull(value) {
              captured = value.body
              return productionMeter.measureFull(value)
            },
          },
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        )
        // Released at mp4-18: the same-route merged detail is metered as visible reasoning.
        expect(replay).toMatchObject({
          planned: { measurement: { mode: 'full', precision: 'estimated' } },
        })
        expect(captured?.messages).toMatchObject([
          { role: 'system' },
          { role: 'user' },
          { role: 'user' },
          { role: 'assistant', content: row.content, reasoning_details: [row.detail] },
          { role: 'user' },
        ])
        const otherId =
          row.model === 'z-ai/glm-5.3-prime' ? 'z-ai/glm-5.3-flashx' : 'z-ai/glm-5.3-prime'
        const other = definition(otherId)
        const otherMeter = createZaiCommercialInputMeter(other)
        let otherCalls = 0
        const changed = await planRequest(
          {
            ...historyInput(otherId),
            messages: [...request.messages, assistant, message('user', 'Continue.', 'followup')],
          },
          [other],
          {
            ...otherMeter,
            measureFull(value) {
              otherCalls++
              return otherMeter.measureFull(value)
            },
          },
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        )
        // The other route has no projector for this opaque unit: reject, never degrade to
        // plaintext, and never reach its meter.
        expect(changed).toEqual({ rejected: 'unavailable' })
        expect(otherCalls).toBe(0)
        expect(host.requests).toHaveLength(1)
      } finally {
        await host.close()
      }
    },
  )

  it('refuses a lossy same-route opaque A plus independent plain B before HTTP', async () => {
    const modelId = 'z-ai/glm-5.3-flashx'
    const model = definition(modelId)
    const request = historyInput(modelId)
    const assistant = judgedMessage({
      type: 'assistant',
      id: 'mixed',
      response: 'mixed-response',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'a',
          kind: 'thinking',
          text: 'opaque A',
          opaque: toOpaqueJson({
            routeName: modelId,
            reasoning_details: [{ type: 'reasoning.text', text: 'opaque A', index: 0 }],
          }),
          visibility: { toModel: true, toHuman: true },
        },
        {
          id: 'b',
          kind: 'thinking',
          text: 'unique plain B',
          visibility: { toModel: true, toHuman: true },
        },
      ],
    })
    const original = JSON.stringify(assistant)
    const complete = { ...request, messages: [...request.messages, assistant] }
    const host = await fixture(
      cert.tls,
      response => response.end('unexpected network request'),
      {},
      undefined,
      [model],
    )
    try {
      expect(
        await planRequest(
          complete,
          [model],
          createZaiCommercialInputMeter(model),
          {
            signal: new AbortController().signal,
          },
          testImagePreparerFor(planRequest),
        ),
      ).toEqual({
        rejected: 'unavailable',
      })
      expect(await host.transport.plan(complete, { signal: new AbortController().signal })).toEqual(
        { rejected: 'unavailable' },
      )
      const invocation = invokeModel({
        ...complete,
        transport: host.transport,
        credential: 'local-zai-replay-secret',
        signal: new AbortController().signal,
        policy: policy(),
      })
      expect(await invocation.outcome).toEqual({ rejected: 'unavailable' })
      expect(host.requests).toHaveLength(0)
      expect(JSON.stringify(assistant)).toBe(original)
      expect(assistant.blocks[0]).toMatchObject({ text: 'opaque A' })
      expect(assistant.blocks[1]).toMatchObject({ text: 'unique plain B' })
    } finally {
      await host.close()
    }
  })

  it('retains the supported plain-only path and does not mistake one opaque block for two', async () => {
    const modelId = 'z-ai/glm-5.3-flashx'
    const model = definition(modelId)
    const request = historyInput(modelId)
    const makeAssistant = (opaque: boolean) =>
      judgedMessage({
        type: 'assistant',
        id: opaque ? 'single-opaque' : 'plain-only',
        response: 'reasoning-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'a',
            kind: 'thinking',
            text: 'one thought',
            ...(opaque
              ? {
                  opaque: toOpaqueJson({
                    routeName: modelId,
                    reasoning_details: [{ type: 'reasoning.text', text: 'one thought', index: 0 }],
                  }),
                }
              : {}),
            visibility: { toModel: true, toHuman: true },
          },
        ],
      })
    for (const opaque of [false, true]) {
      let captured: JsonObject | undefined
      const meter = createZaiCommercialInputMeter(model)
      const result = await planRequest(
        { ...request, messages: [...request.messages, makeAssistant(opaque)] },
        [model],
        {
          ...meter,
          measureFull(value) {
            captured = value.body
            return meter.measureFull(value)
          },
        },
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      )
      expect(captured).toBeDefined()
      const messages = captured?.messages
      if (!Array.isArray(messages)) throw new Error('no captured messages')
      const assistantWire = messages.find(value => object(value) && value.role === 'assistant')
      if (opaque) {
        expect(assistantWire).toHaveProperty('reasoning_details')
        expect(assistantWire).not.toHaveProperty('reasoning')
        // This hand-built detail lacks the captured `format` key: unexplained, refused.
        expect(result).toMatchObject({
          rejected: 'invalidInput',
          reason: 'input_size_unavailable',
        })
      } else {
        expect(assistantWire).toMatchObject({ reasoning: 'one thought' })
        expect(assistantWire).not.toHaveProperty('reasoning_details')
        expect(result).toHaveProperty('planned')
      }
    }
  })
})

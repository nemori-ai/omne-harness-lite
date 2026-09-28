import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { planRequest } from '@omne-harness-lite/pi-ai-transport'
import { googleDefinitions } from '../src/official-models/google.ts'
import {
  googleCertificationAt as at,
  googleCertificationProvider as provider,
  googleCertificationRequest,
  googleCertificationTool as tool,
  googleCertificationVisibility as visible,
} from './fixtures/google/cases.ts'
import { certificate, content, finish, fixture, judgedMessage, sse } from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe('Google official routes: controlled wire projection only', () => {
  it.each(googleDefinitions)(
    '$modelId cannot plan without a model-applicable meter',
    definition => {
      expect(
        planRequest(googleCertificationRequest(definition.modelId), googleDefinitions),
      ).toEqual({
        rejected: 'unavailable',
      })
    },
  )

  it.each(googleDefinitions)(
    '$modelId preserves official binding and final body over local TLS',
    async definition => {
      // The shared HTTPS fixture injects a synthetic one-token meter. This is
      // a projection test, not evidence that Gemini input counting is solved.
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            content('ok') +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 100,
                  completion_tokens: 3,
                  prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 0 },
                },
              }) +
              finish(),
          ),
        {},
        undefined,
        [definition],
      )
      try {
        const planned = host.transport.plan(googleCertificationRequest(definition.modelId))
        if ('rejected' in planned) throw new Error(planned.rejected)
        const { body, serialized, inputLimitEvidence } = planned.planned
        expect(body.model).toBe(definition.modelId)
        expect(body.provider).toEqual({
          order: [provider],
          allow_fallbacks: false,
          require_parameters: true,
        })
        expect(body.reasoning).toEqual({ effort: 'medium' })
        expect(body.max_tokens).toBe(64)
        expect(body.tools).toEqual([{ type: 'function', function: tool }])
        expect(body.messages).toMatchObject([
          { role: 'system' },
          {
            role: 'user',
            content: [{ text: '[system_reminder "system_reminder"]' }, { text: 'continue' }],
          },
          {
            role: 'assistant',
            reasoning: 'consider lookup',
            tool_calls: [{ function: { name: tool.name, arguments: '{"key":"x"}' } }],
          },
          { role: 'tool', content: 'found' },
          { role: 'user', content: [{ text: 'describe' }, { type: 'image_url' }] },
        ])
        expect(serialized).not.toContain('cache_control')
        expect(serialized).not.toContain('ttl')
        expect(inputLimitEvidence.requestBytes).toBe(Buffer.byteLength(serialized, 'utf8'))
        expect(inputLimitEvidence.imageBytes).toEqual([70])
        expect(inputLimitEvidence.images).toBe(1)

        const sent = await host.transport.send(
          planned.planned,
          'google-offline-test-credential',
          new AbortController().signal,
        )
        if (!('response' in sent)) throw new Error('controlled response unavailable')
        const events = []
        for await (const event of host.transport.read(
          sent.response,
          planned.planned,
          new AbortController().signal,
        ))
          events.push(event)
        expect(events).toContainEqual(expect.objectContaining({ t: 'fill', payload: 'ok' }))
        const accounts = events.filter(event => event.t === 'account')
        expect(accounts).toHaveLength(1)
        const account = accounts[0]
        if (!account || account.usage.input_tokens === 'unknown')
          throw new Error('upstream input usage missing')
        expect(ExactDecimal.from(account.usage.input_tokens).compare(ExactDecimal.from(80))).toBe(0)
        const accounted = writeJsonLossless(account)
        for (const fact of [
          '"output_tokens":3',
          '"cache_read_tokens":20',
          '"cache_write_tokens":0',
          '"source":"upstream"',
        ])
          expect(accounted).toContain(fact)
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(serialized)
      } finally {
        await host.close()
      }
    },
  )

  it.each(googleDefinitions)('$modelId rejects raw audio before any plan is signed', definition => {
    const input = googleCertificationRequest(definition.modelId)
    const audio = judgedMessage({
      id: 'google-audio',
      type: 'user',
      createdAt: at,
      blocks: [
        {
          id: 'google-voice',
          kind: 'voice',
          mediaType: 'audio/pcm',
          data: { inline: 'eA==' },
          visibility: visible,
        },
      ],
    })
    expect(planRequest({ ...input, messages: [...input.messages, audio] }, [definition])).toEqual({
      rejected: 'modality_not_carried',
    })
  })

  it.each(googleDefinitions)('$modelId rejects video without a wire projection', definition => {
    const input = googleCertificationRequest(definition.modelId)
    const video = judgedMessage({
      id: 'google-video',
      type: 'user',
      createdAt: at,
      blocks: [
        {
          id: 'google-video-file',
          kind: 'file',
          attachment: {
            storage: 'attachments',
            key: 'obj_google_video',
            mediaType: 'video/mp4',
            name: 'clip.mp4',
          },
          visibility: visible,
        },
      ],
    })
    expect(planRequest({ ...input, messages: [...input.messages, video] }, [definition])).toEqual({
      rejected: 'modality_not_carried',
    })
  })
})

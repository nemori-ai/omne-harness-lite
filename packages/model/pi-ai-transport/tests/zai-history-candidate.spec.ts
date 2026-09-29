import { directFull } from './direct-full-input.ts'
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import {
  createZaiHistoryCandidateMeter,
  renderZaiHistoryCandidatePrompt,
} from '../src/input-meters/zai-candidate.ts'
import {
  createZaiCommercialInputMeter,
  renderZaiCommercialPrompt,
} from '../src/input-meters/zai-commercial.ts'
import { glm5Tokenizer } from '../src/input-meters/zai-glm52.ts'
import { object } from '../src/json.ts'
import { histories, definition, jsonBody, followupBody } from './fixtures/zai/history-cases.ts'

const goldens = z
  .object({
    templateSha256: z.string(),
    historiesSha256: z.string(),
    goldens: z.array(z.object({ id: z.string(), promptSha256: z.string() })),
  })
  .parse(
    JSON.parse(
      readFileSync(
        new URL('./fixtures/zai/history-template-goldens.json', import.meta.url),
        'utf8',
      ),
    ),
  )

function measure(body: JsonObject) {
  return directFull(createZaiHistoryCandidateMeter(definition(String(body.model))), {
    body,
    serialized: writeJsonLossless(body),
  })
}

describe('unbound ZAI historical thinking candidate', () => {
  it.each(histories)('$id keeps all prior tool history and authentic plaintext thought', row => {
    const body = followupBody(row)
    const prompt = renderZaiHistoryCandidatePrompt(body)
    expect(prompt).toContain(`<|assistant|><think>${row.thought}</think>${row.content.trim()}`)
    expect(prompt).toContain('<tool_call>')
    expect(prompt).toContain('<tool_response>')
    expect(prompt).toContain('What arithmetic result did we verify?')
    if (prompt === undefined) throw new Error('missing candidate prompt')
    expect(createHash('sha256').update(prompt).digest('hex')).toBe(
      goldens.goldens.find(item => item.id === row.id)?.promptSha256,
    )
    expect(measure(body)).toEqual({
      kind: 'estimated',
      tokens: glm5Tokenizer().encode(prompt, { add_special_tokens: false }).ids.length,
    })
    // No production promotion or inherited text-only -1 calibration.
    expect(
      directFull(createZaiCommercialInputMeter(definition(row.model)), {
        body,
        serialized: writeJsonLossless(body),
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(renderZaiCommercialPrompt(body)).toBeUndefined()
    if (!Array.isArray(body.messages)) throw new Error('missing messages')
    const control = jsonBody({
      ...body,
      messages: body.messages.map(message => {
        if (!object(message)) throw new Error('invalid message')
        const { reasoning: _thought, ...rest } = message
        return rest
      }),
    })
    expect(measure(body)).not.toEqual(measure(control))
  })

  it('pins the independently rendered Jinja oracle inputs', () => {
    for (const [path, expected] of [
      ['../tokenizers/zai-glm5/glm-5.3-chat-template.jinja', goldens.templateSha256],
      ['./fixtures/zai/history-complete-streams.json', goldens.historiesSha256],
    ]) {
      if (!path) throw new Error('missing oracle input')
      expect(
        createHash('sha256')
          .update(readFileSync(new URL(path, import.meta.url)))
          .digest('hex'),
      ).toBe(expected)
    }
  })

  it('renders two assistant reasoning blocks in order with the pinned template framing', () => {
    const row = histories[0]
    if (!row) throw new Error('missing fixture')
    const body = jsonBody({
      ...row.request,
      tools: undefined,
      messages: [
        { role: 'system', content: 'Stay exact.' },
        { role: 'user', content: 'First?' },
        { role: 'assistant', content: '  One. ', reasoning: '中文 🙂 first' },
        { role: 'user', content: 'Second?' },
        { role: 'assistant', content: ' Two. ', reasoning: 'second\nreason' },
        { role: 'user', content: 'Remember both.' },
      ],
    })
    expect(renderZaiHistoryCandidatePrompt(body)).toBe(
      '[gMASK]<sop><|system|>Reasoning Effort: Max<|system|>Stay exact.<|user|>First?<|assistant|><think>中文 🙂 first</think>One.<|user|>Second?<|assistant|><think>second\nreason</think>Two.<|user|>Remember both.<|assistant|><think>',
    )
  })

  it('refuses opaque, wrong routes, media, unknown fields and mismatched serialized bytes', () => {
    const row = histories[0]
    if (!row) throw new Error('missing fixture')
    const body = jsonBody(row.request)
    const unknownBodies = [
      { ...body, provider: { order: ['other'], allow_fallbacks: false, require_parameters: true } },
      { ...body, unknown: true },
      { ...body, reasoning: { effort: 'high' } },
      ...[
        { reasoning_details: [row.detail] },
        { reasoning: 1 },
        { extra: 'ignored?' },
        { content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] },
      ].map(extra => ({ ...body, messages: [{ role: 'assistant', content: 'ok', ...extra }] })),
    ]
    for (const candidate of unknownBodies)
      expect(measure(jsonBody(candidate))).toEqual({ kind: 'unavailable' })
    const meter = createZaiHistoryCandidateMeter(definition(row.model))
    expect(directFull(meter, { body, serialized: writeJsonLossless(body) + '\n' })).toEqual({
      kind: 'unavailable',
    })
    expect(() => createZaiHistoryCandidateMeter(definition('z-ai/glm-5.3'))).toThrow('unsupported')
  })
})

// Parameter planning on the OpenAI records through the binding: the supported subset passes, the
// sealed parameter drops fail before sending, and the efforts the engine cannot write fail too.
import { describe, expect, it } from 'vitest'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import { writeJsonText } from '@omne-harness/json-text'
import type { Parameter } from '@omne-harness/model-contract'
import { OPENAI_OWNER, type OpenAiRecord } from '@omne-harness/pi-ai-openai'
import {
  assembledOf,
  bindingOf,
  fixedRequest,
  imageBlock,
  officialProfile,
  recordNamed,
  supplierOf,
  textBlock,
  message,
  tool,
} from './support/openai.ts'

const SOL = recordNamed('openai/gpt-5.6-sol')
const ASTRA = recordNamed('openai/gpt-6-astra')

async function plan(record: OpenAiRecord, parameters: readonly Parameter[]) {
  const binding = await bindingOf(record)
  const request = fixedRequest(record)
  const outcome = binding.rules.plan({
    profile: officialProfile(record),
    supplier: supplierOf(record),
    assembled: { ...assembledOf(request), parameters },
  })
  await binding.release()
  return outcome
}

describe('parameters', () => {
  it('passes the output limit and the efforts low, medium and high as explicit adoptions', async () => {
    const outcome = await plan(SOL, [
      { kind: 'max-output-tokens', value: '4096' },
      { kind: 'reasoning-effort', value: 'medium' },
    ])
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    expect(outcome.ok.parameters.map(item => item.applied)).toEqual([
      { kind: 'max-output-tokens', value: '4096' },
      { kind: 'reasoning-effort', value: 'medium' },
    ])
    expect(outcome.ok.parameters.every(item => item.origin.kind === 'explicit')).toBe(true)
  })

  it('adds no default: an omitted parameter is not written', async () => {
    const outcome = await plan(SOL, [])
    expect(outcome).toMatchObject({ ok: { parameters: [] } })
  })

  it.each([
    { kind: 'temperature', value: 0.5 },
    { kind: 'top-p', value: 0.5 },
    { kind: 'stop', value: ['END'] },
    { kind: 'seed', value: '7' },
    { kind: 'frequency-penalty', value: 0 },
    { kind: 'presence-penalty', value: 0 },
    { kind: 'reasoning-effort', value: 'none' },
    { kind: 'reasoning-effort', value: 'max' },
  ] satisfies readonly Parameter[])('refuses $kind $value before sending, never drops it', async parameter => {
    expect(await plan(SOL, [parameter])).toEqual({
      failure: { kind: 'unsupported', field: parameter.kind, adapter: recordAdoption(OPENAI_OWNER, SOL) },
    })
  })

  it('refuses an output limit above the record range', async () => {
    expect(await plan(ASTRA, [{ kind: 'max-output-tokens', value: '128001' }])).toEqual({
      failure: { kind: 'invalid', field: 'max-output-tokens', reason: 'out-of-range' },
    })
  })
})

describe('request body', () => {
  it('writes tools, a tool result image after the tool turn and the image detail of the record', async () => {
    const binding = await bindingOf(ASTRA)
    const request = fixedRequest(ASTRA, {
      messages: [
        message('u1', 'user', [textBlock('b1', 'look up x')]),
        message('a1', 'assistant', [{ kind: 'tool_call', id: 'c1', visibility: { toHuman: true, toModel: true }, callId: 'call 1', name: 'lookup', arguments: { kind: 'object', entries: [] } }]),
        message('t1', 'tool', [{ kind: 'tool_result', id: 'r1', visibility: { toHuman: true, toModel: true }, callId: 'call 1' }, textBlock('b2', 'found'), imageBlock('i1')]),
      ],
      tools: [tool('lookup')],
    })
    const encoded = binding.encode({ request, media: [] })
    if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded.failure))
    const body: unknown = JSON.parse(writeJsonText(encoded.ok.body))
    expect(body).toMatchObject({
      messages: [
        { role: 'user', content: 'look up x' },
        { role: 'assistant', content: '', tool_calls: [{ type: 'function', function: { name: 'lookup', arguments: '{}' } }] },
        { role: 'tool', content: 'found' },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' } }] },
      ],
      tools: [{ type: 'function', function: { name: 'lookup', description: 'lookup tool', parameters: { type: 'object' } } }],
      tool_choice: 'auto',
      store: false,
    })
    await binding.release()
  })

  it('refuses a tool whose schema root is not an object', async () => {
    const binding = await bindingOf(ASTRA)
    const request = fixedRequest(ASTRA, { tools: [tool('lookup', { kind: 'string', value: 'object' })] })
    expect(binding.encode({ request, media: [] })).toEqual({
      failure: { kind: 'unsupported', field: '/tools/0/argumentsSchema', adapter: recordAdoption(OPENAI_OWNER, ASTRA) },
    })
    await binding.release()
  })
})

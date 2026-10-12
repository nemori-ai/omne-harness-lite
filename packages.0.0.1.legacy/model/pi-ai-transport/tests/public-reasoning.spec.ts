import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jsonNumberSource, readOpaqueJson, type JsonValue } from '@omne-harness-lite/content-blocks'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { createPiAiTransport } from '../src/index.ts'
import { testDefinitions } from './definitions.ts'
import { certificate, finish, fixture, input, invocation, policy, sse } from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

async function receive(deltas: readonly JsonValue[]) {
  const host = await fixture(cert.tls, res => {
    res.end(
      deltas.map(delta => sse({ choices: [{ delta }] })).join('') +
        sse({ choices: [{ delta: { content: 'Answer' } }] }) +
        finish(),
    )
  })
  const transport = createPiAiTransport({ ...host.options, definitions: testDefinitions })
  try {
    const fills: string[] = []
    let thinkingIndex: string | undefined
    const handle = invokeModel({
      ...input(),
      transport,
      credential: 'test-secret',
      signal: new AbortController().signal,
      policy: policy(),
      onAccepted: event => {
        if (event.t === 'open' && event.kind === 'thinking')
          thinkingIndex = jsonNumberSource(event.index)
        if (
          event.t === 'fill' &&
          jsonNumberSource(event.index) === thinkingIndex &&
          typeof event.payload === 'string'
        )
          fills.push(event.payload)
      },
    })
    const result = invocation(await handle.outcome)
    expect(result.outcome).toBe('complete')
    const thinking = result.blocks.find(block => block.kind === 'thinking')
    if (!thinking || thinking.kind !== 'thinking') throw new Error('thinking block missing')
    return {
      text: thinking.text,
      fills,
      details: thinking.opaque && readOpaqueJson(thinking.opaque),
    }
  } finally {
    await transport.close()
    await host.close()
  }
}

const detail = (text: string) => ({ type: 'reasoning.text', text, index: 0 })

describe('public reasoning text through the actual HTTPS transport', () => {
  it('streams structured summaries and text while preserving original details', async () => {
    const result = await receive([
      { reasoning_details: [{ type: 'reasoning.summary', summary: 'Check ', index: 0 }] },
      { reasoning_details: [{ type: 'reasoning.summary', summary: 'the input. ', index: 0 }] },
      {
        reasoning_details: [
          detail('Then answer.'),
          { type: 'reasoning.encrypted', data: 'PRIVATE' },
        ],
      },
      { reasoning_details: [{ type: 'reasoning.text', index: 0, signature: 'SIGNATURE' }] },
    ])
    expect(result.text).toBe('Check the input. Then answer.')
    expect(result.fills.join('')).toBe(result.text)
    expect(result.details).toMatchObject({
      reasoning_details: [
        { type: 'reasoning.summary', summary: 'Check the input. ', index: 0 },
        detail('Then answer.'),
        { type: 'reasoning.encrypted', data: 'PRIVATE' },
        { type: 'reasoning.text', index: 0, signature: 'SIGNATURE' },
      ],
    })
    expect(result.text).not.toMatch(/PRIVATE|SIGNATURE/)
  })

  it.each([
    {
      name: 'plain first, delayed details',
      deltas: [
        { reasoning: 'Check ' },
        { reasoning_details: [detail('Check ')] },
        { reasoning: 'input.', reasoning_details: [detail('input.')] },
      ],
    },
    {
      name: 'details first, delayed plain',
      deltas: [
        { reasoning_details: [detail('Check ')] },
        { reasoning: 'Check ' },
        { reasoning: 'input.', reasoning_details: [detail('input.')] },
      ],
    },
    {
      name: 'same-frame mirrors',
      deltas: [
        { reasoning: 'Check ', reasoning_details: [detail('Check ')] },
        { reasoning: 'input.', reasoning_details: [detail('input.')] },
      ],
    },
  ])('does not duplicate $name', async ({ deltas }) => {
    const result = await receive(deltas)
    expect(result.text).toBe('Check input.')
    expect(result.fills.join('')).toBe(result.text)
    expect(result.details).toMatchObject({ reasoning_details: [detail('Check input.')] })
  })

  it('does not select a text source for empty or nontext metadata', async () => {
    const result = await receive([
      { reasoning: '', reasoning_details: [{ type: 'reasoning.encrypted', data: 'PRIVATE' }] },
      { reasoning_details: [{ type: 'reasoning.summary', summary: 'Read the input.' }] },
      { reasoning: 'Read the input.' },
    ])
    expect(result.text).toBe('Read the input.')
    expect(result.fills.join('')).toBe(result.text)
  })

  it('does not expose encrypted, unknown or signature-only content as text', async () => {
    const result = await receive([
      {
        reasoning_details: [
          { type: 'reasoning.encrypted', data: 'PRIVATE', text: 'DO NOT RENDER' },
          { type: 'future.reasoning', text: 'UNKNOWN' },
          { type: 'reasoning.text', signature: 'SIGNATURE' },
        ],
      },
    ])
    expect(result.text).toBe('')
    expect(result.fills).toEqual([])
    expect(result.details).toMatchObject({
      reasoning_details: [
        { type: 'reasoning.encrypted', data: 'PRIVATE', text: 'DO NOT RENDER' },
        { type: 'future.reasoning', text: 'UNKNOWN' },
        { type: 'reasoning.text', signature: 'SIGNATURE' },
      ],
    })
  })
})

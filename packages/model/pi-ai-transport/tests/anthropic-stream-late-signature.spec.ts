import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readOpaqueJson } from '@omne-harness-lite/content-blocks'
import { readStream } from '@omne-harness-lite/pi-ai-transport'
import { certificate, finish, fixture, planned, sse } from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

const base = {
  type: 'reasoning.text',
  id: 'one-thinking-block',
  index: 0,
  format: 'anthropic-claude-v1',
  extension: { source: 'controlled' },
}

async function retainedDetails(fragments: readonly Record<string, unknown>[]) {
  const body =
    fragments
      .map(detail => sse({ choices: [{ delta: { reasoning_details: [detail] } }] }))
      .join('') + finish()
  const host = await fixture(cert.tls, response => response.end(body))
  try {
    const plan = await planned(host.transport)
    const sent = await host.transport.send(plan, 'synthetic-only', new AbortController().signal)
    if (!('response' in sent)) throw Error('controlled response unavailable')
    let opaque: ReturnType<typeof readOpaqueJson> | undefined
    for await (const event of readStream(sent.response, plan, new AbortController().signal, {
      maxSseEventBytes: 16384,
      diagnostic: () => {},
    })) {
      if (event.t === 'close' && 'block' in event && event.block?.kind === 'thinking') {
        if (!event.block.opaque) throw Error('reasoning detail was not retained')
        opaque = readOpaqueJson(event.block.opaque)
      }
    }
    expect(host.requests).toHaveLength(1)
    if (!opaque || typeof opaque !== 'object' || !('reasoning_details' in opaque))
      throw Error('missing retained reasoning details')
    return opaque.reasoning_details
  } finally {
    await host.close()
  }
}

describe('OpenRouter reasoning detail stream identity', () => {
  it('joins same-id text followed by its late signature without losing extension metadata', async () => {
    const first = { ...base, text: 'first ', signature: null }
    const final = { ...base, text: 'second', signature: 'signed-one' }
    expect(await retainedDetails([first, final])).toEqual([
      { ...base, text: 'first second', signature: 'signed-one' },
    ])
  })

  it('joins same-id text fragments that carry the same nonempty signature', async () => {
    const first = { ...base, text: 'first ', signature: 'signed-one' }
    const final = { ...base, text: 'second', signature: 'signed-one' }
    expect(await retainedDetails([first, final])).toEqual([
      { ...base, text: 'first second', signature: 'signed-one' },
    ])
  })

  it.each([
    ['different id', { id: 'another-thinking-block' }],
    ['different index', { index: 1 }],
    ['different format', { format: 'other-format' }],
    ['different unknown metadata', { extension: { source: 'other' } }],
    ['conflicting nonempty signatures', { signature: 'signed-two' }],
    ['different subtype', { type: 'reasoning.encrypted', data: 'ciphertext' }],
  ])('keeps %s as a distinct original detail', async (_case, change) => {
    const first = { ...base, text: 'first', signature: 'signed-one' }
    const next = { ...base, text: 'second', signature: 'signed-one', ...change }
    expect(await retainedDetails([first, next])).toEqual([first, next])
  })

  it('does not infer one logical detail when both fragments lack an id', async () => {
    const { id: _id, ...unidentified } = base
    const first = { ...unidentified, text: 'first', signature: 'signed-one' }
    const next = { ...unidentified, text: 'second', signature: 'signed-one' }
    expect(await retainedDetails([first, next])).toEqual([first, next])
  })
})

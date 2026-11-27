import type { LlmModelRequest, Supplier } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import { isBindingOf, type PiChatBinding } from '../src/family.ts'
import { sendOf, supplierIndex } from '../src/send.ts'
import {
  adoption,
  createTestDecoder,
  createTestFamily,
  LIMITS,
  providerName,
  REQUEST,
  SUPPLIER,
} from './support/test-family.ts'

const SEND_LIMITS = { maxDecisionBytes: undefined, json: LIMITS.json }

async function chatBinding(): Promise<PiChatBinding> {
  const acquired = await createTestFamily().families.acquire(SUPPLIER, new AbortController().signal)
  if (!('ok' in acquired) || !isBindingOf(acquired.ok, 'llm')) throw new Error('no binding')
  return acquired.ok
}

describe('where a request names a supplier', () => {
  it('is the place of the supplier that is the same in every part', () => {
    const second: Supplier = { ...SUPPLIER, model: 'second-model' }
    const request: LlmModelRequest = { ...REQUEST, suppliers: [SUPPLIER, second] }
    expect(supplierIndex(request, { ...SUPPLIER, adoption: { ...SUPPLIER.adoption } })).toBe(0)
    expect(supplierIndex(request, second)).toBe(1)
  })

  it.each<[string, Supplier]>([
    ['credential layer', { ...SUPPLIER, credential: { layer: 'tenant' } }],
    ['provider', { ...SUPPLIER, provider: providerName('other-provider') }],
    ['model', { ...SUPPLIER, model: 'other-model' }],
    ['adoption owner', { ...SUPPLIER, adoption: { ...SUPPLIER.adoption, owner: 'other' } }],
    ['adoption name', { ...SUPPLIER, adoption: { ...SUPPLIER.adoption, name: 'other' } }],
    ['adoption revision', { ...SUPPLIER, adoption: { ...SUPPLIER.adoption, revision: '2' } }],
    [
      'adoption digest',
      { ...SUPPLIER, adoption: { ...SUPPLIER.adoption, digest: 'f'.repeat(64) } },
    ],
  ])('is nowhere for a supplier of another %s', (_part, supplier) => {
    expect(supplierIndex(REQUEST, supplier)).toBe(-1)
  })
})

describe('a chat binding paired with a chat request', () => {
  it('goes to the interface of the binding, in the representation the request names', async () => {
    const binding = await chatBinding()
    const paired = sendOf(binding, REQUEST, 0, SEND_LIMITS)
    if (!('ok' in paired)) throw new Error(JSON.stringify(paired))
    expect(paired.ok).toMatchObject({
      adoption: binding.adoption,
      endpoint: 'chat-completions',
      representation: REQUEST.representation,
      replayFormat: binding.replayFormat,
    })
  })

  it('reads the answer with the decoder the binding makes for this request and this accounting', async () => {
    const binding = await chatBinding()
    const made: unknown[] = []
    const decoder = createTestDecoder()
    const watched: PiChatBinding = {
      ...binding,
      createDecoder(input) {
        made.push(input)
        return decoder
      },
    }
    const paired = sendOf(watched, REQUEST, 0, SEND_LIMITS)
    if (!('ok' in paired)) throw new Error(JSON.stringify(paired))
    const accounting = { place: 'test-gateway', costUnit: 'test-credit' }
    expect(paired.ok.createDecoder(accounting)).toBe(decoder)
    expect(made).toEqual([{ request: REQUEST, accounting }])
  })

  it('is refused at a place where the request has no replay declaration', async () => {
    const paired = sendOf(await chatBinding(), REQUEST, REQUEST.declarations.length, SEND_LIMITS)
    expect(paired).toEqual({
      failure: { kind: 'invalid', field: 'supplier', reason: 'not-in-request' },
    })
  })

  it('does not pair with a decisions request', async () => {
    const { profile, suppliers, fallback, retryPolicy, source } = REQUEST
    const ask = { state: 'text', questions: { Q1: { type: 'noul' } } } as const
    const decision = {
      kind: 'decisions',
      profile,
      suppliers,
      fallback,
      retryPolicy,
      source,
      ask,
    } as const
    expect(sendOf(await chatBinding(), decision, 0, SEND_LIMITS)).toEqual({
      failure: { kind: 'unsupported', field: 'request.kind', adapter: adoption('family') },
    })
  })

  it('does not pair with a live request: a live call is no request and answer', async () => {
    const { profile, suppliers, fallback, retryPolicy, source } = REQUEST
    const live = {
      kind: 'live',
      profile,
      suppliers,
      fallback,
      retryPolicy,
      source,
      instructions: 'Answer the phone.',
      history: [],
      voice: null,
      media: { via: 'link', audio: 'pcm16' },
    } as const
    expect(sendOf(await chatBinding(), live, 0, SEND_LIMITS)).toEqual({
      failure: { kind: 'unsupported', field: 'request.kind', adapter: adoption('family') },
    })
  })
})

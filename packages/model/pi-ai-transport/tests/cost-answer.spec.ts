import { describe, expect, it } from 'vitest'
import { answerOf } from '../src/cost-lookup.ts'

const read = (body: unknown) =>
  answerOf(
    typeof body === 'string' ? body : JSON.stringify(body),
    'openrouter',
    'openrouter-credit',
  )

describe('the answer of the generation endpoint', () => {
  it('reads a known total cost as a plain decimal, placed at the provider that served it', () => {
    expect(read({ data: { total_cost: 9.16e-5, provider_name: 'OpenAI' } })).toEqual({
      kind: 'found',
      cost: [
        { state: 'known', lexeme: '0.0000916', unit: 'openrouter-credit', source: 'billable' },
      ],
      place: 'openrouter/OpenAI',
    })
    expect(read({ data: { total_cost: 0.0002522, provider_name: '' } })).toMatchObject({
      cost: [{ lexeme: '0.0002522' }],
      place: 'openrouter',
    })
    expect(read({ data: { total_cost: 0.5, provider_name: 7 } })).toMatchObject({
      place: 'openrouter',
    })
  })

  it('never turns an unknown cost into zero', () => {
    for (const body of [{ data: {} }, { data: { total_cost: null } }, {}, { data: null }])
      expect(read(body), JSON.stringify(body)).toEqual({ kind: 'missed' })
    expect(read({ data: { total_cost: 'n/a' } })).toEqual({
      kind: 'unavailable',
      diagnostic: 'cost-not-a-number',
    })
    expect(read('not json')).toEqual({ kind: 'unavailable', diagnostic: 'body-not-json' })
  })
})

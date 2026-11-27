import { afterAll, describe, expect, it } from 'vitest'
import { checkConfig } from '../src/config.ts'
import { composeFamilies } from '../src/family-table.ts'
import type { PiRoute } from '../src/index.ts'
import { network } from './support/exchange.ts'
import { LIMITS } from './support/test-family.ts'

const net = network(Buffer.from(''))
afterAll(() => net.close())

const ROUTE: PiRoute = {
  endpoints: { responses: { url: 'https://api.test.invalid/v1/responses', endMarker: null } },
  accounting: { place: 'openai', costUnit: 'USD' },
  auth: { kind: 'bearer', item: 'apiKey' },
}

function checked(route: Partial<PiRoute>) {
  return checkConfig({
    network: net.handle,
    families: composeFamilies([]),
    routes: { openai: { ...ROUTE, ...route } },
    credential: { read: () => undefined },
    limits: LIMITS,
  }).routes.get('openai')
}

const GENERATION_REFUSED = 'a route accounting that states generation must name its header and path'

describe('the accounting of a route', () => {
  it('keeps the place and cost unit, and the header and path of the generation it states, and nothing else', () => {
    expect(checked({})?.accounting).toEqual({ place: 'openai', costUnit: 'USD' })
    const generation = { requestHeader: 'x-generation-id', path: '/api/v1/generation', extra: 1 }
    expect(
      checked({ accounting: { place: 'openrouter', costUnit: 'USD', generation } })?.accounting,
    ).toEqual({
      place: 'openrouter',
      costUnit: 'USD',
      generation: { requestHeader: 'x-generation-id', path: '/api/v1/generation' },
    })
  })

  it.each([
    ['not an object', null],
    ['a text', 'x-generation-id'],
    ['no header', { path: '/api/v1/generation' }],
    ['an empty header', { requestHeader: '', path: '/api/v1/generation' }],
    ['a header that is not text', { requestHeader: 5, path: '/api/v1/generation' }],
    ['no path', { requestHeader: 'x-generation-id' }],
    ['a path that is not text', { requestHeader: 'x-generation-id', path: 5 }],
    [
      'a path that is not absolute',
      { requestHeader: 'x-generation-id', path: 'api/v1/generation' },
    ],
  ])('refuses a generation with %s', (_name, generation) => {
    expect(() =>
      checked({
        accounting: { place: 'openrouter', costUnit: 'USD', generation: generation as never },
      }),
    ).toThrow(new RangeError(GENERATION_REFUSED))
  })
})

describe('the endpoint of a route', () => {
  it('refuses a url it cannot parse with the scheme the interface takes', () => {
    expect(() =>
      checked({ endpoints: { responses: { url: 'not a url', endMarker: null } } }),
    ).toThrow(
      new RangeError('each route url must be an https: URL without credentials, query or fragment'),
    )
    expect(() =>
      checked({ endpoints: { 'live-sessions': { url: 'not a url', endMarker: null } } }),
    ).toThrow(
      new RangeError(
        'each live route url must be a wss: URL without credentials, query or fragment',
      ),
    )
  })
})

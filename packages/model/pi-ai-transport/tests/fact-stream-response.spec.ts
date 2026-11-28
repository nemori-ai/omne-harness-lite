import type { TransportFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import { OPENROUTER_ACCOUNTING } from '../src/testing/fixtures.ts'
import type { RouteAccounting } from '../src/config.ts'
import { factsOfSend } from '../src/fact-stream.ts'
import type { PiResponseDecoder } from '../src/family.ts'
import type { ExchangeResult, HttpExchange, ResponseHeaders } from '../src/http.ts'
import { LIMITS } from './support/test-family.ts'

const COMPLETED: TransportFact = {
  kind: 'ended',
  termination: { kind: 'completed', reason: 'stop' },
}

const decoder: PiResponseDecoder = {
  accept: () => ({ ok: [] }),
  end: () => ({ ok: [COMPLETED] }),
}

function exchangeOf(result: ExchangeResult): HttpExchange {
  return {
    result: Promise.resolve(result),
    stop: () => {},
    stopped: Promise.resolve(),
    requestMaySent: () => true,
  }
}

const answered = (headers: ResponseHeaders): ExchangeResult => ({
  kind: 'ok',
  status: 200,
  headers,
  body: {
    claim: () => (async function* () {})(),
    received: () => true,
  } as never,
})

async function factsOf(
  result: ExchangeResult,
  options: Readonly<{
    accounting?: RouteAccounting
    retries?: readonly ('connect-failed' | 'connect-timeout')[]
  }> = {},
): Promise<TransportFact[]> {
  const facts: TransportFact[] = []
  for await (const fact of factsOfSend({
    exchange: exchangeOf(result),
    decoder,
    route: {
      url: new URL('https://gateway.test/'),
      endMarker: null,
      framing: 'events',
      accounting: options.accounting ?? OPENROUTER_ACCOUNTING,
      auth: null,
    },
    limits: LIMITS,
    diagnostics: [],
    replayCarried: false,
    ...(options.retries === undefined ? {} : { connectRetries: () => options.retries ?? [] }),
  }))
    facts.push(fact)
  return facts
}

describe('the response fact of a send', () => {
  it.each([
    ['the header of the gateway', { 'x-generation-id': 'gen-1' }, 'gen-1'],
    ['the first of a repeated header', { 'x-generation-id': ['gen-2', 'gen-3'] }, 'gen-2'],
    ['no identity for an empty header', { 'x-generation-id': '' }, null],
    ['no identity without the header', { 'x-request-id': 'other' }, null],
  ] as const)('comes first and carries %s', async (_name, headers, request) => {
    expect(await factsOf(answered(headers))).toEqual([{ kind: 'response', request }, COMPLETED])
  })

  it('names no request when the accounting of the route states no header that names it', async () => {
    const accounting = { place: 'direct', costUnit: 'usd' }
    expect(await factsOf(answered({ 'x-generation-id': 'gen-4' }), { accounting })).toEqual([
      { kind: 'response', request: null },
      COMPLETED,
    ])
  })

  it('comes before the end of a refused request too', async () => {
    const refused: ExchangeResult = {
      kind: 'http-error',
      status: 503,
      headers: { 'x-generation-id': 'gen-5' },
      errorBody: { kind: 'complete', bytes: new Uint8Array() },
    }
    const facts = await factsOf(refused)
    expect(facts[0]).toEqual({ kind: 'response', request: 'gen-5' })
    expect(facts.at(-1)).toMatchObject({ kind: 'ended', termination: { kind: 'failed' } })
  })
})

describe('the connect retries of a send', () => {
  it('come first, in order, and no response comes when no connection was made', async () => {
    expect(
      await factsOf(
        { kind: 'connect-failed', timeout: false },
        {
          retries: ['connect-timeout', 'connect-failed'],
        },
      ),
    ).toEqual([
      { kind: 'connect-retry', reason: 'connect-timeout' },
      { kind: 'connect-retry', reason: 'connect-failed' },
      {
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: {
            cause: 'upstream-unavailable',
            diagnostic: 'connect-failed',
            upstreamStatus: null,
          },
        },
      },
    ])
  })

  it('come before the response of the connection that worked', async () => {
    expect(await factsOf(answered({}), { retries: ['connect-failed'] })).toEqual([
      { kind: 'connect-retry', reason: 'connect-failed' },
      { kind: 'response', request: null },
      COMPLETED,
    ])
  })
})

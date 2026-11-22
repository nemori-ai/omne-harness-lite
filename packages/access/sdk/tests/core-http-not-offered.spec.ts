import { afterEach, describe, expect, it } from 'vitest'
import { createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { startLoopback, type LoopbackServer, type Reply } from './support/loopback.ts'

const servers: LoopbackServer[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
})

const OPEN = { kind: 'object', entries: [] } as const
const NOTES = { name: 'notes', major: 1 }
const json = (status: number, body: string): Reply => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body,
})
const NOT_OFFERED = '{"kind":"not-executed","reason":"not-offered"}'

async function transportFor(reply: Reply) {
  const server = await startLoopback(() => reply)
  servers.push(server)
  return createHttpProtocolTransport({ origin: server.origin })
}

const callOf = async (reply: Reply): Promise<unknown> =>
  (await transportFor(reply)).call({
    protocol: NOTES,
    operation: 'ping',
    messageId: 'm-1',
    body: OPEN,
  })

async function endOf(reply: Reply): Promise<unknown> {
  const stream = (await transportFor(reply)).observe({
    protocol: NOTES,
    observation: 'watch-all',
    messageId: 'm-1',
    open: OPEN,
    signal: new AbortController().signal,
  })
  return (await stream.next()).value
}

describe('the server says the protocol does not have this name (V3)', () => {
  it('a call is reported as not sent: nothing ran, so there is nothing to ask about again', async () => {
    expect(await callOf(json(404, NOT_OFFERED))).toEqual({ kind: 'not-sent' })
  })

  it('an observation ends as not sent', async () => {
    expect(await endOf(json(404, NOT_OFFERED))).toEqual({ kind: 'not-sent' })
  })

  it.each(['not-mounted', 'conflict'])(
    'the protocol is not served at all (%s): the same certain answer, for a call and an observation',
    async reason => {
      const reply = json(404, `{"kind":"not-executed","reason":"${reason}"}`)
      expect(await callOf(reply)).toEqual({ kind: 'not-sent' })
      expect(await endOf(reply)).toEqual({ kind: 'not-sent' })
    },
  )

  it('the registry cannot say what is served (503, unavailable): the same certain answer', async () => {
    const reply = json(503, '{"kind":"not-executed","reason":"unavailable"}')
    expect(await callOf(reply)).toEqual({ kind: 'not-sent' })
    expect(await endOf(reply)).toEqual({ kind: 'not-sent' })
  })

  it.each([
    ['a reason at the status of another', json(503, NOT_OFFERED)],
    ['unavailable at 404', json(404, '{"kind":"not-executed","reason":"unavailable"}')],
    [
      'a reason that is a property of every object',
      json(404, '{"kind":"not-executed","reason":"constructor"}'),
    ],
    ['another status', json(200, NOT_OFFERED)],
    ['another reason', json(404, '{"kind":"not-executed","reason":"other"}')],
    ['another kind', json(404, '{"kind":"executed","reason":"not-offered"}')],
    ['one member more', json(404, '{"kind":"not-executed","reason":"not-offered","more":1}')],
    ['not an object', json(404, '"not-offered"')],
    ['no body', { status: 404, body: '' }],
  ])('%s is not that answer: the call stays uncertain', async (_name, reply) => {
    expect(await callOf(reply)).toEqual({ kind: 'uncertain' })
    expect(await endOf(reply)).toEqual({ kind: 'uncertain' })
  })
})

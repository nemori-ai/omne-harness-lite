// @module-tag slow — starts an openssl child process and a real local HTTPS server
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { network } from './support/exchange.ts'
import {
  createCertificate,
  startHttpsServer,
  type Certificate,
  type RequestHandler,
} from './support/https-server.ts'
import { sseBody } from './support/test-family.ts'
import { transportOver } from './support/transport.ts'

const PATH = '/api/v1/chat/completions'
const TEXT = (value: string): string => JSON.stringify({ kind: 'text', value })
const STOP = JSON.stringify({ kind: 'stop' })

let certificate: Certificate
beforeAll(() => {
  certificate = createCertificate()
})
afterAll(() => certificate.dispose())

async function run(
  handler: RequestHandler | null,
  observer?: () => void,
): Promise<Readonly<{ order: string[]; facts: TransportFact[] }>> {
  const server = await startHttpsServer(certificate, handler ?? (() => {}))
  const url = new URL(PATH, server.url).href
  if (handler === null) await server.close()
  const resources = network(handler === null ? certificate.cert : server.ca)
  const order: string[] = []
  const transport = transportOver(resources, {
    url,
    onResponseBody: () => {
      order.push('body')
      observer?.()
    },
  })
  const facts: TransportFact[] = []
  try {
    const stream = (await transport.materialize()).start(new AbortController().signal)
    for await (const fact of stream) {
      order.push(fact.kind)
      facts.push(fact)
    }
  } finally {
    await transport.close()
    await resources.close()
    if (handler !== null) await server.close()
  }
  return { order, facts }
}

describe('the transport tells its observer when it starts to read the response body', () => {
  it('tells once, before the first fact decoded from the body', async () => {
    const { order } = await run(res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(sseBody(TEXT('a'), STOP))
    })
    expect(order.filter(item => item === 'body')).toHaveLength(1)
    const told = order.indexOf('body')
    const firstContent = order.findIndex(item => item.startsWith('block-'))
    expect(firstContent).toBeGreaterThan(told)
  })

  it.each([429, 500, 503])('does not tell for an HTTP %i answer', async status => {
    const { order, facts } = await run(res => {
      res.writeHead(status)
      res.end('{"error":"nope"}')
    })
    expect(order).not.toContain('body')
    expect(facts.at(-1)).toMatchObject({
      kind: 'ended',
      termination: { kind: 'failed', fault: { diagnostic: `http-${status}` } },
    })
  })

  it('does not tell for a refused connection', async () => {
    const { order, facts } = await run(null)
    expect(order).toEqual(['ended'])
    expect(facts).toHaveLength(1)
  })

  it('a throwing observer changes nothing', async () => {
    const { facts } = await run(
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.end(sseBody(TEXT('a'), STOP))
      },
      () => {
        throw new Error('the observer broke')
      },
    )
    expect(facts.at(-1)).toEqual({
      kind: 'ended',
      termination: { kind: 'completed', reason: 'stop' },
    })
  })
})

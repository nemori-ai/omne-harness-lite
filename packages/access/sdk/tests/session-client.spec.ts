import { afterEach, describe, expect, it } from 'vitest'
import {
  RequestInvalidError,
  createGovernanceClient,
  createHttpTransport,
  createSessionClient,
  parseTenantText,
  tenantText as renderTenant,
  userTextMessage,
} from '@omne-harness/sdk'
import type {
  GovernanceRequest,
  GovernanceTransport,
  SessionOperation,
  SessionRequest,
  TransportReport,
} from '@omne-harness/sdk'
import { proofValue, sessionId, tenantText } from './support/fixtures.ts'
import { jsonReply, startLoopback, type LoopbackServer, type Reply } from './support/loopback.ts'

const servers: LoopbackServer[] = []
async function serve(
  handler: (received: { body: Buffer; url: string | undefined }) => Reply,
): Promise<LoopbackServer> {
  const server = await startLoopback(handler)
  servers.push(server)
  return server
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
})

const tenant = (() => {
  const parsed = parseTenantText(tenantText)
  if (parsed === undefined) throw new Error('fixture tenant is invalid')
  return parsed
})()
const proof = { kind: 'present', value: proofValue } as const
const base = { protocolVersion: 'session-public/1', proof } as const
const target = { tenant, session: sessionId }

const requests = {
  'create-session': {
    ...base,
    messageId: 'm-create',
    operation: 'create-session',
    actingTenant: tenant,
    body: { createCallId: 'create-1', definition: 'default', purpose: '' },
  },
  'query-create-session': {
    ...base,
    messageId: 'm-query-create',
    operation: 'query-create-session',
    body: { tenant, createCallId: 'create-1' },
  },
  'send-input': {
    ...base,
    messageId: 'm-send',
    operation: 'send-input',
    body: {
      ...target,
      acceptId: 'accept-1',
      inputId: 'input-1',
      message: userTextMessage('hi', 'input-1'),
    },
  },
  'query-send-input': {
    ...base,
    messageId: 'm-query-send',
    operation: 'query-send-input',
    body: { ...target, acceptId: 'accept-1' },
  },
  'read-history': {
    ...base,
    messageId: 'm-history',
    operation: 'read-history',
    body: { ...target, cursor: null, direction: 'forward', pageBytes: '4096' },
  },
  'cancel-run': {
    ...base,
    messageId: 'm-cancel',
    operation: 'cancel-run',
    body: { ...target, controlId: 'control-1', run: 'run-1', urgency: 'graceful' },
  },
  'stop-call': {
    ...base,
    messageId: 'm-stop',
    operation: 'stop-call',
    body: { ...target, controlId: 'control-2', producer: { kind: 'model', call: 'call-1' } },
  },
} as const satisfies { readonly [O in SessionOperation]: SessionRequest<O> }

function wireOf(received: { body: Buffer }): Record<string, unknown> {
  return JSON.parse(received.body.toString('utf8')) as Record<string, unknown>
}

/** An answer in the wire form of a session response, bound to the request's message id. */
function answer(received: { body: Buffer }, outcome: string, body: unknown = {}): Reply {
  const wire = wireOf(received)
  return jsonReply(outcome === 'unknown' ? 500 : 200, {
    protocolVersion: 'session-public/1',
    messageId: wire['messageId'],
    outcome,
    body,
  })
}

describe('session client over HTTP', () => {
  it('carries a create-session round trip and keeps the proof in the body only', async () => {
    const server = await serve(received =>
      answer(received, 'succeeded', { session: sessionId, recovered: false }),
    )
    const client = createSessionClient({
      transport: createHttpTransport({ origin: server.origin, location: 'session' }),
    })
    const result = await client.submit(requests['create-session'])
    expect(result).toEqual({
      kind: 'response',
      message: {
        protocolVersion: 'session-public/1',
        messageId: 'm-create',
        outcome: 'succeeded',
        body: { session: sessionId, recovered: false },
      },
    })
    const [seen] = server.received
    expect(seen?.url).toBe('/session-public/1')
    expect(wireOf({ body: seen?.body ?? Buffer.alloc(0) })['loginProof']).toBe(proofValue)
    expect(JSON.stringify(seen?.headers)).not.toContain(proofValue)
  })

  it.each(Object.keys(requests) as SessionOperation[])(
    'sends %s in its wire form and hands over the matching response',
    async operation => {
      const server = await serve(received => answer(received, 'denied'))
      const client = createSessionClient({
        transport: createHttpTransport({ origin: server.origin, location: 'session' }),
      })
      const result = await client.submit(requests[operation] as SessionRequest)
      expect(result.kind).toBe('response')
      if (result.kind === 'response') {
        expect(result.message.outcome).toBe('denied')
        expect(result.message.messageId).toBe(requests[operation].messageId)
      }
      expect(wireOf({ body: server.received[0]?.body ?? Buffer.alloc(0) })['operation']).toBe(
        operation,
      )
    },
  )

  it('hands a status 500 with a matching unknown body to the caller as a response', async () => {
    const server = await serve(received => answer(received, 'unknown'))
    const client = createSessionClient({
      transport: createHttpTransport({ origin: server.origin, location: 'session' }),
    })
    const result = await client.submit(requests['send-input'])
    expect(result.kind === 'response' && result.message.outcome).toBe('unknown')
  })

  it('reports uncertain for a status 500 without a body', async () => {
    const server = await serve(() => ({ status: 500 }))
    const client = createSessionClient({
      transport: createHttpTransport({ origin: server.origin, location: 'session' }),
    })
    expect(await client.submit(requests['send-input'])).toEqual({ kind: 'uncertain' })
    expect(server.received).toHaveLength(1)
  })

  it('does not echo the proof in any response it hands over', async () => {
    const server = await serve(received => answer(received, 'denied'))
    const client = createSessionClient({
      transport: createHttpTransport({ origin: server.origin, location: 'session' }),
    })
    const result = await client.submit(requests['cancel-run'])
    expect(JSON.stringify(result)).not.toContain(proofValue)
  })
})

describe('governance client over HTTP', () => {
  it('carries an issue-login round trip to the governance path', async () => {
    const issued = {
      loginIdentifier: 'alice',
      issuedAt: '2026-11-01T12:00:00Z',
      tenantId: tenantText,
      loginProof: 'fresh-proof',
    }
    const server = await serve(received => ({
      ...jsonReply(200, {
        protocolVersion: 'governance-public/1',
        messageId: wireOf(received)['messageId'],
        outcome: 'succeeded',
        body: issued,
      }),
    }))
    const request = {
      protocolVersion: 'governance-public/1',
      messageId: 'm-login',
      operation: 'issue-login',
      body: { loginIdentifier: 'alice', credential: 'pw' },
    } satisfies GovernanceRequest<'issue-login'>
    const client = createGovernanceClient({
      transport: createHttpTransport({ origin: server.origin, location: 'governance' }),
    })
    const result = await client.submit(request)
    expect(result).toEqual({
      kind: 'response',
      message: {
        protocolVersion: 'governance-public/1',
        messageId: 'm-login',
        outcome: 'succeeded',
        body: issued,
      },
    })
    expect(server.received[0]?.url).toBe('/governance-public/1')
  })
})

type Script = (bytes: Uint8Array) => TransportReport | Promise<TransportReport>
function scripted(...steps: Script[]): GovernanceTransport & { readonly sent: Uint8Array[] } {
  const sent: Uint8Array[] = []
  return {
    sent,
    async send(bytes) {
      sent.push(bytes)
      const step = steps[sent.length - 1]
      if (step === undefined) throw new Error('unexpected extra send')
      return step(bytes)
    },
  }
}
const encoder = new TextEncoder()
const messageIdOf = (bytes: Uint8Array) =>
  (JSON.parse(new TextDecoder().decode(bytes)) as { messageId: string }).messageId
function responseFor(messageId: string, outcome = 'denied'): TransportReport {
  return {
    kind: 'response',
    bytes: encoder.encode(
      JSON.stringify({ protocolVersion: 'session-public/1', messageId, outcome, body: {} }),
    ),
  }
}

describe('resend and correlation', () => {
  it('resends the same bytes once when the transport proves nothing was sent', async () => {
    const transport = scripted(
      () => ({ kind: 'not-sent' }),
      bytes => responseFor(messageIdOf(bytes)),
    )
    const result = await createSessionClient({ transport }).submit(requests['cancel-run'])
    expect(result.kind).toBe('response')
    expect(transport.sent).toHaveLength(2)
    expect(Buffer.from(transport.sent[1] ?? []).equals(Buffer.from(transport.sent[0] ?? []))).toBe(
      true,
    )
  })

  it('reports uncertain when the second attempt is also not sent', async () => {
    const transport = scripted(
      () => ({ kind: 'not-sent' }),
      () => ({ kind: 'not-sent' }),
    )
    expect(await createSessionClient({ transport }).submit(requests['stop-call'])).toEqual({
      kind: 'uncertain',
    })
    expect(transport.sent).toHaveLength(2)
  })

  it('does not resend after an uncertain report', async () => {
    const transport = scripted(() => ({ kind: 'uncertain' }))
    expect(await createSessionClient({ transport }).submit(requests['send-input'])).toEqual({
      kind: 'uncertain',
    })
    expect(transport.sent).toHaveLength(1)
  })

  it('does not resend after a response it cannot read', async () => {
    const transport = scripted(() => ({ kind: 'response', bytes: encoder.encode('not json') }))
    expect(await createSessionClient({ transport }).submit(requests['send-input'])).toEqual({
      kind: 'uncertain',
    })
    expect(transport.sent).toHaveLength(1)
  })

  it('does not credit a response without a message id to the call', async () => {
    const transport = scripted(() => ({
      kind: 'response',
      bytes: encoder.encode(
        JSON.stringify({
          protocolVersion: 'session-public/1',
          outcome: 'protocol-rejected',
          body: {},
        }),
      ),
    }))
    expect(await createSessionClient({ transport }).submit(requests['send-input'])).toEqual({
      kind: 'uncertain',
    })
  })

  it('keys each response to its own message id when a transport answers in swapped order', async () => {
    // One shared channel that pairs each answer with the other caller: answers arrive crossed.
    const held: { bytes: Uint8Array; release: (report: TransportReport) => void }[] = []
    const transport: GovernanceTransport = {
      send: bytes =>
        new Promise<TransportReport>(release => {
          held.push({ bytes, release })
          const [first, second] = held
          if (held.length === 2 && first !== undefined && second !== undefined) {
            first.release(responseFor(messageIdOf(second.bytes)))
            second.release(responseFor(messageIdOf(first.bytes)))
          }
        }),
    }
    const client = createSessionClient({ transport })
    const results = await Promise.all([
      client.submit(requests['cancel-run']),
      client.submit(requests['stop-call']),
    ])
    expect(results).toEqual([{ kind: 'uncertain' }, { kind: 'uncertain' }])
  })
})

describe('request validation', () => {
  it('throws RequestInvalidError without sending, and the error text has no input value', async () => {
    const transport = scripted()
    const bad = {
      ...requests['cancel-run'],
      body: { ...requests['cancel-run'].body, session: 'not-a-session-id' },
    } as unknown as SessionRequest
    const failure = await createSessionClient({ transport })
      .submit(bad)
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(failure).toBeInstanceOf(RequestInvalidError)
    expect(String(failure)).not.toContain(proofValue)
    expect(String(failure)).not.toContain('not-a-session-id')
    expect(transport.sent).toHaveLength(0)
  })
})

describe('tenant text and user messages', () => {
  it('round-trips a tenant text and refuses text that is not a tenant', () => {
    expect(renderTenant(tenant)).toBe(tenantText)
    expect(parseTenantText('{"organization":"x"}')).toBeUndefined()
    expect(parseTenantText('')).toBeUndefined()
    expect(parseTenantText('plain')).toBeUndefined()
  })

  it('builds the same user message for the same input id and a different one for another', () => {
    expect(userTextMessage('hi', 'input-1')).toEqual(userTextMessage('hi', 'input-1'))
    expect(userTextMessage('hi', 'input-1')).not.toEqual(userTextMessage('hi', 'input-2'))
    expect(userTextMessage('hi', 'input-1')).not.toEqual(userTextMessage('yo', 'input-1'))
  })

  it('puts the text in a user message the contract accepts on the wire', async () => {
    const server = await serve(received => answer(received, 'succeeded', { recovered: false }))
    const client = createSessionClient({
      transport: createHttpTransport({ origin: server.origin, location: 'session' }),
    })
    const result = await client.submit({
      ...requests['send-input'],
      body: { ...requests['send-input'].body, message: userTextMessage('-- 你好 --', 'input-9') },
    })
    expect(result.kind).toBe('response')
    const body = wireOf({ body: server.received[0]?.body ?? Buffer.alloc(0) })['body'] as {
      message: { id: string; role: string; blocks: { kind: string; text: string }[] }
    }
    expect(body.message.role).toBe('user')
    expect(body.message.id).toMatch(/^msg_[A-Za-z0-9_-]{22,64}$/)
    expect(body.message.blocks.map(block => [block.kind, block.text])).toEqual([
      ['text', '-- 你好 --'],
    ])
  })
})

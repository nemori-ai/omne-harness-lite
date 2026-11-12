// HITL 客户端（SPEC「HITL 客户端」）：经环回服务端替身往返四个操作，核对路径、按 messageId 的关联、
// 部署声明不提供的答复、`unknown` 的状态 500，以及客户端与公开契约读取的一致。
import { afterEach, describe, expect, it } from 'vitest'
import {
  RequestInvalidError,
  createHitlClient,
  createHttpTransport,
  parseTenantText,
  type GovernanceTransport,
  type HitlOperation,
  type HitlRequest,
  type TransportReport,
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
const base = { protocolVersion: 'hitl-public/1', proof } as const
const card = { request: { tenantRef: tenantText, requestId: 'request-1' }, cardId: 'card-1' }
const submission = {
  tenant,
  card,
  expectedRevision: '0',
  reply: { kind: 'text', text: '先别动' },
  replyId: 'reply-1',
} as const

const requests = {
  'list-cards': {
    ...base,
    messageId: 'm-list',
    operation: 'list-cards',
    body: {
      tenant,
      filter: { states: ['pending'], sessionRef: sessionId },
      cursor: null,
      limit: 20,
    },
  },
  'read-card': { ...base, messageId: 'm-read', operation: 'read-card', body: { tenant, card } },
  'submit-reply': { ...base, messageId: 'm-submit', operation: 'submit-reply', body: submission },
  'query-submit-reply': {
    ...base,
    messageId: 'm-query',
    operation: 'query-submit-reply',
    body: submission,
  },
} as const satisfies { readonly [O in HitlOperation]: HitlRequest<O> }

const item = {
  card: {
    ref: card,
    revision: '0',
    question: {
      cardId: 'card-1',
      title: '要删除这些文件吗',
      description: '工具要删除 3 个文件',
      declineConsequence: '跳过时工具不执行',
      kind: 'approval',
      options: [{ id: 'yes', label: '同意', description: '删除', effectRef: 'effect-1' }],
    },
    kind: 'pending',
  },
  origin: { kind: 'tool', sessionRef: sessionId, toolCallRef: 'call-1' },
  displayContext: '会话里的一次工具调用',
}
const page = { items: [item], next: null, snapshotRef: 'snapshot-1', completeness: 'complete' }

function wireOf(received: { body: Buffer }): Record<string, unknown> {
  return JSON.parse(received.body.toString('utf8')) as Record<string, unknown>
}

const statuses: Readonly<Record<string, number>> = {
  succeeded: 200,
  denied: 403,
  unknown: 500,
  'stage-not-provided': 501,
}

function answer(received: { body: Buffer }, outcome: string, body: unknown = {}): Reply {
  return jsonReply(statuses[outcome] ?? 200, {
    protocolVersion: 'hitl-public/1',
    messageId: wireOf(received)['messageId'],
    outcome,
    body,
  })
}

function client(server: LoopbackServer) {
  return createHitlClient({
    transport: createHttpTransport({ origin: server.origin, location: 'hitl' }),
  })
}

describe('HITL client over HTTP', () => {
  it('location 为 hitl 的适配向 /hitl-public/1 发 POST，登录证明只在正文里', async () => {
    const server = await serve(received => answer(received, 'succeeded', page))
    const result = await client(server).submit(requests['list-cards'])
    expect(result).toEqual({
      kind: 'response',
      message: {
        protocolVersion: 'hitl-public/1',
        messageId: 'm-list',
        outcome: 'succeeded',
        body: page,
      },
    })
    const [seen] = server.received
    expect(seen?.method).toBe('POST')
    expect(seen?.url).toBe('/hitl-public/1')
    expect(wireOf({ body: seen?.body ?? Buffer.alloc(0) })['loginProof']).toBe(proofValue)
    expect(JSON.stringify(seen?.headers)).not.toContain(proofValue)
    expect(JSON.stringify(result)).not.toContain(proofValue)
  })

  it.each(Object.keys(requests) as HitlOperation[])(
    '%s 以线上形式发出，匹配的响应交给调用者',
    async operation => {
      const server = await serve(received => answer(received, 'denied'))
      const result = await client(server).submit(requests[operation] as HitlRequest)
      expect(result.kind === 'response' && result.message).toEqual({
        protocolVersion: 'hitl-public/1',
        messageId: requests[operation].messageId,
        outcome: 'denied',
        body: {},
      })
      const wire = wireOf({ body: server.received[0]?.body ?? Buffer.alloc(0) })
      expect(wire['operation']).toBe(operation)
      expect(wire['body']).toMatchObject({ tenant: tenantText })
    },
  )

  it('read-card 的卡片视图原样交出', async () => {
    const server = await serve(received => answer(received, 'succeeded', { item }))
    const result = await client(server).submit(requests['read-card'])
    expect(result.kind === 'response' && result.message.body).toEqual({ item })
  })

  it.each(Object.keys(requests) as HitlOperation[])(
    '%s 的部署声明不提供答复交成 response，只发一次',
    async operation => {
      const server = await serve(received => answer(received, 'stage-not-provided'))
      const result = await client(server).submit(requests[operation] as HitlRequest)
      expect(result.kind === 'response' && result.message.outcome).toBe('stage-not-provided')
      expect(server.received).toHaveLength(1)
    },
  )

  it('submit-reply 的状态 500 与匹配的 unknown 交成 response，不自动再送', async () => {
    const server = await serve(received => answer(received, 'unknown'))
    const result = await client(server).submit(requests['submit-reply'])
    expect(result.kind === 'response' && result.message.outcome).toBe('unknown')
    expect(server.received).toHaveLength(1)
  })
})

type Script = (bytes: Uint8Array) => TransportReport
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
function reply(value: unknown): Script {
  return () => ({ kind: 'response', bytes: encoder.encode(JSON.stringify(value)) })
}
function response(messageId: string | null, outcome: string, body: unknown): unknown {
  return {
    protocolVersion: 'hitl-public/1',
    ...(messageId === null ? {} : { messageId }),
    outcome,
    body,
  }
}

describe('与公开契约读取一致', () => {
  it('公开契约读不出的响应是 uncertain，不交出正文', async () => {
    const routed = { ...item, origin: { ...item.origin, wait: 'wait-1' } }
    const unreadable = [
      response('m-read', 'succeeded', { item: routed }),
      response('m-read', 'denied', { reason: 'no-card' }),
      response('m-read', 'stage-not-provided', { reason: 'x' }),
      response('m-read', 'conflict', {}),
      { ...(response('m-read', 'denied', {}) as object), protocolVersion: 'session-public/1' },
    ]
    for (const value of unreadable) {
      const transport = scripted(reply(value))
      expect(await createHitlClient({ transport }).submit(requests['read-card'])).toEqual({
        kind: 'uncertain',
      })
      expect(transport.sent).toHaveLength(1)
    }
  })

  it('关联值不是这一次，或没有关联值，是 uncertain', async () => {
    for (const messageId of ['other', null]) {
      const transport = scripted(reply(response(messageId, 'stage-not-provided', {})))
      expect(await createHitlClient({ transport }).submit(requests['list-cards'])).toEqual({
        kind: 'uncertain',
      })
    }
  })

  it('传输证明没有发出时原样再送一次，再送的字节与第一次相同', async () => {
    const transport = scripted(
      () => ({ kind: 'not-sent' }),
      reply(response('m-submit', 'unknown', {})),
    )
    const result = await createHitlClient({ transport }).submit(requests['submit-reply'])
    expect(result.kind === 'response' && result.message.outcome).toBe('unknown')
    expect(Buffer.from(transport.sent[1] ?? []).equals(Buffer.from(transport.sent[0] ?? []))).toBe(
      true,
    )
  })

  it('公开契约不接受的请求抛 RequestInvalidError，不发送', async () => {
    const transport = scripted()
    const bad = {
      ...requests['list-cards'],
      body: { ...requests['list-cards'].body, filter: { states: ['pending'], sessionRef: 'S-1' } },
    } as unknown as HitlRequest
    const failure = await createHitlClient({ transport })
      .submit(bad)
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(failure).toBeInstanceOf(RequestInvalidError)
    expect(String(failure)).not.toContain(proofValue)
    expect(transport.sent).toHaveLength(0)
  })
})

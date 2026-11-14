import {
  encodeHitlRequest,
  readGovernanceRequest,
  readHitlRequest,
  readSessionRequest,
  type HitlCodecLimits,
  type HitlOperation,
  type HitlRequest,
} from '@omne-harness/public-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'

const limits: HitlCodecLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const version = 'hitl-public/1'
const tenantText = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
const parsedTenant = tenantCodec.parse(tenantText)
if (!parsedTenant.ok) throw new Error('invalid test tenant')
const tenant = parsedTenant.value
const session = '0123456789abcdef'.repeat(4)
const card = { request: { tenantRef: tenantText, requestId: 'request-1' }, cardId: 'card-1' }
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const read = (value: unknown) => readHitlRequest({ bytes: bytes(value), limits })
const submission = {
  tenant: tenantText,
  card,
  expectedRevision: '3',
  reply: { kind: 'selection', optionId: 'yes' },
  replyId: 'reply-1',
}

function wire(operation: HitlOperation, body: object): Record<string, unknown> {
  return { protocolVersion: version, messageId: 'm', operation, loginProof: 'proof', body }
}

const wires: { readonly [O in HitlOperation]: Record<string, unknown> } = {
  'list-cards': wire('list-cards', {
    tenant: tenantText,
    filter: { states: ['pending'] },
    cursor: null,
    limit: 20,
  }),
  'read-card': wire('read-card', { tenant: tenantText, card }),
  'submit-reply': wire('submit-reply', submission),
  'query-submit-reply': wire('query-submit-reply', submission),
}

function listCards(body: Record<string, unknown>): Record<string, unknown> {
  return wire('list-cards', { tenant: tenantText, filter: { states: ['pending'] }, ...body })
}

function rejected(value: unknown) {
  return read(value).kind
}

describe('readHitlRequest 的正向量', () => {
  it.each(Object.keys(wires) as HitlOperation[])('%s 读出请求，租户本地是铸造值', operation => {
    const result = read(wires[operation])
    expect(result.kind).toBe('request')
    if (result.kind !== 'request') return
    expect(result.request.operation).toBe(operation)
    expect(result.request.proof).toEqual({ kind: 'present', value: 'proof' })
    expect(tenantCodec.encode(result.request.body.tenant)).toEqual({ ok: true, value: tenantText })
  })

  it('list-cards 的过滤条件三个可选键都能出现，cursor 可为续页文本', () => {
    const result = read(
      listCards({
        filter: {
          states: ['pending', 'decided', 'invalidated'],
          originKind: 'tool',
          sessionRef: session,
          delivery: 'accepted',
        },
        cursor: 'next-page',
        limit: 100,
      }),
    )
    expect(result.kind).toBe('request')
    if (result.kind !== 'request' || result.request.operation !== 'list-cards') return
    expect(result.request.body).toMatchObject({
      filter: { sessionRef: session, originKind: 'tool', delivery: 'accepted' },
      cursor: 'next-page',
      limit: 100,
    })
  })

  it.each([
    { kind: 'selection', optionId: 'yes' },
    { kind: 'text', text: '先别动生产库' },
    { kind: 'decline' },
  ])('答复形状 %o 读得出', reply => {
    expect(rejected(wire('submit-reply', { ...submission, reply }))).toBe('request')
  })

  it('缺 loginProof 与空 loginProof 不在第 1 步拒绝', () => {
    const { loginProof: _, ...missing } = wires['read-card']
    const absent = read(missing)
    const empty = read({ ...wires['read-card'], loginProof: '' })
    expect(absent.kind === 'request' && absent.request.proof).toEqual({ kind: 'missing' })
    expect(empty.kind === 'request' && empty.request.proof).toEqual({ kind: 'empty' })
  })
})

describe('readHitlRequest 的反向量', () => {
  it('filter.states 必填，且为 1 至 3 项的已知状态', () => {
    expect(rejected(listCards({ filter: {}, cursor: null, limit: 1 }))).toBe('protocol-rejected')
    expect(rejected(listCards({ filter: { states: [] }, cursor: null, limit: 1 }))).toBe(
      'protocol-rejected',
    )
    expect(
      rejected(
        listCards({
          filter: { states: ['pending', 'decided', 'invalidated', 'pending'] },
          cursor: null,
          limit: 1,
        }),
      ),
    ).toBe('protocol-rejected')
    expect(rejected(listCards({ filter: { states: ['open'] }, cursor: null, limit: 1 }))).toBe(
      'protocol-rejected',
    )
  })

  it('filter.sessionRef 必须是 64 个小写十六进制字符', () => {
    const withSession = (sessionRef: unknown) =>
      rejected(listCards({ filter: { states: ['pending'], sessionRef }, cursor: null, limit: 1 }))
    expect(withSession(session)).toBe('request')
    expect(withSession(session.toUpperCase())).toBe('protocol-rejected')
    expect(withSession(session.slice(1))).toBe('protocol-rejected')
    expect(withSession(`${session}0`)).toBe('protocol-rejected')
    expect(withSession('session-1')).toBe('protocol-rejected')
  })

  it('filter 的其他键与位置引用都被拒绝', () => {
    expect(
      rejected(
        listCards({ filter: { states: ['pending'], locationRef: 'x' }, cursor: null, limit: 1 }),
      ),
    ).toBe('protocol-rejected')
    expect(rejected(listCards({ cursor: null, limit: 1, locationRef: 'pool' }))).toBe(
      'protocol-rejected',
    )
  })

  it('cursor 键必须出现，是 null 或非空字符串', () => {
    expect(rejected(listCards({ limit: 1 }))).toBe('protocol-rejected')
    expect(rejected(listCards({ cursor: '', limit: 1 }))).toBe('protocol-rejected')
    expect(rejected(listCards({ cursor: 3, limit: 1 }))).toBe('protocol-rejected')
  })

  it.each([0, 101, -1, 1.5, '10', null])('limit 为 %o 时拒绝', limit => {
    expect(rejected(listCards({ cursor: null, limit }))).toBe('protocol-rejected')
  })

  it('limit 是 JSON 整数，不收 1.0 与 1e1 的写法', () => {
    const raw = (lexeme: string) =>
      readHitlRequest({
        bytes: new TextEncoder().encode(
          `{"protocolVersion":"${version}","messageId":"m","operation":"list-cards","loginProof":"p","body":{"tenant":${JSON.stringify(tenantText)},"filter":{"states":["pending"]},"cursor":null,"limit":${lexeme}}}`,
        ),
        limits,
      }).kind
    expect(raw('10')).toBe('request')
    expect(raw('10.0')).toBe('protocol-rejected')
    expect(raw('1e1')).toBe('protocol-rejected')
  })

  it('card 恰含 request 与 cardId，request 恰含 tenantRef 与 requestId', () => {
    const withCard = (value: unknown) =>
      rejected(wire('read-card', { tenant: tenantText, card: value }))
    expect(withCard({ ...card, extra: 'x' })).toBe('protocol-rejected')
    expect(withCard({ request: { ...card.request, extra: 'x' }, cardId: 'c' })).toBe(
      'protocol-rejected',
    )
    expect(withCard({ request: card.request })).toBe('protocol-rejected')
    expect(withCard({ ...card, cardId: '' })).toBe('protocol-rejected')
  })

  it('reply 只有三种封闭形状，一次只含一种', () => {
    const withReply = (reply: unknown) => rejected(wire('submit-reply', { ...submission, reply }))
    expect(withReply({ kind: 'selection', optionId: 'a', text: 'b' })).toBe('protocol-rejected')
    expect(withReply({ kind: 'decline', text: 'b' })).toBe('protocol-rejected')
    expect(withReply({ kind: 'text', text: '' })).toBe('protocol-rejected')
    expect(withReply({ kind: 'timeout' })).toBe('protocol-rejected')
  })

  it.each(['', '01', '-1', '1.0', 'a'])('expectedRevision 为 %o 时拒绝', expectedRevision => {
    expect(rejected(wire('submit-reply', { ...submission, expectedRevision }))).toBe(
      'protocol-rejected',
    )
  })

  it('客户端填写操作身份或操作者时拒绝', () => {
    expect(rejected(wire('submit-reply', { ...submission, operationId: 'op' }))).toBe(
      'protocol-rejected',
    )
    expect(rejected(wire('query-submit-reply', { ...submission, actorRef: 'a' }))).toBe(
      'protocol-rejected',
    )
  })

  it('actingTenant 被禁止', () => {
    expect(rejected({ ...wires['list-cards'], actingTenant: tenantText })).toBe('protocol-rejected')
  })

  it('四个操作以外的操作名是 protocol-rejected，诊断为 operation', () => {
    const result = read({ ...wires['read-card'], operation: 'list-pool' })
    expect(result).toEqual({
      kind: 'protocol-rejected',
      response: {
        protocolVersion: version,
        messageId: 'm',
        outcome: 'protocol-rejected',
        body: {},
      },
      diagnostic: { code: 'operation' },
    })
  })
})

describe('跨位置', () => {
  it('HITL 读取收到会话或治理版本的消息是 protocol-rejected，响应写 hitl-public/1', () => {
    for (const other of ['session-public/1', 'governance-public/1']) {
      const result = read({ ...wires['read-card'], protocolVersion: other })
      expect(result.kind).toBe('protocol-rejected')
      if (result.kind !== 'protocol-rejected') continue
      expect(result.response.protocolVersion).toBe(version)
      expect(result.diagnostic).toEqual({ code: 'version' })
    }
  })

  it('会话与治理读取收到 hitl-public/1 的消息是 protocol-rejected，在版本一步拒绝', () => {
    const message = bytes(wires['list-cards'])
    for (const result of [
      readSessionRequest({ bytes: message, limits }),
      readGovernanceRequest({ bytes: message, limits }),
    ]) {
      expect(result.kind).toBe('protocol-rejected')
      expect(result.kind === 'protocol-rejected' && result.diagnostic).toEqual({ code: 'version' })
    }
  })
})

describe('encodeHitlRequest', () => {
  const requests: { readonly [O in HitlOperation]: HitlRequest<O> } = {
    'list-cards': {
      protocolVersion: version,
      messageId: 'm',
      operation: 'list-cards',
      proof: { kind: 'present', value: 'proof' },
      body: {
        tenant,
        filter: { states: ['pending'], sessionRef: session },
        cursor: null,
        limit: 5,
      },
    },
    'read-card': {
      protocolVersion: version,
      messageId: 'm',
      operation: 'read-card',
      proof: { kind: 'missing' },
      body: { tenant, card },
    },
    'submit-reply': {
      protocolVersion: version,
      messageId: 'm',
      operation: 'submit-reply',
      proof: { kind: 'empty' },
      body: { ...submission, tenant, reply: { kind: 'decline' } },
    },
    'query-submit-reply': {
      protocolVersion: version,
      messageId: 'm',
      operation: 'query-submit-reply',
      proof: { kind: 'present', value: 'proof' },
      body: { ...submission, tenant, reply: { kind: 'text', text: '好' } },
    },
  }

  it.each(Object.keys(requests) as HitlOperation[])('%s 编码后原样读回', operation => {
    const encoded = encodeHitlRequest({ request: requests[operation], limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind !== 'encoded') return
    expect(readHitlRequest({ bytes: encoded.bytes, limits })).toEqual({
      kind: 'request',
      request: requests[operation],
    })
  })

  it('线上 tenant 是 tenantCodec 的文本', () => {
    const encoded = encodeHitlRequest({ request: requests['read-card'], limits })
    if (encoded.kind !== 'encoded') throw new Error('not encoded')
    const body = JSON.parse(new TextDecoder().decode(encoded.bytes)).body
    expect(body.tenant).toBe(tenantText)
  })

  it('模型不合规得到 invalid', () => {
    const bad = (request: unknown) =>
      encodeHitlRequest({ request: request as HitlRequest, limits }).kind
    const list = requests['list-cards']
    expect(bad({ ...list, body: { ...list.body, limit: 101 } })).toBe('invalid')
    expect(bad({ ...list, body: { ...list.body, filter: { states: [] } } })).toBe('invalid')
    expect(
      bad({ ...list, body: { ...list.body, filter: { states: ['pending'], sessionRef: 'S' } } }),
    ).toBe('invalid')
    expect(bad({ ...list, protocolVersion: 'session-public/1' })).toBe('invalid')
    expect(bad({ ...list, actingTenant: tenant })).toBe('invalid')
    expect(bad({ ...list, body: { ...list.body, tenant: tenantText } })).toBe('invalid')
  })

  it('编程参数错误抛固定 TypeError', () => {
    expect(() => readHitlRequest({ bytes: 'x', limits } as never)).toThrow(
      new TypeError('Invalid hitl codec arguments'),
    )
  })
})

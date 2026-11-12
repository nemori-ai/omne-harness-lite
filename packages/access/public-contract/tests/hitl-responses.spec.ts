// HITL 一组的响应读写（SPEC「HITL 结果」「卡片视图」「答复的提交与认回」「HITL 编解码函数」）。
import {
  encodeHitlResponse,
  encodeSessionResponse,
  readHitlResponse,
  type HitlOperation,
  type HitlResponseEncodeInput,
} from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'

const limits = {
  maxBytes: 100_000,
  maxDepth: 100,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const version = 'hitl-public/1'
const operations: readonly HitlOperation[] = [
  'list-cards',
  'read-card',
  'submit-reply',
  'query-submit-reply',
]
const cardRef = { request: { tenantRef: 'tenant-1', requestId: 'request-1' }, cardId: 'card-1' }
const decisionRef = {
  card: cardRef,
  decisionId: 'decision-1',
  submission: { tenantRef: 'tenant-1', actorRef: 'actor-1', operationId: 'op-1' },
}
const decision = {
  ref: decisionRef,
  reply: { kind: 'selection', optionId: 'yes' },
  basisRef: 'basis-1',
  commitReceipt: 'receipt-1',
}
const question = {
  cardId: 'card-1',
  title: '要删除这些文件吗',
  description: '工具要删除 3 个文件',
  declineConsequence: '跳过时工具不执行',
  kind: 'approval',
  options: [
    { id: 'yes', label: '同意', description: '删除', effectRef: 'effect-1' },
    { id: 'no', label: '不同意', description: '保留' },
  ],
}
const pendingItem = {
  card: { ref: cardRef, revision: '0', question, kind: 'pending' },
  origin: { kind: 'tool', sessionRef: 'a'.repeat(64), runRef: 'run-1', toolCallRef: 'call-1' },
  displayContext: '会话里的一次工具调用',
}
const decidedItem = {
  card: {
    ref: cardRef,
    revision: '1',
    question: { ...question, kind: 'question', options: [question.options[1]] },
    kind: 'decided',
    decision,
    delivery: { kind: 'accepted', receiptRef: 'delivery-1' },
  },
  origin: { kind: 'independent' },
  displayContext: '独立请求',
}
const invalidatedItem = {
  card: {
    ref: cardRef,
    revision: '2',
    question: { ...question, kind: 'extension', options: [] },
    kind: 'invalidated',
    reason: 'origin-terminal',
    terminalEvidenceRef: 'terminal-1',
  },
  origin: { kind: 'agent-extension', sessionRef: 'b'.repeat(64) },
  displayContext: '扩展件',
}
const successes = {
  'list-cards': {
    items: [pendingItem, decidedItem, invalidatedItem],
    next: 'page-2',
    snapshotRef: 'snapshot-1',
    completeness: 'partial',
  },
  'read-card': { item: pendingItem },
  'submit-reply': { kind: 'decided', decisionRef, revision: '1', delivery: 'pending' },
  'query-submit-reply': { kind: 'already-decided', decision },
} satisfies Record<HitlOperation, object>
const outcomes: { readonly [O in HitlOperation]: readonly string[] } = {
  'list-cards': ['succeeded', 'denied', 'invalid', 'limited', 'conflict', 'basis-unavailable'],
  'read-card': ['succeeded', 'denied', 'invalid', 'limited', 'basis-unavailable'],
  'submit-reply': [
    'succeeded',
    'denied',
    'invalid',
    'limited',
    'conflict',
    'basis-unavailable',
    'unknown',
  ],
  'query-submit-reply': [
    'succeeded',
    'not-committed',
    'denied',
    'invalid',
    'limited',
    'conflict',
    'basis-unavailable',
    'unknown',
  ],
}
const everyOutcome = [
  'succeeded',
  'no-change',
  'not-committed',
  'need-decision',
  'invalid',
  'denied',
  'not-visible',
  'not-found',
  'conflict',
  'archived',
  'frozen',
  'limited',
  'unsupported',
  'basis-unavailable',
  'unknown',
]
const bodyOf = (operation: HitlOperation, outcome: string): object =>
  outcome === 'succeeded'
    ? successes[operation]
    : outcome === 'limited'
      ? { resource: 'card-bytes', limit: 4096 }
      : {}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
/** `messageId` 为 null 时响应不带关联值。 */
const response = (outcome: string, body: unknown, messageId: string | null = 'm') => ({
  protocolVersion: version,
  ...(messageId === null ? {} : { messageId }),
  outcome,
  body,
})
const read = (operation: HitlOperation, value: unknown, expectedMessageId = 'm') =>
  readHitlResponse({ bytes: bytes(value), operation, expectedMessageId, limits })

function withPendingItem(change: (item: Record<string, unknown>) => unknown) {
  return response('succeeded', { item: change(structuredClone(pendingItem)) })
}

describe('readHitlResponse 的 outcome 矩阵', () => {
  for (const operation of operations)
    it(`${operation} 只读出表里的 outcome`, () => {
      for (const outcome of everyOutcome) {
        const result = read(operation, response(outcome, bodyOf(operation, outcome)))
        expect(result.kind, outcome).toBe(
          outcomes[operation].includes(outcome) ? 'response' : 'unreadable',
        )
      }
    })

  it.each(operations)('%s 的成功正文原样读出', operation => {
    const result = read(operation, response('succeeded', successes[operation]))
    expect(result).toEqual({
      kind: 'response',
      response: response('succeeded', successes[operation]),
    })
  })

  it.each(operations)('%s 接受空正文的 stage-not-provided，有无 messageId 都读得出', operation => {
    expect(read(operation, response('stage-not-provided', {})).kind).toBe('response')
    expect(read(operation, response('stage-not-provided', {}, null)).kind).toBe('unmatched')
    expect(read(operation, response('stage-not-provided', { reason: 'x' })).kind).toBe('unreadable')
  })

  it('非成功结果的正文必须为空，limited 的正文恰为 resource 与 limit', () => {
    expect(read('read-card', response('denied', { reason: 'no-card' })).kind).toBe('unreadable')
    expect(read('read-card', response('limited', {})).kind).toBe('unreadable')
    expect(read('read-card', response('limited', { resource: 'x', limit: 0 })).kind).toBe(
      'unreadable',
    )
    expect(read('submit-reply', response('unknown', {})).kind).toBe('response')
  })

  it('关联值不同得到 unmatched', () => {
    expect(read('read-card', response('denied', {}), 'other')).toStrictEqual({ kind: 'unmatched' })
  })

  it('会话版本的响应读不出', () => {
    const foreign = read('read-card', {
      ...response('denied', {}),
      protocolVersion: 'session-public/1',
    })
    expect(foreign.kind).toBe('unreadable')
    // 读不出的原因随结果一起交回。
    expect(foreign).toHaveProperty('diagnostic.code')
  })
})

describe('卡片视图', () => {
  it('origin 带原等待的路由字段时读不出', () => {
    for (const key of ['originRef', 'wait', 'positionRef', 'adoptionRef']) {
      const value = withPendingItem(item => ({
        ...item,
        origin: { ...(item.origin as object), [key]: 'x' },
      }))
      expect(read('read-card', value).kind, key).toBe('unreadable')
    }
  })

  it('只有 approval 与 admission 的选项可以带 effectRef', () => {
    const withKind = (kind: string) =>
      read(
        'read-card',
        withPendingItem(item => ({
          ...item,
          card: { ...(item.card as object), question: { ...question, kind } },
        })),
      ).kind
    expect(withKind('approval')).toBe('response')
    expect(withKind('admission')).toBe('response')
    expect(withKind('question')).toBe('unreadable')
    expect(withKind('extension')).toBe('unreadable')
  })

  it('decision 与 delivery 只在 decided 时出现，reason 只在 invalidated 时出现', () => {
    const pendingCard = pendingItem.card
    const withCard = (card: object) =>
      read('read-card', response('succeeded', { item: { ...pendingItem, card } })).kind
    expect(withCard({ ...pendingCard, decision })).toBe('unreadable')
    expect(withCard({ ...pendingCard, reason: 'cancelled', terminalEvidenceRef: 't' })).toBe(
      'unreadable',
    )
    expect(withCard({ ...pendingCard, kind: 'decided', decision })).toBe('unreadable')
    expect(
      withCard({ ...pendingCard, kind: 'decided', decision, delivery: { kind: 'pending' } }),
    ).toBe('response')
    expect(
      withCard({
        ...pendingCard,
        kind: 'decided',
        decision,
        delivery: { kind: 'pending', receiptRef: 'r' },
      }),
    ).toBe('unreadable')
  })

  it('修订是十进制文本，标识非空', () => {
    const withCard = (card: object) =>
      read('read-card', response('succeeded', { item: { ...pendingItem, card } })).kind
    expect(withCard({ ...pendingItem.card, revision: 1 })).toBe('unreadable')
    expect(withCard({ ...pendingItem.card, revision: '01' })).toBe('unreadable')
    expect(withCard({ ...pendingItem.card, revision: '1a' })).toBe('unreadable')
    expect(withCard({ ...pendingItem.card, revision: '10' })).toBe('response')
    expect(withCard({ ...pendingItem.card, ref: { ...cardRef, cardId: '' } })).toBe('unreadable')
    expect(
      read('read-card', response('succeeded', { item: { ...pendingItem, displayContext: '' } }))
        .kind,
    ).toBe('unreadable')
  })

  it('页的 next 可为 null，completeness 只取 complete 或 partial', () => {
    const page = (change: object) =>
      read('list-cards', response('succeeded', { ...successes['list-cards'], ...change })).kind
    expect(page({ next: null, completeness: 'complete' })).toBe('response')
    expect(page({ next: '' })).toBe('unreadable')
    expect(page({ completeness: 'exhausted' })).toBe('unreadable')
  })
})

describe('答复的成功正文', () => {
  it.each([
    { kind: 'decided', decisionRef, revision: '1', delivery: 'accepted' },
    { kind: 'already-decided', decision },
    { kind: 'invalidated', reason: 'origin-terminal' },
  ])('分支 %o 读得出', body => {
    expect(read('query-submit-reply', response('succeeded', body)).kind).toBe('response')
  })

  it('分支互斥，decided 的 delivery 不取 superseded', () => {
    expect(
      read(
        'submit-reply',
        response('succeeded', {
          kind: 'decided',
          decisionRef,
          revision: '1',
          delivery: 'superseded',
        }),
      ).kind,
    ).toBe('unreadable')
    expect(
      read('submit-reply', response('succeeded', { kind: 'invalidated', reason: 'x', decision }))
        .kind,
    ).toBe('unreadable')
  })
})

describe('encodeHitlResponse', () => {
  it.each(operations)('%s 的每个 outcome 编码后原样读回', operation => {
    for (const outcome of outcomes[operation]) {
      const model = response(outcome, bodyOf(operation, outcome))
      const encoded = encodeHitlResponse({
        operation,
        response: model,
        limits,
      } as HitlResponseEncodeInput)
      expect(encoded.kind, outcome).toBe('encoded')
      if (encoded.kind !== 'encoded') continue
      expect(read(operation, JSON.parse(new TextDecoder().decode(encoded.bytes)))).toEqual({
        kind: 'response',
        response: model,
      })
    }
  })

  it('共同拒绝重载只编码 protocol-rejected 与 stage-not-provided', () => {
    for (const outcome of ['protocol-rejected', 'stage-not-provided'] as const)
      expect(
        encodeHitlResponse({ response: response(outcome, {}, null) as never, limits }).kind,
      ).toBe('encoded')
    expect(encodeHitlResponse({ response: response('denied', {}) as never, limits }).kind).toBe(
      'invalid',
    )
  })

  it('卡片视图带路由字段时编码失败', () => {
    const item = { ...pendingItem, origin: { ...pendingItem.origin, wait: 'w' } }
    expect(
      encodeHitlResponse({
        operation: 'read-card',
        response: response('succeeded', { item }),
        limits,
      } as HitlResponseEncodeInput).kind,
    ).toBe('invalid')
  })

  it('会话一组的共同拒绝重载仍不编码 stage-not-provided', () => {
    expect(
      encodeSessionResponse({
        response: { protocolVersion: 'session-public/1', outcome: 'stage-not-provided', body: {} },
        limits,
      } as never).kind,
    ).toBe('invalid')
  })
})

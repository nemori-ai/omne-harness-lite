// HITL 位置（SPEC「HITL 位置」）：经真实 HTTP，用 HITL 入口面替身、入口主体持有者替身与 identity
// 参考替身，核对判断次序、入口主体、卡片视图、denied 的逐字节一致与依赖故障的分类。
import { standingPrincipalRef, type IdentityOperations } from '@omne-harness/identity'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createServerEntry,
  ServerEntryConfigError,
  type ServerEntryDependencies,
} from '../src/index.ts'
import {
  HITL_LOCATION,
  HITL_PATH,
  createEntryPrincipalsDouble,
  createHitlDouble,
  type EntryPrincipalsDouble,
  type HitlDouble,
} from './support/hitl-double.ts'
import {
  SESSION_PATH,
  anotherLogin,
  baseConfig,
  identityDouble,
  login,
  message,
  resolveDefinition,
  send,
  sessionMessage,
  startFixture,
  type Fixture,
  type HttpReply,
  type Login,
} from './support/harness.ts'
import { createHash } from 'node:crypto'
import { createSessionDouble } from './support/session-double.ts'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'

const SESSION_REF = 'c'.repeat(64)

let fixture: Fixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

type Setup = Readonly<{
  fixture: Fixture
  hitl: HitlDouble
  holder: EntryPrincipalsDouble
  recognitions: string[]
}>

async function start(
  options: Readonly<{ faces?: boolean; holder?: boolean }> = {},
): Promise<Setup> {
  const hitl = createHitlDouble()
  const holder = createEntryPrincipalsDouble()
  const recognitions: string[] = []
  const dependencies: Partial<ServerEntryDependencies> = {
    ...(options.faces === false ? {} : { hitl: hitl.faces }),
    ...(options.holder === false ? {} : { hitlEntryPrincipals: holder.holder }),
  }
  fixture = await startFixture({
    config: { hitlLocationRef: HITL_LOCATION },
    identity: base => ({
      registerAndActivate: input => base.registerAndActivate(input),
      issueLogin: input => base.issueLogin(input),
      recognizeLogin: input => {
        recognitions.push(input.loginProof)
        return base.recognizeLogin(input)
      },
    }),
    dependencies,
  })
  return { fixture, hitl, holder, recognitions }
}

function hitlMessage(
  operation: string,
  body: unknown,
  extra: Readonly<Record<string, unknown>> = {},
  messageId = 'm-1',
): string {
  return message({ protocolVersion: 'hitl-public/1', messageId, operation, body, ...extra })
}

function listCards(
  who: Pick<Login, 'loginProof'>,
  tenantText: string,
  filter: object = { states: ['pending'] },
  messageId = 'm-1',
): string {
  return hitlMessage(
    'list-cards',
    { tenant: tenantText, filter, cursor: null, limit: 20 },
    { loginProof: who.loginProof },
    messageId,
  )
}

function readCard(
  proof: Readonly<Record<string, unknown>>,
  tenantText: string,
  card: unknown,
  messageId = 'm-1',
): string {
  return hitlMessage('read-card', { tenant: tenantText, card }, proof, messageId)
}

const submission = (who: Login) => ({
  tenant: who.tenantText,
  card: { request: { tenantRef: who.tenantText, requestId: 'r' }, cardId: 'c' },
  expectedRevision: '0',
  reply: { kind: 'decline' },
  replyId: 'reply-1',
})

function post(body: string, path = HITL_PATH): Promise<HttpReply> {
  return send(fixture!.port, path, { body })
}

function outcomeOf(reply: HttpReply): string {
  return (reply.json as { outcome: string }).outcome
}

describe('入口主体与两个入口', () => {
  it('同一租户的两份登录得到同一个入口主体，经会话入口与待办池列出同一张卡并读出它', async () => {
    const { hitl, holder } = await start()
    const alice = await login(fixture!, 'alice')
    const again = await anotherLogin(fixture!, alice)
    const entryRef = holder.refOf(alice.tenant)
    const item = hitl.addCard({
      tenant: alice.tenant,
      cardId: 'card-1',
      sessionRef: SESSION_REF,
      readers: [entryRef],
    })

    const pool = await post(listCards(alice, alice.tenantText))
    const bySession = await post(
      listCards(again, alice.tenantText, { states: ['pending'], sessionRef: SESSION_REF }),
    )
    const card = await post(
      readCard({ loginProof: again.loginProof }, alice.tenantText, item.card.ref),
    )

    expect([pool.status, bySession.status, card.status]).toEqual([200, 200, 200])
    const poolItems = (pool.json as { body: { items: unknown[] } }).body.items
    const sessionItems = (bySession.json as { body: { items: unknown[] } }).body.items
    expect(poolItems).toHaveLength(1)
    expect(sessionItems).toEqual(poolItems)
    expect((card.json as { body: { item: unknown } }).body.item).toEqual(poolItems[0])

    const principals = hitl.calls.map(call => standingPrincipalRef(call.principal))
    expect(new Set(principals)).toEqual(new Set([entryRef]))
    // 持有者只拿到账号与目标租户，不拿到登录。
    expect(holder.inputs).toEqual([
      ['account', 'tenant'],
      ['account', 'tenant'],
      ['account', 'tenant'],
    ])
  })

  it('两个租户的入口主体引用不同，各自只看到自己的卡', async () => {
    const { hitl, holder } = await start()
    const alice = await login(fixture!, 'alice')
    const bob = await login(fixture!, 'bob')
    expect(holder.refOf(alice.tenant)).not.toBe(holder.refOf(bob.tenant))
    hitl.addCard({ tenant: alice.tenant, cardId: 'a', readers: [holder.refOf(alice.tenant)] })
    hitl.addCard({ tenant: bob.tenant, cardId: 'b', readers: [holder.refOf(bob.tenant)] })
    const bobs = await post(listCards(bob, bob.tenantText))
    const items = (bobs.json as { body: { items: { card: { ref: { cardId: string } } }[] } }).body
      .items
    expect(items.map(entry => entry.card.ref.cardId)).toEqual(['b'])
  })

  it('两个入口调用同一个 listPool，位置引用来自配置，过滤条件原样交给 HITL', async () => {
    const { hitl } = await start()
    const alice = await login(fixture!, 'alice')
    const filter = { states: ['pending', 'decided'], sessionRef: SESSION_REF, originKind: 'tool' }
    await post(listCards(alice, alice.tenantText))
    await post(listCards(alice, alice.tenantText, filter))
    expect(hitl.calls.map(call => call.method)).toEqual(['listPool', 'listPool'])
    expect(hitl.calls.map(call => call.input)).toEqual([
      {
        protocol: 'hitl/1',
        tenantRef: alice.tenantText,
        locationRef: HITL_LOCATION,
        filter: { states: ['pending'] },
        limit: 20,
      },
      {
        protocol: 'hitl/1',
        tenantRef: alice.tenantText,
        locationRef: HITL_LOCATION,
        filter,
        limit: 20,
      },
    ])
  })

  it('续页的 cursor 原样交给 HITL', async () => {
    const { hitl } = await start()
    const alice = await login(fixture!, 'alice')
    await post(
      hitlMessage(
        'list-cards',
        { tenant: alice.tenantText, filter: { states: ['pending'] }, cursor: 'page-2', limit: 5 },
        { loginProof: alice.loginProof },
      ),
    )
    expect(hitl.calls[0]?.input).toMatchObject({ cursor: 'page-2', limit: 5 })
  })

  it('客户端在 body 写位置引用是 protocol-rejected，HITL 不被调用', async () => {
    const { hitl, recognitions } = await start()
    const alice = await login(fixture!, 'alice')
    const reply = await post(
      hitlMessage(
        'list-cards',
        {
          tenant: alice.tenantText,
          filter: { states: ['pending'] },
          cursor: null,
          limit: 20,
          locationRef: 'other',
        },
        { loginProof: alice.loginProof },
      ),
    )
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({
      protocolVersion: 'hitl-public/1',
      messageId: 'm-1',
      outcome: 'protocol-rejected',
      body: {},
    })
    expect(hitl.calls).toEqual([])
    expect(recognitions).toEqual([])
  })
})

describe('卡片视图', () => {
  it('origin 只有来源种类与会话、Run、Tool 调用的引用，路由字段不出现在响应里', async () => {
    const { hitl, holder } = await start()
    const alice = await login(fixture!, 'alice')
    const item = hitl.addCard({
      tenant: alice.tenant,
      cardId: 'card-1',
      sessionRef: SESSION_REF,
      readers: [holder.refOf(alice.tenant)],
    })
    const reply = await post(
      readCard({ loginProof: alice.loginProof }, alice.tenantText, item.card.ref),
    )
    expect(reply.status).toBe(200)
    const view = (reply.json as { body: { item: { origin: unknown; card: unknown } } }).body.item
    expect(view.origin).toEqual({
      kind: 'tool',
      sessionRef: SESSION_REF,
      runRef: 'run-1',
      toolCallRef: 'call-1',
    })
    expect(view.card).toEqual(JSON.parse(JSON.stringify(item.card)))
    for (const secret of ['origin-secret', 'dest-secret', 'position-secret', 'adoption-secret'])
      expect(reply.text).not.toContain(secret)
  })
})

describe('denied 不披露', () => {
  it('他租户、无效登录、不存在的卡与 HITL 的资格拒绝，响应除 messageId 外逐字节相同', async () => {
    const { hitl, holder } = await start()
    const alice = await login(fixture!, 'alice')
    const bob = await login(fixture!, 'bob')
    const item = hitl.addCard({
      tenant: alice.tenant,
      cardId: 'card-1',
      readers: [holder.refOf(alice.tenant)],
    })
    const ref = item.card.ref
    const replies = {
      // 目标租户的账号不是识别出的账号：不调用持有者。
      otherTenantTarget: await post(
        readCard({ loginProof: bob.loginProof }, alice.tenantText, ref, 'm-a'),
      ),
      // 以自己的租户读别人的卡：HITL 拒绝。
      otherTenantCard: await post(
        readCard({ loginProof: bob.loginProof }, bob.tenantText, ref, 'm-b'),
      ),
      invalidLogin: await post(readCard({ loginProof: 'forged' }, alice.tenantText, ref, 'm-c')),
      missingLogin: await post(readCard({}, alice.tenantText, ref, 'm-d')),
      emptyLogin: await post(readCard({ loginProof: '' }, alice.tenantText, ref, 'm-e')),
      missingCard: await post(
        readCard(
          { loginProof: alice.loginProof },
          alice.tenantText,
          { ...ref, cardId: 'none' },
          'm-f',
        ),
      ),
    }
    hitl.addCard({ tenant: alice.tenant, cardId: 'card-2', readers: ['someone-else'] })
    const notReader = await post(
      readCard(
        { loginProof: alice.loginProof },
        alice.tenantText,
        { ...ref, request: { ...ref.request, requestId: 'request-card-2' }, cardId: 'card-2' },
        'm-g',
      ),
    )
    const all = [...Object.values(replies), notReader]
    const first = all[0]!
    const normalized = (reply: HttpReply) => reply.text.replace(/"messageId":"m-[a-g]"/, '')
    for (const reply of all) {
      expect(reply.status).toBe(403)
      expect(normalized(reply)).toBe(normalized(first))
      expect(reply.body.byteLength).toBe(first.body.byteLength)
      const { date: _, ...headers } = reply.headers
      const { date: __, ...firstHeaders } = first.headers
      expect(headers).toEqual(firstHeaders)
    }
    expect(first.json).toEqual({
      protocolVersion: 'hitl-public/1',
      messageId: 'm-a',
      outcome: 'denied',
      body: {},
    })
  })
})

describe('部署声明不提供的操作', () => {
  it('装配没有给入口面时四个操作都答 stage-not-provided，不识别登录', async () => {
    const { recognitions } = await start({ faces: false })
    const alice = await login(fixture!, 'alice')
    const card = { request: { tenantRef: alice.tenantText, requestId: 'r' }, cardId: 'c' }
    const replies = [
      await post(listCards(alice, alice.tenantText)),
      await post(readCard({ loginProof: alice.loginProof }, alice.tenantText, card)),
      await post(hitlMessage('submit-reply', submission(alice), { loginProof: alice.loginProof })),
      await post(
        hitlMessage('query-submit-reply', submission(alice), { loginProof: alice.loginProof }),
      ),
    ]
    for (const reply of replies) {
      expect(reply.status).toBe(501)
      expect(reply.json).toEqual({
        protocolVersion: 'hitl-public/1',
        messageId: 'm-1',
        outcome: 'stage-not-provided',
        body: {},
      })
    }
    expect(recognitions).toEqual([])
  })

  it('坏的 submit-reply 仍是 protocol-rejected，不是 stage-not-provided', async () => {
    await start()
    const alice = await login(fixture!, 'alice')
    const reply = await post(
      hitlMessage(
        'submit-reply',
        { ...submission(alice), operationId: 'forged' },
        { loginProof: alice.loginProof },
      ),
    )
    expect(reply.status).toBe(400)
    expect(outcomeOf(reply)).toBe('protocol-rejected')
  })
})

/** SPEC「HITL 提交身份的派生规则」第 4 条，在测试里独立写一遍。 */
const replyIdentity = (tenantText: string, replyId: string) =>
  createHash('sha256')
    .update(JSON.stringify(['hitl-public/1-reply', tenantText, replyId]))
    .digest('hex')

describe('答复的提交与认回', () => {
  async function withCard() {
    const setup = await start()
    const alice = await login(fixture!, 'alice')
    const entryRef = setup.holder.refOf(alice.tenant)
    const item = setup.hitl.addCard({ tenant: alice.tenant, cardId: 'c1', readers: [entryRef] })
    const answer = (
      operation: 'submit-reply' | 'query-submit-reply',
      who: Pick<Login, 'loginProof'>,
      overrides: Readonly<Record<string, unknown>> = {},
      messageId = 'm-1',
    ) =>
      post(
        hitlMessage(
          operation,
          {
            tenant: alice.tenantText,
            card: item.card.ref,
            expectedRevision: '0',
            reply: { kind: 'selection', optionId: 'yes' },
            replyId: 'reply-1',
            ...overrides,
          },
          { loginProof: who.loginProof },
          messageId,
        ),
      )
    return { ...setup, alice, entryRef, item, answer }
  }

  it('以入口主体与派生的提交身份交给 submitReply，decided 是 succeeded', async () => {
    const { hitl, alice, entryRef, item, answer } = await withCard()
    const reply = await answer('submit-reply', alice)
    expect(reply.status).toBe(200)
    expect(reply.json).toMatchObject({
      outcome: 'succeeded',
      body: {
        kind: 'decided',
        revision: '1',
        delivery: 'pending',
        decisionRef: { card: item.card.ref },
      },
    })
    const submitted = hitl.calls.find(call => call.method === 'submitReply')
    expect(standingPrincipalRef(submitted!.principal)).toBe(entryRef)
    expect(submitted!.input).toEqual({
      protocol: 'hitl/1',
      operation: {
        tenantRef: alice.tenantText,
        actorRef: entryRef,
        operationId: replyIdentity(alice.tenantText, 'reply-1'),
      },
      cardRef: item.card.ref,
      expectedRevision: '0',
      reply: { kind: 'selection', optionId: 'yes' },
    })
  })

  it('换一份登录、换 messageId 原样再送，认回同一次提交与原结果', async () => {
    const { hitl, alice, answer } = await withCard()
    const first = await answer('submit-reply', alice)
    const again = await anotherLogin(fixture!, alice)
    const second = await answer('submit-reply', again, {}, 'm-2')
    expect(second.status).toBe(200)
    expect((second.json as { body: unknown }).body).toEqual((first.json as { body: unknown }).body)
    const operations = hitl.calls
      .filter(call => call.method === 'submitReply')
      .map(call => (call.input as { operation: unknown }).operation)
    expect(operations).toHaveLength(2)
    expect(operations[1]).toEqual(operations[0])
  })

  it('同一 replyId 换了内容是 conflict；新的 replyId 遇到已决定的卡是 already-decided', async () => {
    const { alice, answer } = await withCard()
    await answer('submit-reply', alice)
    const changed = await answer('submit-reply', alice, { reply: { kind: 'decline' } })
    expect(changed.status).toBe(409)
    expect(changed.json).toMatchObject({ outcome: 'conflict', body: {} })
    const other = await answer('submit-reply', alice, { replyId: 'reply-2' })
    expect(other.status).toBe(200)
    expect(other.json).toMatchObject({
      outcome: 'succeeded',
      body: {
        kind: 'already-decided',
        decision: { reply: { kind: 'selection', optionId: 'yes' } },
      },
    })
  })

  it('query-submit-reply 经 bindSubmitReply 组成同一条命令，认回原结果；没有成立的提交是 not-committed', async () => {
    const { hitl, alice, answer } = await withCard()
    const before = await answer('query-submit-reply', alice)
    expect(before.status).toBe(200)
    expect(before.json).toMatchObject({ outcome: 'not-committed', body: {} })
    const submitted = await answer('submit-reply', alice)
    const queried = await answer('query-submit-reply', alice)
    expect(queried.status).toBe(200)
    expect((queried.json as { body: unknown }).body).toEqual(
      (submitted.json as { body: unknown }).body,
    )
    const bound = hitl.calls.filter(call => call.method === 'bindSubmitReply')
    const sent = hitl.calls.find(call => call.method === 'submitReply')
    expect(bound.at(-1)?.input).toEqual(sent?.input)
    // 同一 replyId 换了内容：HITL 的摘要不同，查询也是 conflict。
    const changed = await answer('query-submit-reply', alice, { reply: { kind: 'decline' } })
    expect(changed.status).toBe(409)
    expect(changed.json).toMatchObject({ outcome: 'conflict', body: {} })
  })

  it.each([
    [{ kind: 'invalid-input', reason: 'unknown-option' }, 422, 'invalid', {}],
    [{ kind: 'denied', reason: 'card' }, 403, 'denied', {}],
    [{ kind: 'conflict', reason: 'revision-changed' }, 409, 'conflict', {}],
    [{ kind: 'unavailable', reason: 'wait-unavailable' }, 503, 'basis-unavailable', {}],
    [{ kind: 'unknown' }, 500, 'unknown', {}],
  ] as const)('submitReply 答 %o 时是状态 %i 与 %s', async (failure, status, outcome, body) => {
    const { hitl, alice, answer } = await withCard()
    hitl.failNext('submitReply', failure)
    const reply = await answer('submit-reply', alice)
    expect(reply.status).toBe(status)
    expect(reply.json).toEqual({
      protocolVersion: 'hitl-public/1',
      messageId: 'm-1',
      outcome,
      body,
    })
  })

  it('submitReply 抛出时是带响应体的 unknown，不是 basis-unavailable', async () => {
    const { hitl, alice, answer } = await withCard()
    hitl.failNext('submitReply', 'throw')
    const reply = await answer('submit-reply', alice)
    expect(reply.status).toBe(500)
    expect(reply.json).toEqual({
      protocolVersion: 'hitl-public/1',
      messageId: 'm-1',
      outcome: 'unknown',
      body: {},
    })
  })

  it.each(['getOperation', 'bindSubmitReply'] as const)(
    '%s 抛出时 query-submit-reply 是 basis-unavailable，并记诊断 hitl.read-fault',
    async method => {
      const { hitl, alice, answer } = await withCard()
      hitl.failNext(method, 'throw')
      const reply = await answer('query-submit-reply', alice)
      expect(reply.status).toBe(503)
      expect(outcomeOf(reply)).toBe('basis-unavailable')
      expect(fixture!.diagnostics).toContainEqual({
        code: 'hitl.read-fault',
        operation: 'getOperation',
      })
    },
  )

  it('getOperation 答 unknown 时 query-submit-reply 是 unknown', async () => {
    const { hitl, alice, answer } = await withCard()
    hitl.failNext('getOperation', { kind: 'unknown' })
    const reply = await answer('query-submit-reply', alice)
    expect(reply.status).toBe(500)
    expect(reply.json).toMatchObject({ outcome: 'unknown', body: {} })
  })
})

describe('跨位置', () => {
  it('HITL 路径收到会话消息、会话路径收到 HITL 消息，都是各自位置的 protocol-rejected', async () => {
    await start()
    const alice = await login(fixture!, 'alice')
    const onHitl = await post(
      sessionMessage(
        'query-send-input',
        { tenant: alice.tenantText, session: SESSION_REF, acceptId: 'a' },
        { loginProof: alice.loginProof },
      ),
    )
    const onSession = await post(listCards(alice, alice.tenantText), SESSION_PATH)
    expect(onHitl.status).toBe(400)
    expect((onHitl.json as { protocolVersion: string }).protocolVersion).toBe('hitl-public/1')
    expect(onSession.status).toBe(400)
    expect((onSession.json as { protocolVersion: string }).protocolVersion).toBe('session-public/1')
  })
})

describe('HITL 结果与依赖故障', () => {
  it.each([
    [{ kind: 'invalid-input', reason: 'cursor' }, 422, 'invalid', {}],
    [
      { kind: 'limited', resource: 'pool-items', limit: 7 },
      429,
      'limited',
      { resource: 'pool-items', limit: 7 },
    ],
    [{ kind: 'conflict', reason: 'snapshot' }, 409, 'conflict', {}],
    [{ kind: 'unavailable', reason: 'store' }, 503, 'basis-unavailable', {}],
    [{ kind: 'denied', reason: 'pool-location' }, 403, 'denied', {}],
  ] as const)('listPool 答 %o 时是状态 %i 与 %s', async (failure, status, outcome, body) => {
    const { hitl } = await start()
    const alice = await login(fixture!, 'alice')
    hitl.failNext('listPool', failure)
    const reply = await post(listCards(alice, alice.tenantText))
    expect(reply.status).toBe(status)
    expect(reply.json).toEqual({
      protocolVersion: 'hitl-public/1',
      messageId: 'm-1',
      outcome,
      body,
    })
    // HITL 给出了答复，不是读取故障。
    expect(fixture!.diagnostics.map(event => event.code)).not.toContain('hitl.read-fault')
  })

  it.each(['listPool', 'getCard'] as const)(
    '%s 抛出时是状态 503 与 basis-unavailable，并记诊断 hitl.read-fault',
    async method => {
      const { hitl } = await start()
      const alice = await login(fixture!, 'alice')
      hitl.failNext(method, 'throw')
      const card = { request: { tenantRef: alice.tenantText, requestId: 'r' }, cardId: 'c' }
      const reply =
        method === 'listPool'
          ? await post(listCards(alice, alice.tenantText))
          : await post(readCard({ loginProof: alice.loginProof }, alice.tenantText, card))
      expect(reply.status).toBe(503)
      expect(outcomeOf(reply)).toBe('basis-unavailable')
      expect(fixture!.diagnostics).toContainEqual({ code: 'hitl.read-fault', operation: method })
    },
  )

  it.each(['refuse', 'throw', 'other-tenant'] as const)(
    '持有者 %s 时是 basis-unavailable，HITL 不被调用',
    async behaviour => {
      const { hitl, holder } = await start()
      const alice = await login(fixture!, 'alice')
      const bob = await login(fixture!, 'bob')
      holder.next(behaviour, bob.tenant)
      const reply = await post(listCards(alice, alice.tenantText))
      expect(reply.status).toBe(503)
      expect(outcomeOf(reply)).toBe('basis-unavailable')
      expect(hitl.calls).toEqual([])
      expect(fixture!.diagnostics).toContainEqual({
        code: 'issuer.fault',
        operation: 'hitlEntryPrincipals',
      })
    },
  )

  it('持有者缺席时是 basis-unavailable', async () => {
    const { hitl } = await start({ holder: false })
    const alice = await login(fixture!, 'alice')
    const reply = await post(listCards(alice, alice.tenantText))
    expect(reply.status).toBe(503)
    expect(outcomeOf(reply)).toBe('basis-unavailable')
    expect(hitl.calls).toEqual([])
  })

  it('目标租户的账号不等于识别出的账号时不调用持有者', async () => {
    const { holder } = await start()
    const alice = await login(fixture!, 'alice')
    const bob = await login(fixture!, 'bob')
    const reply = await post(listCards(bob, alice.tenantText))
    expect(outcomeOf(reply)).toBe('denied')
    expect(holder.inputs).toEqual([])
  })
})

describe('配置', () => {
  it('给了 HITL 入口面却没有 hitlLocationRef 时构造失败', () => {
    const double = identityDouble()
    const authority = inProcessPrincipalAuthority()
    const identity: IdentityOperations = double.operations
    expect(() =>
      createServerEntry({
        config: baseConfig(),
        dependencies: {
          identity,
          governance: double.governance,
          issuer: authority.issuer,
          session: createSessionDouble({ members: new Map() }).faces,
          resolveDefinition,
          hitl: createHitlDouble().faces,
        },
      }),
    ).toThrow(ServerEntryConfigError)
  })

  it('hitlLocationRef 为空字符串时构造失败', () => {
    const double = identityDouble()
    expect(() =>
      createServerEntry({
        config: baseConfig({ hitlLocationRef: '' }),
        dependencies: {
          identity: double.operations,
          governance: double.governance,
          issuer: inProcessPrincipalAuthority().issuer,
          session: createSessionDouble({ members: new Map() }).faces,
          resolveDefinition,
        },
      }),
    ).toThrow(ServerEntryConfigError)
  })
})

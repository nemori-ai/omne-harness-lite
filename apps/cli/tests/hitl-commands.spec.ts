import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  commandMissing,
  commandUnrecognized,
  notLoggedIn,
  resultUncertain,
  commandRefused,
} from './support/expected.ts'
import {
  defaultAnswer,
  issuedProof,
  otherTenantText,
  sessionId,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess } from './support/in-process.ts'

let root: string
let state: string
const services: FakeService[] = []

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-hitl-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const page = { items: [], next: null, snapshotRef: 'snapshot-1', completeness: 'complete' }

async function serve(answer?: (seen: Seen) => Answer | undefined): Promise<FakeService> {
  const service = await startFakeService(seen => {
    const given = answer?.(seen)
    if (given !== undefined) return given
    if (seen.operation === 'list-cards') return { outcome: 'succeeded', body: page }
    return defaultAnswer(seen)
  })
  services.push(service)
  return service
}

function cli(argv: readonly string[]) {
  return runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home') })
}

async function loggedIn(answer?: (seen: Seen) => Answer | undefined): Promise<FakeService> {
  const service = await serve(answer)
  expect(
    (await cli(['login', '--login-identifier', 'alice', '--server', service.origin])).code,
  ).toBe(0)
  return service
}

const hitlSeen = (service: FakeService) =>
  service.seen.filter(seen => seen.path.startsWith('/api/human-intervention/v1/'))
const card = (tenant: string) => ({
  request: { tenantRef: tenant, requestId: 'r-1' },
  cardId: 'q1',
})
const ref = ['--request', 'r-1', '--card', 'q1']

describe('list-cards', () => {
  it('without --session lists the pool of the login tenant, with --session the session entry', async () => {
    const service = await loggedIn()
    const pool = await cli(['list-cards'])
    const bySession = await cli([
      'list-cards',
      '--session',
      sessionId,
      '--state',
      'decided',
      '--limit',
      '5',
      '--cursor',
      'next-1',
    ])
    expect([pool.code, bySession.code]).toEqual([0, 0])
    const [first, second] = hitlSeen(service)
    expect(first?.path).toBe('/api/human-intervention/v1/list-cards')
    expect(first?.headers['authorization']).toBe(`Bearer ${issuedProof}`)
    expect(first?.headers['omne-acting-tenant']).toBeUndefined()
    expect(first?.body).toEqual({
      tenant: tenantText,
      filter: { states: ['pending'] },
      cursor: null,
      limit: 100,
    })
    expect(second?.body).toEqual({
      tenant: tenantText,
      filter: { states: ['decided'], sessionRef: sessionId },
      cursor: 'next-1',
      limit: 5,
    })
    expect(JSON.parse(pool.stdout)).toEqual({
      result: 'response',
      outcome: 'succeeded',
      body: page,
      request: { messageId: first?.messageId, tenant: tenantText },
    })
  })

  it.each([
    [
      '--state',
      'answered',
      'filter.states[0] is "answered"; allows one of "pending", "decided", "invalidated"',
    ],
    ['--limit', '0', 'limit is 0; allows a whole number from 1 to 100'],
    ['--limit', '101', 'limit is 101; allows a whole number from 1 to 100'],
    ['--limit', '07', undefined],
    ['--tenant', 'not-a-tenant', undefined],
  ])('%s %s is a usage error that sends nothing', async (option, value, reason) => {
    const service = await loggedIn()
    const result = await cli(['list-cards', option, value])
    expect(result.code).toBe(2)
    expect(result.stderr).toBe(
      reason === undefined
        ? commandUnrecognized('list-cards')
        : commandRefused('list-cards', reason),
    )
    expect(hitlSeen(service)).toEqual([])
  })
})

describe('read-card', () => {
  it('builds the card reference from the tenant, --request and --card', async () => {
    const service = await loggedIn()
    const result = await cli(['read-card', ...ref, '--tenant', otherTenantText])
    expect(result.code).toBe(3)
    expect(hitlSeen(service)[0]?.path).toBe('/api/human-intervention/v1/read-card')
    expect(hitlSeen(service)[0]?.body).toEqual({
      tenant: otherTenantText,
      card: card(otherTenantText),
    })
    expect(JSON.parse(result.stdout).request).toEqual({
      messageId: hitlSeen(service)[0]?.messageId,
      tenant: otherTenantText,
    })
  })
})

describe('a release card on the human channel', () => {
  const option = (label: string, description: string, offered = true) => ({
    id: label,
    label,
    description,
    offered,
    lasting: false,
  })
  const release = (detail?: object) => ({
    cardId: 'q1',
    kind: 'release',
    title: '要执行 Notifications send，放行吗？',
    description: '下面是 agent 要执行的这一次调用。',
    declineConsequence: '这一次调用不执行。',
    target: { tool: 'Notifications', command: 'send', preview: '' },
    arguments: { text: '{"title":"T"}', truncated: false, digest: 'd' },
    origin: { session: 'ses-1', agent: 'exe-1' },
    gateTitle: '发送',
    ...(detail === undefined ? {} : { detail }),
    options: [
      option('本次不放行', '这一次调用不执行'),
      option('本次放行', '只执行这一次调用，参数不变'),
      option('本会话放行', '这个会话里「Notifications：发送」不再问你'),
      option('始终放行', '把「Notifications：发送」设成自动', false),
      option('始终禁止', '把「Notifications：发送」设成禁止', false),
    ],
  })
  const item = (question: object) => ({
    card: {
      ref: { request: { tenantRef: tenantText, requestId: 'r-1' }, cardId: 'q1' },
      revision: '1',
      kind: 'pending',
      question,
    },
    origin: { kind: 'admission', sessionRef: sessionId, toolCallRef: 'call-1' },
    displayContext: 'an action in a session',
  })
  const given = {
    state: 'given',
    rows: [
      { label: '收件人', value: '你' },
      { label: '标签', value: ['a', 'b'] },
    ],
    typed: { kind: 'test.release@1', value: '{"title":"T"}' },
  }
  const reading = (question: object) => async () => {
    await loggedIn(seen =>
      seen.operation === 'read-card'
        ? { outcome: 'succeeded', body: { item: item(question) } }
        : undefined,
    )
    return cli(['read-card', ...ref])
  }

  it('says when a program made the action, in one line after the gate', async () => {
    const made = { ...release(), origin: { session: 'ses-1', agent: 'exe-1', program: true } }
    const result = await reading(made)()
    expect(result.code).toBe(0)
    expect(result.stderr.split('\n').slice(0, 3)).toEqual([
      '放行卡：Notifications send',
      '关口：发送',
      '来源：由程序发起',
    ])
    expect((await reading(release())()).stderr).not.toContain('来源')
  })

  it('prints the call, its gate, what each option covers and the rows, and leaves the result as it was', async () => {
    const result = await reading(release(given))()
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).body.item.card.question.detail).toEqual(given)
    expect(result.stderr).toBe(
      [
        '放行卡：Notifications send',
        '关口：发送',
        '  本次不放行：这一次调用不执行',
        '  本次放行：只执行这一次调用，参数不变',
        '  本会话放行：这个会话里「Notifications：发送」不再问你',
        '  始终放行：把「Notifications：发送」设成自动（现在不能选）',
        '  始终禁止：把「Notifications：发送」设成禁止（现在不能选）',
        '详情：',
        '  收件人：你',
        '  标签：a、b',
        '',
      ].join('\n'),
    )
  })

  it('says the tool could not give a detail, and prints no detail when the card has none', async () => {
    const unavailable = await reading(release({ state: 'unavailable' }))()
    expect(unavailable.stderr).toContain('工具没能给出这次调用的详情\n')
    expect(unavailable.stderr).not.toContain('详情：')
    const none = await reading(release())()
    expect(none.stderr).not.toContain('详情')
  })

  it('names a call of a function tool by the tool alone', async () => {
    const card = { ...release(), target: { tool: 'read_file', command: null, preview: '' } }
    const result = await reading(card)()
    expect(result.stderr.split('\n')[0]).toBe('放行卡：read_file')
  })

  it('prints every release card of a listed page, and nothing for a card of another kind', async () => {
    const question = {
      cardId: 'q2',
      kind: 'question',
      title: 'Which port?',
      description: 'Pick one',
      declineConsequence: 'The agent picks',
      options: [{ id: 'a', label: '8080', description: 'the default' }],
    }
    await loggedIn(seen =>
      seen.operation === 'list-cards'
        ? {
            outcome: 'succeeded',
            body: { ...page, items: [item(release(given)), item(question)] },
          }
        : undefined,
    )
    const listed = await cli(['list-cards'])
    expect(listed.code).toBe(0)
    expect(listed.stderr.match(/^放行卡：/gmu)).toHaveLength(1)
    expect(listed.stderr).toContain('  标签：a、b\n')
  })
})

describe('submit-reply', () => {
  const invalidated = (seen: Seen): Answer | undefined =>
    seen.operation === 'submit-reply'
      ? { outcome: 'succeeded', body: { kind: 'invalidated', reason: 'cancelled' } }
      : undefined

  it.each([
    [['--option', 'o2'], { kind: 'selection', optionId: 'o2' }],
    [['--text', 'my own words'], { kind: 'text', text: 'my own words' }],
    [['--decline'], { kind: 'decline' }],
  ] as const)('%j sends the reply %j', async (given, reply) => {
    const service = await loggedIn(invalidated)
    const result = await cli(['submit-reply', ...ref, '--revision', '3', ...given])
    expect(result.code).toBe(0)
    const sent = hitlSeen(service)[0]
    expect(sent?.path).toBe('/api/human-intervention/v1/submit-reply')
    expect(sent?.headers['authorization']).toBe(`Bearer ${issuedProof}`)
    const body = sent?.body as Record<string, unknown>
    expect(body).toEqual({
      tenant: tenantText,
      card: card(tenantText),
      expectedRevision: '3',
      reply,
      replyId: body['replyId'],
    })
    expect(JSON.parse(result.stdout).request).toEqual({
      messageId: sent?.messageId,
      replyId: body['replyId'],
      tenant: tenantText,
    })
    expect(body['replyId']).not.toBe(sent?.messageId)
  })

  it('--reply-id is sent as given', async () => {
    const service = await loggedIn(invalidated)
    await cli(['submit-reply', ...ref, '--revision', '0', '--decline', '--reply-id', 'reply-7'])
    expect(hitlSeen(service)[0]?.body['replyId']).toBe('reply-7')
  })

  it.each([
    [[]],
    [['--option', 'o1', '--text', 'words']],
    [['--option', 'o1', '--decline']],
    [['--decline', '--decline']],
  ])('%j is not exactly one reply: a usage error that sends nothing', async given => {
    const service = await loggedIn(invalidated)
    const result = await cli(['submit-reply', ...ref, '--revision', '0', ...given])
    expect(result.code).toBe(2)
    expect(result.stderr).toBe(commandUnrecognized('submit-reply'))
    expect(hitlSeen(service)).toEqual([])
  })

  it('a revision that is not decimal text is a usage error', async () => {
    const service = await loggedIn(invalidated)
    const result = await cli(['submit-reply', ...ref, '--revision', '01', '--decline'])
    expect(result.code).toBe(2)
    expect(hitlSeen(service)).toEqual([])
  })

  it.each([
    ['conflict', 3],
    ['basis-unavailable', 4],
    ['unknown', 5],
  ] as const)('the outcome %s exits %i', async (outcome, code) => {
    await loggedIn(seen => (seen.operation === 'submit-reply' ? { outcome, body: {} } : undefined))
    const result = await cli(['submit-reply', ...ref, '--revision', '0', '--decline'])
    expect(result.code).toBe(code)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'response', outcome })
    expect(result.stderr).toBe(code === 5 ? resultUncertain('submit-reply') : '')
  })
})

describe('what every HITL command needs', () => {
  it.each([
    ['read-card', ['--request', 'r-1'], '--card'],
    ['read-card', ['--card', 'q1'], '--request'],
    ['submit-reply', ['--request', 'r-1', '--card', 'q1', '--decline'], '--revision'],
    ['submit-reply', ['--card', 'q1', '--revision', '0', '--decline'], '--request'],
  ])('%s %j names the missing %s and sends nothing', async (command, given, option) => {
    const service = await loggedIn()
    const result = await cli([command, ...given])
    expect(result).toMatchObject({ code: 2, stdout: '', stderr: commandMissing(command, option) })
    expect(hitlSeen(service)).toEqual([])
  })

  it.each([
    ['list-cards', []],
    ['read-card', ref],
    ['submit-reply', [...ref, '--revision', '0', '--decline']],
  ])('%s without a login exits 1 and sends nothing', async (command, given) => {
    const service = await serve()
    const result = await cli([command, ...given])
    expect(result).toMatchObject({ code: 1, stdout: '', stderr: notLoggedIn })
    expect(hitlSeen(service)).toEqual([])
  })

  it.each([
    ['list-cards', []],
    ['submit-reply', [...ref, '--revision', '0', '--decline']],
  ])('%s --tenant names another tenant of the login', async (command, given) => {
    const service = await loggedIn()
    await cli([command, ...given, '--tenant', otherTenantText])
    expect(hitlSeen(service)[0]?.body).toMatchObject({ tenant: otherTenantText })
  })
})

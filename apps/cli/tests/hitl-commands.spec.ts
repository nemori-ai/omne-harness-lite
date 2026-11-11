// The three HITL commands (SPEC「HITL 命令」): the request each one sends to the HITL location, the
// tenant it names, the usage errors that send nothing, and the exit code of each outcome.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandUnrecognized, resultUncertain } from './support/expected.ts'
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
    if (seen.wire['operation'] === 'list-cards') return { outcome: 'succeeded', body: page }
    return answer?.(seen) ?? defaultAnswer(seen)
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

/** The HITL requests the service received, without the login. */
const hitlSeen = (service: FakeService) =>
  service.seen.filter(seen => seen.path === '/hitl-public/1')
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
    expect(first?.wire).toMatchObject({
      protocolVersion: 'hitl-public/1',
      operation: 'list-cards',
      loginProof: issuedProof,
      body: { tenant: tenantText, filter: { states: ['pending'] }, cursor: null, limit: 100 },
    })
    expect((first!.wire['body'] as { filter: object }).filter).not.toHaveProperty('sessionRef')
    expect(second?.wire['body']).toEqual({
      tenant: tenantText,
      filter: { states: ['decided'], sessionRef: sessionId },
      cursor: 'next-1',
      limit: 5,
    })
    expect(JSON.parse(pool.stdout)).toEqual({
      result: 'response',
      outcome: 'succeeded',
      body: page,
      request: { messageId: first?.wire['messageId'], tenant: tenantText },
    })
  })

  it.each([
    ['--state', 'answered'],
    ['--limit', '0'],
    ['--limit', '101'],
    ['--limit', '07'],
    ['--tenant', 'not-a-tenant'],
  ])('%s %s is a usage error that sends nothing', async (option, value) => {
    const service = await loggedIn()
    const result = await cli(['list-cards', option, value])
    expect(result.code).toBe(2)
    expect(result.stderr).toBe(commandUnrecognized('list-cards'))
    expect(hitlSeen(service)).toEqual([])
  })
})

describe('read-card', () => {
  it('builds the card reference from the tenant, --request and --card', async () => {
    const service = await loggedIn()
    const result = await cli(['read-card', ...ref, '--tenant', otherTenantText])
    // The fake service denies a read it does not know: exit 3.
    expect(result.code).toBe(3)
    expect(hitlSeen(service)[0]?.wire['body']).toEqual({
      tenant: otherTenantText,
      card: card(otherTenantText),
    })
    expect(JSON.parse(result.stdout).request).toEqual({
      messageId: hitlSeen(service)[0]?.wire['messageId'],
      tenant: otherTenantText,
    })
  })
})

describe('submit-reply', () => {
  const invalidated = (seen: Seen): Answer | undefined =>
    seen.wire['operation'] === 'submit-reply'
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
    const sent = hitlSeen(service)[0]?.wire
    expect(sent).toMatchObject({ operation: 'submit-reply', loginProof: issuedProof })
    const body = sent?.['body'] as Record<string, unknown>
    expect(body).toEqual({
      tenant: tenantText,
      card: card(tenantText),
      expectedRevision: '3',
      reply,
      replyId: body['replyId'],
    })
    // A generated reply id is echoed, so the person can retry the same reply with it.
    expect(JSON.parse(result.stdout).request).toEqual({
      messageId: sent?.['messageId'],
      replyId: body['replyId'],
      tenant: tenantText,
    })
    expect(body['replyId']).not.toBe(sent?.['messageId'])
  })

  it('--reply-id is sent as given', async () => {
    const service = await loggedIn(invalidated)
    await cli(['submit-reply', ...ref, '--revision', '0', '--decline', '--reply-id', 'reply-7'])
    expect((hitlSeen(service)[0]!.wire['body'] as { replyId: string }).replyId).toBe('reply-7')
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
    await loggedIn(seen =>
      seen.wire['operation'] === 'submit-reply' ? { outcome, body: {} } : undefined,
    )
    const result = await cli(['submit-reply', ...ref, '--revision', '0', '--decline'])
    expect(result.code).toBe(code)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'response', outcome })
    expect(result.stderr).toBe(code === 5 ? resultUncertain('submit-reply') : '')
  })
})

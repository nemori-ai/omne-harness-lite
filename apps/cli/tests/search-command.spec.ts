import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandUnrecognized } from './support/expected.ts'
import {
  defaultAnswer,
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
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-search-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const hit = (position: string, over: Record<string, unknown> = {}) => ({
  session: sessionId,
  position,
  kind: 'message.user',
  at: '2026-11-19T01:02:03.004Z',
  snippet: { before: 'about the ', match: '受理', after: ' design\nand more' },
  ...over,
})
const page = (hits: unknown[], over: Record<string, unknown> = {}) => ({
  hits,
  next: null,
  complete: true,
  incomplete: null,
  ...over,
})

async function searching(answer: (seen: Seen, turn: number) => Answer): Promise<FakeService> {
  let turn = 0
  const service = await startFakeService(seen => {
    if (seen.operation !== 'search-history') return defaultAnswer(seen)
    turn += 1
    return answer(seen, turn)
  })
  services.push(service)
  await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
  return service
}
const cli = (argv: readonly string[]) =>
  runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home') })
const asked = (service: FakeService) =>
  service.seen.filter(seen => seen.operation === 'search-history').map(seen => seen.body)
const found = (body: unknown): Answer => ({ outcome: 'succeeded', body })
const OTHER_SESSION = 'fedcba9876543210'.repeat(4)

describe('omne search', () => {
  it('searches the tenant of the login for one literal and prints a line for each hit', async () => {
    const tool = hit('9', { kind: 'message.tool', at: null })
    const service = await searching(() => found(page([hit('17'), tool])))
    const result = await cli(['search', '--text', '受理 预算'])
    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe(
      `2026-11-19T01:02:03.004Z  ${sessionId}#17  user  about the [受理] design and more\n` +
        `-  ${sessionId}#9  tool  about the [受理] design and more\n`,
    )
    expect(asked(service)).toEqual([
      {
        tenant: tenantText,
        cursor: null,
        content: { kind: 'literals', all: ['受理 预算'], caseSensitive: false },
        from: null,
        to: null,
        archived: 'all',
        modelReadable: 'only',
      },
    ])
  })

  it('passes on words, a pattern, the range, the kinds and the page size', async () => {
    const service = await searching(() => found(page([])))
    await cli(['search', '--words', ' 受理  预算 ', '--case-sensitive'])
    await cli([
      'search',
      '--regex',
      'a+b',
      '--sessions',
      `${sessionId}, ${OTHER_SESSION}`,
      '--archived',
      'only',
      '--kinds',
      'user,reminder',
      '--any-visibility',
      '--since',
      '2026-11-01T00:00:00Z',
      '--before',
      '2026-11-02T00:00:00Z',
      '--limit',
      '7',
      '--cursor',
      'sealed',
      '--tenant',
      otherTenantText,
    ])
    const [words, pattern] = asked(service)
    expect(words).toMatchObject({
      content: { kind: 'literals', all: ['受理', '预算'], caseSensitive: true },
    })
    expect(pattern).toEqual({
      tenant: otherTenantText,
      cursor: 'sealed',
      content: { kind: 'regex', pattern: 'a+b', caseSensitive: false },
      sessions: [sessionId, OTHER_SESSION],
      archived: 'archived',
      kinds: ['message.user', 'message.system_reminder'],
      modelReadable: 'any',
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-02T00:00:00Z',
      limit: 7,
    })
  })

  it('says on the error stream when a page is not through, why, and how to go on', async () => {
    const incomplete = { reason: 'rebuilding', behind: 12, progress: { indexed: 4, total: 16 } }
    await searching(() =>
      found(page([hit('17')], { next: 'sealed-2', complete: false, incomplete })),
    )
    const result = await cli(['search', '--text', '受理'])
    expect(result.code).toBe(0)
    expect(result.stdout.split('\n')).toHaveLength(2)
    expect(result.stderr).toBe(
      'omne search: not through: the index is being built; 12 sessions not read through; index 4 of 16\n' +
        'omne search: more with --cursor sealed-2\n',
    )
    const tail = { reason: 'tail-budget', behind: 0, progress: null }
    await searching(() => found(page([], { complete: false, incomplete: tail })))
    expect((await cli(['search', '--text', '受理'])).stderr).toBe(
      'omne search: not through: the newest part of the logs was not read through\n',
    )
  })

  it('with --all follows the cursor to the end, and --json prints one object and nothing else', async () => {
    const service = await searching((_seen, turn) =>
      turn === 1
        ? found(page([hit('17')], { next: 'c-2' }))
        : turn === 2
          ? found(page([hit('9')], { next: 'c-3' }))
          : found(page([hit('3')])),
    )
    const result = await cli(['search', '--text', '受理', '--all', '--json'])
    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    const printed = JSON.parse(result.stdout) as Record<string, unknown>
    expect(printed).toMatchObject({
      result: 'response',
      outcome: 'succeeded',
      body: { next: null, complete: true, incomplete: null },
      request: { tenant: tenantText },
    })
    expect((printed['body'] as { hits: unknown[] }).hits).toEqual([hit('17'), hit('9'), hit('3')])
    expect(asked(service).map(body => body['cursor'])).toEqual([null, 'c-2', 'c-3'])
  })

  it('reports a page that was refused, with what the service said, and keeps the hits before it', async () => {
    await searching((_seen, turn) =>
      turn === 1
        ? found(page([hit('17')], { next: 'c-2' }))
        : { outcome: 'invalid', body: { field: 'cursor', reason: 'the index was rebuilt' } },
    )
    const result = await cli(['search', '--text', '受理', '--all'])
    expect(result.code).toBe(3)
    expect(result.stdout.split('\n')).toHaveLength(2)
    expect(result.stderr).toBe(
      'omne search: page 2 was answered invalid {"field":"cursor","reason":"the index was rebuilt"}\n',
    )
    await searching(() => ({ outcome: 'limited', body: {} }))
    const limited = await cli(['search', '--text', '受理', '--json'])
    expect(limited.code).toBe(3)
    expect(JSON.parse(limited.stdout)).toMatchObject({ outcome: 'limited', body: { hits: [] } })
    await searching(() => ({ outcome: 'basis-unavailable', body: {} }))
    expect((await cli(['search', '--regex', 'a'])).code).toBe(4)
  })

  it.each([
    ['nothing to look for', []],
    ['two ways to say what to look for', ['--text', 'a', '--regex', 'b']],
    ['words that are only spaces', ['--words', '  ']],
    ['a kind it does not know', ['--text', 'a', '--kinds', 'user,robot']],
    ['an archive filter it does not know', ['--text', 'a', '--archived', 'both']],
    ['a time that is no instant', ['--text', 'a', '--since', 'yesterday']],
    ['a limit that is no count', ['--text', 'a', '--limit', '0']],
    ['an empty session', ['--text', 'a', '--sessions', 'x,,y']],
    ['a tenant that is not one', ['--text', 'a', '--tenant', 'nobody']],
    ['an option it does not know', ['--text', 'a', '--role', 'user']],
  ])('refuses %s without asking the service', async (_label, argv) => {
    const service = await searching(() => found(page([])))
    const result = await cli(['search', ...argv])
    expect(result.code).toBe(2)
    expect(result.stderr).toBe(commandUnrecognized('search'))
    expect(asked(service)).toEqual([])
  })
})

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandMissing, commandUnrecognized } from './support/expected.ts'
import {
  defaultAnswer,
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
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-mcp-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const cli = (argv: readonly string[]) =>
  runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home') })

async function loggedIn(answer: (seen: Seen) => Answer | undefined) {
  const service = await startFakeService(seen => answer(seen) ?? defaultAnswer(seen))
  services.push(service)
  const result = await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
  expect(result.code).toBe(0)
  return service
}

const mcpCalls = (service: FakeService) =>
  service.seen.filter(seen => seen.path.startsWith('/api/mcp/'))

const docs = {
  name: 'docs',
  connection: { state: 'ready', reason: null },
  credential: 'present',
  use: { kind: 'usable' },
  catalog: { kind: 'acquired', actions: 2 },
}
const notes = {
  name: 'notes',
  connection: { state: 'lost', reason: 'stream-broken' },
  credential: 'absent',
  use: { kind: 'blocked', reason: 'the endpoint is disabled' },
  catalog: { kind: 'not-acquired', reason: 'the address of the endpoint is not set' },
}
const REJECTED_TEXT =
  'the credential of the endpoint was rejected by the endpoint; the person needs to set the right one'
const vault = {
  name: 'vault',
  connection: { state: 'lost', reason: REJECTED_TEXT },
  credential: 'present',
  credentialState: 'rejected',
  use: { kind: 'usable' },
  catalog: { kind: 'not-acquired', reason: REJECTED_TEXT },
}
const actions = [
  { name: 'search', summary: '[peer] Search the docs.', available: true, reason: null },
  {
    name: 'fetch',
    summary: 'The endpoint gave no description.',
    available: false,
    reason: 'the credential of the endpoint is not usable',
  },
]

const answers = (seen: Seen): Answer | undefined => {
  switch (seen.operation) {
    case 'list-endpoints':
      return { outcome: 'succeeded', body: { items: [docs, notes] } }
    case 'read-endpoint':
      return seen.body['name'] === 'docs'
        ? { outcome: 'succeeded', body: { endpoint: docs, actions } }
        : seen.body['name'] === 'notes'
          ? { outcome: 'succeeded', body: { endpoint: notes, actions: null } }
          : seen.body['name'] === 'vault'
            ? { outcome: 'succeeded', body: { endpoint: vault, actions: null } }
            : { outcome: 'not-visible', body: {} }
    case 'refresh-endpoint':
      return seen.body['name'] === 'docs'
        ? { outcome: 'succeeded', body: { refreshed: 'published', reason: null } }
        : seen.body['name'] === 'notes'
          ? {
              outcome: 'succeeded',
              body: { refreshed: 'failed', reason: 'the address of the endpoint is not set' },
            }
          : { outcome: 'not-visible', body: {} }
    default:
      return undefined
  }
}

describe('mcp list', () => {
  it('prints a table with the reason where an endpoint cannot be used, and the raw answer with --json', async () => {
    const service = await loggedIn(answers)
    const table = await cli(['mcp', 'list'])
    expect(table.code).toBe(0)
    expect(table.stdout).toBe(
      [
        'NAME   CONNECTION            CREDENTIAL  USE                                ACTIONS',
        'docs   ready                 present     usable                             2',
        'notes  lost (stream-broken)  absent      blocked: the endpoint is disabled  -',
        '',
      ].join('\n'),
    )
    expect(mcpCalls(service)[0]?.body).toEqual({ tenant: tenantText })
    const json = await cli(['mcp', 'list', '--json'])
    expect(json.stdout.trim().split('\n')).toHaveLength(1)
    expect(JSON.parse(json.stdout)).toMatchObject({
      outcome: 'succeeded',
      body: { items: [{ name: 'docs' }, { name: 'notes' }] },
    })
  })

  it('takes no word', async () => {
    await loggedIn(answers)
    const result = await cli(['mcp', 'list', 'docs'])
    expect(result.code).toBe(2)
    expect(result.stderr).toBe(commandUnrecognized('mcp list'))
  })
})

describe('mcp show', () => {
  it('writes each field and the actions, the unavailable one with its reason', async () => {
    const service = await loggedIn(answers)
    const shown = await cli(['mcp', 'show', 'docs'])
    expect(shown.code).toBe(0)
    expect(shown.stdout).toBe(
      [
        'Name: docs',
        'Connection: ready',
        'Credential: present',
        'Use: usable',
        'Catalog: 2 actions',
        'Actions:',
        '  search  [peer] Search the docs.',
        '  fetch (unavailable: the credential of the endpoint is not usable)  The endpoint gave no description.',
        '',
      ].join('\n'),
    )
    expect(mcpCalls(service).at(-1)?.body).toEqual({ tenant: tenantText, name: 'docs' })
  })

  it('writes why the catalog was not acquired', async () => {
    await loggedIn(answers)
    const shown = await cli(['mcp', 'show', 'notes'])
    expect(shown.code).toBe(0)
    expect(shown.stdout).toContain('Connection: lost (stream-broken)\n')
    expect(shown.stdout).toContain('Use: blocked: the endpoint is disabled\n')
    expect(shown.stdout).toContain(
      'Catalog: not acquired: the address of the endpoint is not set\n',
    )
    expect(shown.stdout).not.toContain('Actions:')
  })

  it('says the credential was rejected and how to set the right one (C101)', async () => {
    await loggedIn(answers)
    const shown = await cli(['mcp', 'show', 'vault'])
    expect(shown.code).toBe(0)
    expect(shown.stdout).toContain(`Connection: lost (${REJECTED_TEXT})\n`)
    expect(shown.stdout).toContain(
      'Credential: rejected (set the right one: omne setting set mcp:vault credential)\n',
    )
  })

  it('prints the answer for an endpoint that is not visible and exits 3, and needs a name', async () => {
    await loggedIn(answers)
    const missing = await cli(['mcp', 'show', 'absent'])
    expect(missing.code).toBe(3)
    expect(JSON.parse(missing.stdout)).toMatchObject({ outcome: 'not-visible' })
    const noName = await cli(['mcp', 'show'])
    expect(noName.code).toBe(2)
    expect(noName.stderr).toBe(commandMissing('mcp show', '<name>'))
  })

  it('answers the raw body with --json', async () => {
    await loggedIn(answers)
    const json = await cli(['mcp', 'show', 'docs', '--json'])
    expect(JSON.parse(json.stdout)).toMatchObject({
      outcome: 'succeeded',
      body: { endpoint: { name: 'docs' }, actions: [{ name: 'search' }, { name: 'fetch' }] },
    })
  })
})

describe('mcp refresh', () => {
  it('writes the result in one line and exits 0 when the actions were published', async () => {
    const service = await loggedIn(answers)
    const result = await cli(['mcp', 'refresh', 'docs'])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('published\n')
    expect(mcpCalls(service).at(-1)?.operation).toBe('refresh-endpoint')
  })

  it('writes the reason of a failed refresh and exits 3', async () => {
    await loggedIn(answers)
    const result = await cli(['mcp', 'refresh', 'notes'])
    expect(result.code).toBe(3)
    expect(result.stdout).toBe('failed: the address of the endpoint is not set\n')
  })

  it('exits 5 with the raw report when the result is unknown, and does not send it again', async () => {
    const service = await loggedIn(seen =>
      seen.operation === 'refresh-endpoint' ? { outcome: 'unknown', body: {} } : answers(seen),
    )
    const result = await cli(['mcp', 'refresh', 'docs'])
    expect(result.code).toBe(5)
    expect(result.stderr).toContain('result uncertain')
    expect(mcpCalls(service).filter(seen => seen.operation === 'refresh-endpoint')).toHaveLength(1)
  })

  it('prints the answer for an endpoint that is not visible and exits 3', async () => {
    await loggedIn(answers)
    const result = await cli(['mcp', 'refresh', 'absent'])
    expect(result.code).toBe(3)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'not-visible' })
  })
})

describe('usage', () => {
  it('refuses an action it does not have and an option it does not take', async () => {
    await loggedIn(answers)
    expect((await cli(['mcp'])).code).toBe(2)
    expect((await cli(['mcp', 'drop', 'docs'])).code).toBe(2)
    expect((await cli(['mcp', 'list', '--all'])).code).toBe(2)
  })
})

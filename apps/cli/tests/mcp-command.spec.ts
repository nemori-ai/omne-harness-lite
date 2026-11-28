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
  skills: { kind: 'acquired', taken: 3, refused: 1 },
}
const notes = {
  name: 'notes',
  connection: { state: 'lost', reason: 'stream-broken' },
  credential: 'absent',
  use: { kind: 'blocked', reason: 'the endpoint is disabled' },
  catalog: { kind: 'not-acquired', reason: 'the address of the endpoint is not set' },
}
const REJECTED_TEXT =
  'the credential of the endpoint was rejected by the endpoint; the person needs to set the right one, or connect again if the endpoint signs in with OAuth'
const vault = {
  name: 'vault',
  connection: { state: 'lost', reason: REJECTED_TEXT },
  credential: 'present',
  credentialState: 'rejected',
  use: { kind: 'usable' },
  catalog: { kind: 'not-acquired', reason: REJECTED_TEXT },
  skills: { kind: 'not-acquired' },
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
  it('C406 writes how many skills an endpoint brings, that none were acquired, or that it offers none', async () => {
    await loggedIn(answers)
    expect((await cli(['mcp', 'show', 'vault'])).stdout).toContain('\nSkills: not acquired\n')
    const offering = await cli(['mcp', 'show', 'docs'])
    expect(offering.stdout).toContain('\nSkills: 3 (1 not taken)\n')
  })

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
        'Skills: 3 (1 not taken)',
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
    expect(shown.stdout).not.toContain('Skills:')
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

describe('mcp connect and disconnect (C201, C206)', () => {
  const desk = (credentialState: string, connect: string) => ({
    ...docs,
    name: 'desk',
    credentialState,
    connect,
  })
  const URL = 'https://auth.example/authorize?state=s'
  const connecting =
    (reads: string[][]) =>
    (seen: Seen): Answer | undefined => {
      if (seen.operation === 'begin-connect')
        return seen.body['name'] === 'desk'
          ? {
              outcome: 'succeeded',
              body: { url: URL, expiresAt: new Date(Date.now() + 60_000).toISOString() },
            }
          : { outcome: 'unsupported', body: { reason: 'not-oauth' } }
      if (seen.operation === 'read-endpoint') {
        const [state, connect] = reads.shift() ?? ['absent', 'available']
        return {
          outcome: 'succeeded',
          body: { endpoint: desk(state ?? '', connect ?? ''), actions: null },
        }
      }
      if (seen.operation === 'disconnect')
        return { outcome: 'succeeded', body: { disconnected: 'disconnected' } }
      return undefined
    }

  it('prints the address to open and waits until the endpoint is connected', async () => {
    const service = await loggedIn(
      connecting([
        ['absent', 'connecting'],
        ['present', 'available'],
      ]),
    )
    const result = await cli(['mcp', 'connect', 'desk'])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe(`Open this address in a browser and consent:\n${URL}\nconnected\n`)
    expect(mcpCalls(service).map(seen => seen.operation)).toEqual([
      'begin-connect',
      'read-endpoint',
      'read-endpoint',
    ])
  })

  it('says not connected when the consent came back without a grant, and only prints the address with --no-wait', async () => {
    await loggedIn(connecting([['absent', 'available']]))
    const refused = await cli(['mcp', 'connect', 'desk'])
    expect(refused.code).toBe(3)
    expect(refused.stdout.endsWith('not connected\n')).toBe(true)
    const quick = await cli(['mcp', 'connect', 'desk', '--no-wait'])
    expect(quick.code).toBe(0)
    expect(quick.stdout).toBe(`Open this address in a browser and consent:\n${URL}\n`)
  })

  it('reports an endpoint that cannot be connected, and disconnects', async () => {
    const service = await loggedIn(connecting([]))
    const plain = await cli(['mcp', 'connect', 'plain'])
    expect(plain.code).not.toBe(0)
    expect(plain.stdout + plain.stderr).toContain('not-oauth')
    const ended = await cli(['mcp', 'disconnect', 'desk'])
    expect(ended.code).toBe(0)
    expect(ended.stdout).toBe('disconnected\n')
    expect(mcpCalls(service).at(-1)?.body).toEqual({ tenant: tenantText, name: 'desk' })
  })
})

describe('mcp events (C301)', () => {
  const answering =
    (events: unknown) =>
    (seen: Seen): Answer | undefined =>
      seen.operation === 'list-event-types' ? { outcome: 'succeeded', body: { events } } : undefined

  it('lists the kinds of events an endpoint offers, with how each is delivered', async () => {
    const service = await loggedIn(
      answering({
        kind: 'acquired',
        types: [
          {
            name: 'incident.created',
            description: 'An incident was opened.',
            delivery: ['poll', 'push'],
          },
        ],
      }),
    )
    const result = await cli(['mcp', 'events', 'desk'])
    expect(result.code).toBe(0)
    expect(result.stdout.split('\n')[0]).toMatch(/^EVENT\s+DELIVERY\s+DESCRIPTION$/u)
    expect(result.stdout).toMatch(/incident\.created\s+poll,push\s+An incident was opened\./u)
    expect(mcpCalls(service).at(-1)?.body).toEqual({ tenant: tenantText, name: 'desk' })
  })

  it('says when an endpoint offers no events, and when they were not taken yet: neither is an empty table', async () => {
    await loggedIn(answering({ kind: 'not-declared' }))
    expect((await cli(['mcp', 'events', 'desk'])).stdout).toBe('The endpoint offers no events.\n')
    await loggedIn(answering({ kind: 'not-acquired' }))
    expect((await cli(['mcp', 'events', 'desk'])).stdout).toBe(
      'Events: not acquired (refresh the endpoint first)\n',
    )
  })
})

describe('mcp subscribe, unsubscribe and tail (C302, C304)', () => {
  const subscription = {
    name: 'incident.created',
    arguments: { queue: 'ops' },
    delivery: 'push',
    state: 'receiving',
    reason: null,
    subscribers: 1,
  }
  const answering =
    (operation: string, body: unknown) =>
    (seen: Seen): Answer | undefined =>
      seen.operation === operation ? { outcome: 'succeeded', body } : undefined

  it('subscribes with the arguments given, and says how the events will come', async () => {
    const service = await loggedIn(answering('subscribe-events', { subscription }))
    const result = await cli([
      'mcp',
      'subscribe',
      'desk',
      'incident.created',
      '--args',
      '{"queue":"ops"}',
    ])
    expect([result.code, result.stderr, result.stdout]).toEqual([
      0,
      '',
      'subscribed to incident.created: push, receiving\n',
    ])
    expect(result.code).toBe(0)
    expect(mcpCalls(service).at(-1)?.body).toEqual({
      tenant: tenantText,
      name: 'desk',
      event: 'incident.created',
      arguments: { queue: 'ops' },
    })
  })

  it('arguments that are not a JSON object, a missing event and a position that is not a count are refused before any call', async () => {
    const service = await loggedIn(answering('subscribe-events', { subscription }))
    for (const args of [
      ['mcp', 'subscribe', 'desk', 'incident.created', '--args', '[1]'],
      ['mcp', 'subscribe', 'desk', 'incident.created', '--args', 'nope'],
      ['mcp', 'tail', 'desk', 'incident.created', '--after', '-1'],
    ])
      expect((await cli(args)).code).toBe(2)
    expect((await cli(['mcp', 'subscribe', 'desk'])).code).toBe(2)
    expect(mcpCalls(service)).toEqual([])
  })

  it('leaving says whether the person was a subscriber', async () => {
    await loggedIn(answering('unsubscribe-events', { unsubscribed: 'not-subscribed' }))
    expect((await cli(['mcp', 'unsubscribe', 'desk', 'incident.created'])).stdout).toBe(
      'not subscribed\n',
    )
  })

  it('tail shows the subscription as it stands, then each event and gap, after the position given', async () => {
    const service = await loggedIn(
      answering('read-events', {
        subscription: { ...subscription, state: 'terminated', reason: 'refused' },
        items: [
          {
            seq: 4,
            receivedAt: '2026-11-27T22:00:00.000Z',
            kind: 'event',
            eventId: 'e4',
            name: 'incident.created',
            timestamp: '2026-11-27T21:59:59Z',
            data: { id: 'e4', level: 2 },
          },
          {
            seq: 5,
            receivedAt: '2026-11-27T22:00:00.000Z',
            kind: 'gap',
            reason: 'possibly-missed',
          },
          { seq: 6, receivedAt: '2026-11-27T22:00:00.000Z', kind: 'ended', reason: 'refused' },
        ],
      }),
    )
    const result = await cli(['mcp', 'tail', 'desk', 'incident.created', '--after', '3'])
    expect([result.code, result.stderr]).toEqual([0, ''])
    expect(result.stdout).toBe(
      [
        'Subscription: incident.created, push, terminated (refused)',
        '4  2026-11-27T21:59:59Z  e4  {"id":"e4","level":2}',
        '5  -- gap: possibly-missed',
        '6  -- ended: refused',
        '',
      ].join('\n'),
    )
    expect(mcpCalls(service).at(-1)?.body).toMatchObject({ after: 3, limit: 100, arguments: {} })
  })
})

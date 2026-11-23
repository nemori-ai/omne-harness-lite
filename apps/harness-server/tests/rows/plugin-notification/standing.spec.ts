import { standingItemsSchema } from '@omne-harness/notification-contract'
import type { ReportedClient } from '@omne-harness/plugin-access'
import type { ListedPlugin } from '@omne-harness/plugin-host-local'
import { readManifest } from '@omne-harness/plugin-protocol'
import { describe, expect, it } from 'vitest'
import {
  EXTENSIONS_SOURCE,
  PLUGIN_LOAD_FAILURES_KEY,
  createFirstSeen,
  loadFailuresBlock,
  standingItemsOfFailures,
} from '../../../src/rows/plugin-notification/standing.ts'

const VERSION = 'a'.repeat(64)

function held(name: string, enabled = true): ListedPlugin {
  const read = readManifest(JSON.stringify({ schema: 1, name, summary: 's' }))
  if (read.kind !== 'read') throw new Error(read.reason)
  return {
    name,
    enabled,
    manifest: read.manifest,
    held: { asset: `a/${name}`, version: `sha256:${VERSION}` },
  }
}

const client = (
  id: string,
  ...plugins: readonly (readonly [string, 'loaded' | 'failed' | 'held', string | null, string?])[]
): ReportedClient => ({
  client: id,
  points: [],
  parts: [],
  plugins: plugins.map(([name, state, reason, version = VERSION]) => ({
    name,
    state,
    reason,
    version,
  })),
})

const AT = '2026-11-23T08:00:00.000Z'
const seen = () => createFirstSeen(() => AT)
const items = (plugins: readonly ListedPlugin[], clients: readonly ReportedClient[]) =>
  standingItemsOfFailures('alice', plugins, clients, seen())

describe('the extensions a tenant holds that a client could not load, as standing items', () => {
  it('is one item for a plugin a client failed to load, with what the client said', () => {
    const told = items([held('tidy')], [client('desktop-1', ['tidy', 'failed', 'card.js threw'])])
    expect(told).toEqual([
      {
        id: 'extensions.changes/plugin/tidy/load-failed',
        source: 'extensions.changes',
        type: 'load-failed',
        subject: 'plugin:tidy',
        title: 'plugin tidy 装不上：card.js threw',
        locator: { kind: 'extension', ref: 'plugin:tidy' },
        since: AT,
      },
    ])
    expect(standingItemsSchema.safeParse(told).success).toBe(true)
  })

  it('says so when the app stopped loading it, and counts the clients when more than one could not', () => {
    const [one] = items([held('tidy')], [client('d1', ['tidy', 'held', null])])
    expect(one?.title).toBe('plugin tidy 被停掉了：应用连着两次带着它起不来')
    const [two] = items(
      [held('tidy')],
      [client('d1', ['tidy', 'failed', 'x']), client('d2', ['tidy', 'failed', 'y'])],
    )
    expect(two?.title).toBe('plugin tidy 在 2 个客户端装不上：x')
  })

  it.each([
    ['one every client loaded', [held('tidy')], [client('d1', ['tidy', 'loaded', null])]],
    ['one that is disabled', [held('tidy', false)], [client('d1', ['tidy', 'failed', 'x'])]],
    ['one the tenant does not hold', [], [client('d1', ['tidy', 'failed', 'x'])]],
    [
      'a failure told of another version',
      [held('tidy')],
      [client('d1', ['tidy', 'failed', 'x', 'b'.repeat(64)])],
    ],
    ['one no client told of', [held('tidy')], [client('d1')]],
  ] as const)('gives no item for %s', (_name, plugins, clients) => {
    expect(items(plugins, clients)).toEqual([])
  })

  it('keeps a title within what a standing item may hold', () => {
    const [long] = items([held('tidy')], [client('d1', ['tidy', 'failed', 'x'.repeat(500)])])
    expect([...(long?.title ?? '')].length).toBeLessThanOrEqual(200)
  })
})

describe('since when a failure stands', () => {
  it('is the first time it was seen, and a new time once it was gone and came back', () => {
    let now = '2026-11-23T08:00:00.000Z'
    const first = createFirstSeen(() => now)
    const failing = [client('d1', ['tidy', 'failed', 'x'])]
    expect(standingItemsOfFailures('alice', [held('tidy')], failing, first)[0]?.since).toBe(now)
    now = '2026-11-23T09:00:00.000Z'
    expect(standingItemsOfFailures('alice', [held('tidy')], failing, first)[0]?.since).toBe(
      '2026-11-23T08:00:00.000Z',
    )
    expect(standingItemsOfFailures('alice', [held('tidy')], [], first)).toEqual([])
    expect(standingItemsOfFailures('alice', [held('tidy')], failing, first)[0]?.since).toBe(now)
    expect(standingItemsOfFailures('bob', [held('tidy')], failing, first)[0]?.since).toBe(now)
  })
})

describe('the block and the source', () => {
  it('supplies the items of the tenant asked, and unknown when what it holds cannot be read', async () => {
    const asked: string[] = []
    const block = loadFailuresBlock({
      tenantText: () => 'alice',
      listed: async tenant => (asked.push(tenant), { kind: 'read', plugins: [held('tidy')] }),
      reports: () => [client('d1', ['tidy', 'failed', 'x'])],
      now: () => AT,
    })
    expect(block.declaration.key).toBe(PLUGIN_LOAD_FAILURES_KEY)
    const supplied = await block.supply({ tenant: {} } as never)
    expect(supplied).toMatchObject({ kind: 'value', value: [{ subject: 'plugin:tidy' }] })
    expect(asked).toEqual(['alice'])
    const unread = loadFailuresBlock({
      tenantText: () => 'alice',
      listed: async () => ({ kind: 'unavailable' }),
      reports: () => [],
      now: () => AT,
    })
    expect(await unread.supply({ tenant: {} } as never)).toEqual({ kind: 'unknown' })
    const noReports = loadFailuresBlock({
      tenantText: () => 'alice',
      listed: async () => ({ kind: 'read', plugins: [] }),
      reports: () => undefined,
      now: () => AT,
    })
    expect(await noReports.supply({ tenant: {} } as never)).toEqual({ kind: 'unknown' })
  })

  it('declares one standing type bound to the block, on by default for the person, and the two arrivals as one-time events', () => {
    expect(EXTENSIONS_SOURCE.name).toBe('extensions.changes')
    expect(EXTENSIONS_SOURCE.types.map(type => [type.name, type.kind.kind])).toEqual([
      ['load-failed', 'standing'],
      ['point-added', 'event'],
      ['category-added', 'event'],
    ])
    expect(EXTENSIONS_SOURCE.types[0]).toMatchObject({
      name: 'load-failed',
      kind: { kind: 'standing', binding: PLUGIN_LOAD_FAILURES_KEY },
      subject: { presence: 'required' },
      nameable: [],
      defaults: { person: 'strong', agent: 'off' },
      external: false,
    })
  })
})

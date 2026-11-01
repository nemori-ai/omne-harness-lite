import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, test } from 'vitest'
import {
  createSessionWorkPrincipals,
  disposeTree,
  startTree,
  type StartResult,
} from '../src/loader.ts'
import { createTrust, type Trust, type TrustScopeSpec } from '../src/trust.ts'
import { createStubPlugin, type StubEvent } from '../src/s0/stub-plugin.ts'
import type { RowId, RowManifest, ServiceName, TreeRow, Visibility } from '../src/types.ts'

const ISSUER = 's0.principalIssuer'
const STORAGE = 's0.storage'
const LOOKUP = 's0.tenantDomainLookup'
const MAPPINGS = 's0.definitionMappings'
const BINDINGS = 's0.sessionPrincipalBindings'

const SCOPES: readonly TrustScopeSpec[] = [
  { id: 'S-ISSUE', names: [ISSUER] },
  { id: 'S-STORE', names: [STORAGE, LOOKUP] },
  { id: 'S-MAP', names: [MAPPINGS] },
  { id: 'S-WORK', names: ['s0.sessionWorkPrincipals'] },
  { id: 'S-BIND', names: [BINDINGS] },
]

type RowDecl = Readonly<{
  id: string
  provides?: readonly ServiceName[]
  injects?: readonly ServiceName[]
  group?: string
  config?: unknown
  source?: TreeRow['source']
}>

type Finished = {
  result: StartResult
  events: StubEvent[]
  root: Context
  trust: Trust
  barrierCalls: () => number
}

const live: Finished[] = []

afterEach(async () => {
  while (live.length > 0) {
    const finished = live.pop()!
    if (finished.result.kind === 'started') await disposeTree(finished.root, finished.result.rows)
  }
})

function visibility(entries: Record<string, readonly ServiceName[]>): Visibility {
  return new Map(Object.entries(entries).map(([id, names]) => [id as RowId, names]))
}

async function run(
  rows: readonly RowDecl[],
  visible: Record<string, readonly ServiceName[]>,
  options: {
    entryObjects?: readonly { name: ServiceName; value: unknown }[]
    omitEntryObjects?: readonly ServiceName[]
    timeoutMs?: number
  } = {},
): Promise<Finished> {
  const events: StubEvent[] = []
  const root = new Context()
  const trust = createTrust(SCOPES, visibility(visible))
  let barrierCalls = 0
  const specs = rows.map(decl => {
    const id = decl.id as RowId
    const manifest: RowManifest = {
      provides: decl.provides ?? [],
      injects: decl.injects ?? [],
      phase: null,
      sameProviderGroup: decl.group ?? null,
    }
    const row: TreeRow = {
      id,
      plugin: 'stub',
      config: decl.config ?? {},
      source: decl.source ?? 'distribution',
    }
    return {
      row,
      manifest,
      plugin: createStubPlugin({ id, manifest, hooks: { observe: e => events.push(e) } }),
    }
  })
  const result: StartResult = await startTree({
    root,
    trust,
    rows: specs,
    entryObjects: options.entryObjects ?? [],
    omitEntryObjects: options.omitEntryObjects,
    readinessTimeoutMs: options.timeoutMs ?? 500,
    barrier: () => {
      barrierCalls += 1
    },
  })
  const finished: Finished = { result, events, root, trust, barrierCalls: () => barrierCalls }
  live.push(finished)
  return finished
}

function state(finished: Finished, id: string) {
  if (finished.result.kind !== 'started') throw new Error('tree was rejected')
  const found = finished.result.report.rows.find(r => r.id === id)
  if (!found) throw new Error(`no row ${id}`)
  return found
}

function valueSeen(
  events: readonly StubEvent[],
  kind: StubEvent['kind'],
  row: string,
  name: ServiceName,
) {
  const hit = events.find(e => e.kind === kind && e.row === row && 'name' in e && e.name === name)
  return hit && 'value' in hit ? hit.value : 'NOT-OBSERVED'
}

describe('trust scopes (spec 5.3)', () => {
  test('T-01 a visible row gets the entry-created issuer object', async () => {
    const issuer = { issue: () => 'p' }
    const f = await run(
      [{ id: 'entry-stub', injects: [ISSUER] }],
      { 'entry-stub': [ISSUER] },
      { entryObjects: [{ name: ISSUER, value: issuer }] },
    )
    expect(state(f, 'entry-stub').state).toBe('ACTIVE')
    expect(valueSeen(f.events, 'injected', 'entry-stub', ISSUER)).toBe(issuer)
  })

  test('T-02 a root row cannot get the issuer by name and stays ACTIVE', async () => {
    const f = await run(
      [{ id: 'probe', config: { probeGet: [ISSUER] } }],
      {},
      { entryObjects: [{ name: ISSUER, value: { issue: () => 'p' } }] },
    )
    expect(state(f, 'probe').state).toBe('ACTIVE')
    expect(valueSeen(f.events, 'probed', 'probe', ISSUER)).toBeUndefined()
  })

  test('the issuer is visible to server-entry only, not to a sibling row', async () => {
    const issuer = { issue: () => 'p' }
    const f = await run(
      [
        { id: 'server-entry', injects: [ISSUER] },
        { id: 'sibling', config: { probeGet: [ISSUER] } },
      ],
      { 'server-entry': [ISSUER] },
      { entryObjects: [{ name: ISSUER, value: issuer }] },
    )
    expect(valueSeen(f.events, 'injected', 'server-entry', ISSUER)).toBe(issuer)
    expect(valueSeen(f.events, 'probed', 'sibling', ISSUER)).toBeUndefined()
  })

  test('T-03 a root provider of the same name does not replace the subtree implementation', async () => {
    const f = await run(
      [
        { id: 'mapping-provider', provides: [MAPPINGS] },
        { id: 'root-mapping', provides: [MAPPINGS] },
        { id: 'consumer', injects: [MAPPINGS] },
      ],
      { 'mapping-provider': [MAPPINGS], consumer: [MAPPINGS] },
    )
    expect(state(f, 'mapping-provider').state).toBe('ACTIVE')
    expect(state(f, 'root-mapping').state).toBe('ACTIVE')
    expect(state(f, 'consumer').state).toBe('ACTIVE')
    const got = valueSeen(f.events, 'injected', 'consumer', MAPPINGS) as { rowId: string }
    expect(got.rowId).toBe('mapping-provider')
  })

  test('T-04 a second visible provider in one scope FAILS with has been registered', async () => {
    const f = await run(
      [
        { id: 'storage-a', provides: [STORAGE] },
        { id: 'storage-b', provides: [STORAGE] },
      ],
      { 'storage-a': [STORAGE], 'storage-b': [STORAGE] },
    )
    expect(state(f, 'storage-a').state).toBe('ACTIVE')
    const second = state(f, 'storage-b')
    expect(second.state).toBe('FAILED')
    expect(second.error?.message).toContain('has been registered')
    if (f.result.kind !== 'started') throw new Error('rejected')
    expect(f.result.report.exitCode).toBe(3)
  })

  test('T-05 an operator-inserted row injecting a trusted name is rejected before any plugin body runs', async () => {
    const f = await run(
      [
        { id: 'storage', provides: [STORAGE] },
        { id: 'operator-row', injects: [STORAGE], source: 'operator' },
      ],
      { storage: [STORAGE] },
    )
    expect(f.result.kind).toBe('rejected')
    if (f.result.kind !== 'rejected') return
    expect(f.result.exitCode).toBe(2)
    expect(f.result.diagnostics).toEqual([
      { kind: 'invisible-inject', row: 'operator-row', name: STORAGE },
    ])
    expect(f.events).toEqual([])
  })

  test('T-06 missing issuer leaves server-entry PENDING with no FAILED and no barrier', async () => {
    const f = await run(
      [{ id: 'entry-stub', injects: [ISSUER] }],
      { 'entry-stub': [ISSUER] },
      { omitEntryObjects: [ISSUER], entryObjects: [{ name: ISSUER, value: {} }] },
    )
    const row = state(f, 'entry-stub')
    expect(row.state).toBe('PENDING')
    expect(row.missing).toEqual([ISSUER])
    if (f.result.kind !== 'started') throw new Error('rejected')
    expect(f.result.report.rows.some(r => r.state === 'FAILED')).toBe(false)
    expect(f.barrierCalls()).toBe(0)
    expect(f.result.report.exitCode).toBe(4)
  })

  test('T-07 replacing a trusted row config keeps its scope and visible set', async () => {
    const f = await run(
      [
        { id: 'storage', provides: [STORAGE] },
        { id: 'identity', injects: [STORAGE], config: { replaced: true }, source: 'operator' },
      ],
      { identity: [STORAGE], storage: [STORAGE] },
    )
    expect(state(f, 'identity').state).toBe('ACTIVE')
    expect(f.trust.describe('identity' as RowId)).toEqual({
      names: [STORAGE],
      source: 'release-code',
    })
  })

  test('T-08 one provider group split across two rows is rejected before loading', async () => {
    const f = await run(
      [
        { id: 'journal', provides: ['s0.agentJournal'], group: 'journal-group' },
        { id: 'entries', provides: ['s0.agentJournalEntries'], group: 'journal-group' },
      ],
      {},
    )
    expect(f.result.kind).toBe('rejected')
    if (f.result.kind !== 'rejected') return
    expect(f.result.exitCode).toBe(2)
    expect(f.result.diagnostics).toEqual([
      { kind: 'split-provider-group', group: 'journal-group', rows: ['journal', 'entries'] },
    ])
    expect(f.events).toEqual([])
  })

  test('a duplicate row id is rejected before loading', async () => {
    const f = await run([{ id: 'a' }, { id: 'a' }], {})
    expect(f.result.kind).toBe('rejected')
    if (f.result.kind !== 'rejected') return
    expect(f.result.diagnostics).toEqual([{ kind: 'duplicate-row', row: 'a' }])
  })
})

describe('mechanism probes (N-8)', () => {
  test('isolate changes the label of one name only', async () => {
    // The row sees only s0.storage. s0.tenantDomainLookup belongs to the same
    // scope but is not visible to it, so that name stays under the root label.
    const f = await run([{ id: 'mixed', provides: [STORAGE, LOOKUP, 's0.plain'] }], {
      mixed: [STORAGE],
    })
    expect(state(f, 'mixed').state).toBe('ACTIVE')
    expect(f.root.reflect.get(STORAGE)).toBeUndefined()
    expect(f.root.reflect.get(LOOKUP)).toBeDefined()
    expect(f.root.reflect.get('s0.plain')).toBeDefined()
  })

  test('a Service subclass registers under the label of the derived context', async () => {
    const f = await run(
      [
        { id: 'provider', provides: [STORAGE] },
        { id: 'consumer', injects: [STORAGE] },
      ],
      { provider: [STORAGE], consumer: [STORAGE] },
    )
    expect(state(f, 'consumer').state).toBe('ACTIVE')
    expect(f.root.reflect.get(STORAGE)).toBeUndefined()
    const got = valueSeen(f.events, 'injected', 'consumer', STORAGE) as { rowId: string }
    expect(got.rowId).toBe('provider')
  })

  test('one row can provide two names of the same scope', async () => {
    const f = await run(
      [
        { id: 'session-storage', provides: [STORAGE, LOOKUP] },
        { id: 'reader', injects: [LOOKUP] },
      ],
      { 'session-storage': [STORAGE, LOOKUP], reader: [LOOKUP] },
    )
    expect(state(f, 'session-storage').state).toBe('ACTIVE')
    expect(state(f, 'reader').state).toBe('ACTIVE')
  })

  test('one shared label for two names of a scope collides in the store (why labels are per name)', () => {
    const label = Symbol('shared')
    const root = new Context()
    const a = root.isolate('s0.one', label).isolate('s0.two', label)
    a.provide('s0.one', {})
    expect(() => a.provide('s0.two', {})).toThrow(/has been registered/)
  })
})

describe('child fiber consumption (N-4)', () => {
  test('child-consumed trusted names count in the visible set and are rejected when absent', async () => {
    const scopes: readonly TrustScopeSpec[] = [
      ...SCOPES,
      { id: 'S-OUTLET', names: ['s0.accountOutlet'] },
    ]
    const outlet = { send: () => 'ok' }

    const run2 = async (visible: readonly ServiceName[]) => {
      const events: StubEvent[] = []
      const root = new Context()
      const trust = createTrust(scopes, new Map([['model-host' as RowId, visible]]))
      const manifest: RowManifest = {
        provides: [],
        injects: ['s0.accountOutlet'],
        phase: null,
        sameProviderGroup: null,
      }
      const id = 'model-host' as RowId
      const result = await startTree({
        root,
        trust,
        rows: [
          {
            row: {
              id,
              plugin: 'stub',
              config: { childInject: ['s0.accountOutlet'] },
              source: 'distribution',
            },
            manifest,
            plugin: createStubPlugin({ id, manifest, hooks: { observe: e => events.push(e) } }),
          },
        ],
        entryObjects: [{ name: 's0.accountOutlet', value: outlet }],
        readinessTimeoutMs: 500,
        barrier: () => {},
      })
      live.push({ result, events, root, trust, barrierCalls: () => 0 })
      return { result, events }
    }

    const listed = await run2(['s0.accountOutlet'])
    expect(listed.result.kind).toBe('started')
    expect(valueSeen(listed.events, 'child-injected', 'model-host', 's0.accountOutlet')).toBe(
      outlet,
    )

    const unlisted = await run2([])
    expect(unlisted.result.kind).toBe('rejected')
    expect(unlisted.events).toEqual([])
  })
})

describe('trust table validation', () => {
  test('a visible name that no scope owns is an error, not an empty set', () => {
    expect(() => createTrust(SCOPES, new Map([['r' as RowId, ['s0.unknown']]]))).toThrow(
      /s0\.unknown/,
    )
  })

  test('a name owned by two scopes is an error', () => {
    expect(() =>
      createTrust(
        [
          { id: 'A', names: ['s0.x'] },
          { id: 'B', names: ['s0.x'] },
        ],
        new Map(),
      ),
    ).toThrow(/s0\.x/)
  })
})

describe('session work principals (N-1, N-2)', () => {
  const issuer = {
    issue: (claim: { session: string; owner: string }) =>
      `principal:${claim.owner}:${claim.session}`,
  }

  test('N-1 forSession reads the bindings source per call and issues when it is present', async () => {
    const root = new Context()
    const trust = createTrust(SCOPES, new Map())
    const work = createSessionWorkPrincipals(issuer, trust.contextForName(root, BINDINGS), BINDINGS)
    expect(work.forSession('s1')).toEqual({ kind: 'unavailable' })

    const provider = trust.contextForName(root, BINDINGS)
    provider.provide(BINDINGS, { ownerOf: (s: string) => (s === 's1' ? 'alice' : undefined) })
    expect(work.forSession('s1')).toEqual({ kind: 'issued', principal: 'principal:alice:s1' })
    expect(work.forSession('missing')).toEqual({ kind: 'unavailable' })
  })

  test('N-1 a bindings provider on the root label is not read', () => {
    const root = new Context()
    const trust = createTrust(SCOPES, new Map())
    const work = createSessionWorkPrincipals(issuer, trust.contextForName(root, BINDINGS), BINDINGS)
    root.provide(BINDINGS, { ownerOf: () => 'mallory' })
    expect(work.forSession('s1')).toEqual({ kind: 'unavailable' })
  })

  test('N-2 the instance holds no reference to the issuer', () => {
    const root = new Context()
    const trust = createTrust(SCOPES, new Map())
    const work = createSessionWorkPrincipals(issuer, trust.contextForName(root, BINDINGS), BINDINGS)
    const seen = new Set<unknown>()
    for (let o: object | null = work; o !== null; o = Object.getPrototypeOf(o)) {
      for (const key of Reflect.ownKeys(o)) {
        const d = Object.getOwnPropertyDescriptor(o, key)!
        seen.add(d.value)
        seen.add(d.get)
      }
    }
    expect(seen.has(issuer)).toBe(false)
    expect(Object.keys(work)).toEqual(['forSession'])
  })
})

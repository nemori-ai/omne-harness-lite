import type { AnswerOf } from '@omne-harness/access-cordis-contract'
import {
  capabilityId,
  type AssetRow,
  type CapabilityId,
  type CategoryEffect,
} from '@omne-harness/assets'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { readJsonText, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import { createAssetsContribution } from '../src/contribution.ts'
import type {
  CategoriesPort,
  ChangeListener,
  ManagementPort,
  TargetTenantPrincipals,
} from '../src/ports.ts'
import { fixtureLogin, loginIdentity, type FixtureLogin } from './fixtures/world.ts'

const limits: JsonLimits = {
  maxBytes: 1_000_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 1_000_000,
  maxNumberLength: 100,
}

type Operations = (typeof assetsProtocol)['operations']
type Name =
  | 'list-assets'
  | 'describe-asset'
  | 'create-asset'
  | 'begin-asset-upload'
  | 'append-asset-upload'
  | 'commit-asset-upload'
  | 'set-asset-enabled'
  | 'remove-asset'
  | 'query-asset-operation'
type Method = keyof ManagementPort

const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')

function id(category: string, name: string): CapabilityId {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('id')
  return made.id
}

const ROW: AssetRow = {
  capability: id('skill', 'review'),
  layer: 'tenant',
  asset: 'skill/review',
  version: 'sha256:00',
  selection: 'follow',
  enabled: false,
  holding: 'held-1',
  origin: 'customized',
  summary: { title: 'Review', description: 'Reviews.', facts: [{ name: 'files', text: '2' }] },
}
const ROW_WIRE = {
  category: 'skill',
  name: 'review',
  version: 'sha256:00',
  selection: 'follow',
  enabled: false,
  holding: 'held-1',
  origin: 'customized',
  summary: { title: 'Review', description: 'Reviews.', facts: [{ name: 'files', text: '2' }] },
}

const bodies = (target: FixtureLogin): Record<Name, unknown> => ({
  'list-assets': { tenant: target.tenantText, category: 'skill', after: null, limit: 10 },
  'describe-asset': { tenant: target.tenantText, category: 'skill', name: 'review' },
  'create-asset': {
    tenant: target.tenantText,
    operation: 'op-1',
    category: 'note',
    name: 'a',
    body: { a: 1 },
  },
  'begin-asset-upload': {
    tenant: target.tenantText,
    operation: 'up-1',
    category: 'skill',
    name: 'review',
    manifest: [{ path: 'SKILL.md', bytes: 9 }],
  },
  'append-asset-upload': {
    tenant: target.tenantText,
    upload: 'up-1',
    path: 'SKILL.md',
    offset: 0,
    bytes: 'IyBSZXZpZXcK',
  },
  'commit-asset-upload': { tenant: target.tenantText, upload: 'up-1' },
  'set-asset-enabled': {
    tenant: target.tenantText,
    operation: 'op-2',
    holding: 'held-1',
    enabled: false,
  },
  'remove-asset': { tenant: target.tenantText, operation: 'op-3', holding: 'held-1' },
  'query-asset-operation': {
    tenant: target.tenantText,
    operation: 'op-2',
    request: { kind: 'set-asset-enabled', holding: 'held-1', enabled: false },
  },
})

const METHOD: Record<Name, Method> = {
  'list-assets': 'list',
  'describe-asset': 'describe',
  'create-asset': 'createFromData',
  'begin-asset-upload': 'beginUpload',
  'append-asset-upload': 'appendUpload',
  'commit-asset-upload': 'createFromUpload',
  'set-asset-enabled': 'setEnabled',
  'remove-asset': 'remove',
  'query-asset-operation': 'recall',
}
const READS: readonly Name[] = ['list-assets', 'describe-asset', 'query-asset-operation']
const NAMES = Object.keys(METHOD) as Name[]

function setup(categories?: CategoriesPort) {
  const calls: { method: Method; input: Record<string, unknown> }[] = []
  const state = {
    refusal: undefined as 'denied' | 'basis-unavailable' | 'throw' | undefined,
    face: true,
    answer: undefined as unknown,
    throws: false,
  }
  const principals: TargetTenantPrincipals = {
    async actingFor(login, tenantText) {
      if (state.refusal === 'throw') throw new Error('identity is down')
      if (state.refusal !== undefined) return { refused: state.refusal }
      const caller = login as unknown as FixtureLogin
      return caller.tenantText === tenantText
        ? { ok: { account: caller.account } as never }
        : { refused: 'denied' }
    },
  }
  const face = new Proxy({} as ManagementPort, {
    get(_target, method: string) {
      return async (input: Record<string, unknown>) => {
        calls.push({ method: method as Method, input })
        if (state.throws) throw new Error('the reply was lost')
        return state.answer
      }
    },
  })
  const listeners: { tenant: string; listener: ChangeListener }[] = []
  const contribution = createAssetsContribution({
    settings: () => undefined,
    categories: () => categories,
    management: () => (state.face ? face : undefined),
    changes: () => ({
      subscribe(tenant, listener) {
        listeners.push({ tenant, listener })
        return () => {}
      },
    }),
    principals,
  })
  async function call<N extends Name>(name: N, target = ALICE, sample = bodies(target)[name]) {
    const read = readJsonText(JSON.stringify(sample), limits)
    if (read.kind !== 'ok') throw new Error('sample')
    const body = assetsProtocol.operations[name].body.read(read.value as JsonValue, limits)
    if (!body.ok) throw new Error(`${name} body did not read`)
    const handler = contribution.operations[name] as (
      context: unknown,
      value: unknown,
    ) => Promise<AnswerOf<Operations[N]>>
    return handler(
      { principal: loginIdentity(ALICE), messageId: 'm-1', signal: new AbortController().signal },
      body.value,
    )
  }
  return { state, calls, call, contribution, listeners }
}

function writes(name: Name, answer: Readonly<{ outcome: string; body?: unknown }>): boolean {
  if (!('body' in answer)) return true
  const outcomes = assetsProtocol.operations[name].outcomes as Record<string, unknown>
  const codec = outcomes[answer.outcome] as {
    write(value: unknown, at: JsonLimits): { ok: boolean }
  }
  return codec.write(answer.body, limits).ok
}

describe('the first two steps of every asset operation', () => {
  it.each(NAMES)(
    '%s: a login that may not act for the tenant is denied, and the face is not asked',
    async name => {
      const world = setup()
      expect(await world.call(name, BOB)).toEqual({ outcome: 'denied' })
      expect(world.calls).toEqual([])
    },
  )

  it.each(
    NAMES.flatMap(name =>
      (['denied', 'basis-unavailable', 'throw'] as const).map(refusal => [name, refusal] as const),
    ),
  )(
    '%s: the principal answering %s is answered as such, and the face is not asked',
    async (name, refusal) => {
      const world = setup()
      world.state.refusal = refusal
      expect(await world.call(name)).toEqual({
        outcome: refusal === 'denied' ? 'denied' : 'basis-unavailable',
      })
      expect(world.calls).toEqual([])
    },
  )

  it.each(NAMES)('%s: without the management face the answer is basis-unavailable', async name => {
    const world = setup()
    world.state.face = false
    expect(await world.call(name)).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('the third step: a face that throws', () => {
  it.each(NAMES)('%s: a read answers basis-unavailable, a commit unknown', async name => {
    const world = setup()
    world.state.throws = true
    expect(await world.call(name)).toEqual({
      outcome: READS.includes(name) ? 'basis-unavailable' : 'unknown',
    })
    expect(world.calls.map(c => c.method)).toEqual([METHOD[name]])
  })
})

describe('what each operation hands to the face', () => {
  it('the tenant text, the principal and the fields of the body, the operation as its id', async () => {
    const world = setup()
    world.state.answer = { kind: 'unavailable' }
    for (const name of NAMES) await world.call(name)
    const inputs = Object.fromEntries(world.calls.map(c => [c.method, c.input]))
    const acting = { tenant: ALICE.tenantText, principal: { account: ALICE.account } }
    expect(inputs).toMatchObject({
      list: { ...acting, category: 'skill', after: null, limit: 10 },
      describe: { ...acting, capability: id('skill', 'review') },
      createFromData: { ...acting, operationId: 'op-1', capability: id('note', 'a') },
      beginUpload: {
        ...acting,
        operationId: 'up-1',
        capability: id('skill', 'review'),
        entries: [{ path: 'SKILL.md', bytes: 9 }],
      },
      appendUpload: { ...acting, operationId: 'up-1', path: 'SKILL.md', offset: 0 },
      createFromUpload: { ...acting, operationId: 'up-1' },
      setEnabled: { ...acting, operationId: 'op-2', holding: 'held-1', enabled: false },
      remove: { ...acting, operationId: 'op-3', holding: 'held-1' },
      recall: {
        ...acting,
        operationId: 'op-2',
        request: { kind: 'setEnabled', holding: 'held-1', enabled: false },
      },
    })
    expect(Array.from(inputs['appendUpload']?.['bytes'] as Uint8Array)).toEqual(
      Array.from(new TextEncoder().encode('# Review\n')),
    )
  })

  it('a recall repeats each kind of request as the domain names it', async () => {
    const world = setup()
    world.state.answer = { kind: 'not-committed' }
    const manifest = [{ path: 'SKILL.md', bytes: 9 }]
    for (const request of [
      { kind: 'create-asset', category: 'note', name: 'a', body: { a: 1 } },
      { kind: 'begin-asset-upload', category: 'skill', name: 'review', manifest },
      { kind: 'commit-asset-upload' },
      { kind: 'remove-asset', holding: 'held-1' },
    ])
      await world.call('query-asset-operation', ALICE, {
        tenant: ALICE.tenantText,
        operation: 'op-9',
        request,
      })
    expect(world.calls.map(c => c.input['request'])).toEqual([
      { kind: 'create', capability: id('note', 'a') },
      { kind: 'begin', capability: id('skill', 'review'), entries: manifest },
      { kind: 'commit' },
      { kind: 'remove', holding: 'held-1' },
    ])
  })
})

const PUBLISH_TABLE = [
  [
    { kind: 'published', version: 'v1', holdingRef: 'held-1', changed: true },
    { outcome: 'succeeded', body: { version: 'v1', holding: 'held-1', changed: true } },
  ],
  [{ kind: 'denied' }, { outcome: 'denied' }],
  [{ kind: 'unavailable' }, { outcome: 'basis-unavailable' }],
  [{ kind: 'unknown-category' }, { outcome: 'not-found', body: {} }],
  [{ kind: 'conflict' }, { outcome: 'conflict', body: {} }],
  [{ kind: 'operation-conflict' }, { outcome: 'conflict', body: {} }],
  [
    { kind: 'invalid', reason: 'bad' },
    { outcome: 'invalid', body: { reason: 'bad' } },
  ],
  [{ kind: 'unknown', operationId: 'op-1' }, { outcome: 'unknown' }],
] as const

const HOLDING_TABLE = [
  [{ kind: 'changed' }, { outcome: 'succeeded', body: {} }],
  [{ kind: 'no-change' }, { outcome: 'no-change', body: {} }],
  [{ kind: 'absent' }, { outcome: 'not-found', body: {} }],
  [{ kind: 'denied' }, { outcome: 'denied' }],
  [{ kind: 'unavailable' }, { outcome: 'basis-unavailable' }],
  [{ kind: 'conflict' }, { outcome: 'conflict', body: {} }],
  [{ kind: 'operation-conflict' }, { outcome: 'conflict', body: {} }],
  [
    { kind: 'not-writable', reason: 'official' },
    { outcome: 'not-writable', body: { reason: 'official' } },
  ],
  [{ kind: 'unknown', operationId: 'op-2' }, { outcome: 'unknown' }],
] as const

const TABLES: Record<Name, readonly (readonly [unknown, unknown])[]> = {
  'list-assets': [
    [
      { kind: 'page', items: [ROW], next: 'review', completeness: 'complete' },
      {
        outcome: 'succeeded',
        body: { items: [ROW_WIRE], next: 'review', completeness: 'complete' },
      },
    ],
    [{ kind: 'denied' }, { outcome: 'denied' }],
    [{ kind: 'unavailable' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'invalid' }, { outcome: 'invalid', body: {} }],
    [{ kind: 'unknown-category' }, { outcome: 'not-found', body: {} }],
  ],
  'describe-asset': [
    [
      {
        kind: 'asset',
        row: ROW,
        revision: 3,
        content: { kind: 'directory', entries: [{ path: 'SKILL.md', bytes: 9 }] },
        standing: { kind: 'filtered', reason: 'disabled' },
        settings: true,
      },
      {
        outcome: 'succeeded',
        body: {
          item: ROW_WIRE,
          revision: 3,
          content: { kind: 'directory', entries: [{ path: 'SKILL.md', bytes: 9 }] },
          standing: { kind: 'filtered', reason: 'disabled', by: null },
          settings: true,
        },
      },
    ],
    [
      {
        kind: 'asset',
        row: { ...ROW, summary: null },
        revision: 1,
        content: { kind: 'data', body: { kind: 'null' } },
        standing: { kind: 'selected' },
        settings: false,
      },
      {
        outcome: 'succeeded',
        body: {
          item: { ...ROW_WIRE, summary: null },
          revision: 1,
          content: { kind: 'data', body: { kind: 'null' } },
          standing: { kind: 'selected' },
          settings: false,
        },
      },
    ],
    [{ kind: 'absent' }, { outcome: 'not-found', body: {} }],
    [{ kind: 'denied' }, { outcome: 'denied' }],
    [{ kind: 'unavailable' }, { outcome: 'basis-unavailable' }],
  ],
  'create-asset': PUBLISH_TABLE,
  'commit-asset-upload': [
    ...PUBLISH_TABLE,
    [{ kind: 'absent' }, { outcome: 'not-found', body: {} }],
    [
      { kind: 'incomplete', missing: ['SKILL.md'] },
      { outcome: 'invalid', body: { reason: 'incomplete', missing: ['SKILL.md'] } },
    ],
  ],
  'begin-asset-upload': [
    [
      { kind: 'accepted', partBytes: 8, received: [{ path: 'SKILL.md', bytes: 0 }] },
      { outcome: 'succeeded', body: { partBytes: 8, received: [{ path: 'SKILL.md', bytes: 0 }] } },
    ],
    [{ kind: 'denied' }, { outcome: 'denied' }],
    [{ kind: 'unavailable' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'unknown-category' }, { outcome: 'not-found', body: {} }],
    [{ kind: 'operation-conflict' }, { outcome: 'conflict', body: {} }],
    [{ kind: 'busy' }, { outcome: 'limited', body: {} }],
    [
      { kind: 'invalid', reason: 'limit-exceeded:files' },
      { outcome: 'invalid', body: { reason: 'limit-exceeded:files' } },
    ],
  ],
  'append-asset-upload': [
    [
      { kind: 'received', bytes: 9 },
      { outcome: 'succeeded', body: { received: 9 } },
    ],
    [{ kind: 'absent' }, { outcome: 'not-found', body: {} }],
    [{ kind: 'denied' }, { outcome: 'denied' }],
    [{ kind: 'unavailable' }, { outcome: 'basis-unavailable' }],
    [
      { kind: 'invalid', reason: 'beyond-declared' },
      { outcome: 'invalid', body: { reason: 'beyond-declared' } },
    ],
  ],
  'set-asset-enabled': HOLDING_TABLE,
  'remove-asset': HOLDING_TABLE,
  'query-asset-operation': [
    [{ kind: 'not-committed' }, { outcome: 'not-committed', body: {} }],
    [
      { kind: 'published', version: 'v1', holdingRef: 'held-1', changed: false },
      { outcome: 'succeeded', body: { version: 'v1', holding: 'held-1', changed: false } },
    ],
    [
      { kind: 'accepted', partBytes: 8, received: [] },
      { outcome: 'succeeded', body: { partBytes: 8, received: [] } },
    ],
    [{ kind: 'changed' }, { outcome: 'succeeded', body: {} }],
    [{ kind: 'no-change' }, { outcome: 'no-change', body: {} }],
    [{ kind: 'absent' }, { outcome: 'not-found', body: {} }],
    [{ kind: 'unknown-category' }, { outcome: 'not-found', body: {} }],
    [
      { kind: 'incomplete', missing: ['a'] },
      { outcome: 'invalid', body: { reason: 'incomplete', missing: ['a'] } },
    ],
    [
      { kind: 'invalid', reason: 'bad' },
      { outcome: 'invalid', body: { reason: 'bad' } },
    ],
    [
      { kind: 'not-writable', reason: 'removed' },
      { outcome: 'not-writable', body: { reason: 'removed' } },
    ],
    [{ kind: 'conflict' }, { outcome: 'conflict', body: {} }],
    [{ kind: 'operation-conflict' }, { outcome: 'conflict', body: {} }],
    [{ kind: 'busy' }, { outcome: 'limited', body: {} }],
    [{ kind: 'denied' }, { outcome: 'denied' }],
    [{ kind: 'unavailable' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'unknown', operationId: 'op-2' }, { outcome: 'basis-unavailable' }],
  ],
}

describe('the fourth step: one domain outcome, one wire outcome', () => {
  it.each(
    NAMES.flatMap(name => TABLES[name].map(([domain, wire]) => [name, domain, wire] as const)),
  )('%s: %j answers %j, and the answer writes on the wire', async (name, domain, wire) => {
    const world = setup()
    world.state.answer = domain
    const answer = await world.call(name)
    expect(answer).toEqual(wire)
    expect(writes(name, answer)).toBe(true)
  })
})

describe('describe-asset with a category that tells its effect', () => {
  const asset = {
    kind: 'asset',
    row: ROW,
    revision: 3,
    content: { kind: 'directory', entries: [{ path: 'SKILL.md', bytes: 9 }] },
    standing: { kind: 'filtered', reason: 'disabled' },
    settings: true,
  }
  const placement = (kind: 'placed' | 'unavailable'): CategoryEffect['placement'] => ({
    of: async () =>
      kind === 'unavailable'
        ? { kind, reason: 'the clients cannot be read now' }
        : {
            kind,
            places: [
              {
                point: 'shell.pages',
                key: '',
                id: 'weather',
                side: 'client',
                standing: 'in effect',
                says: '',
              },
              {
                point: 'tool.tools',
                key: 'weather__forecast',
                side: 'server',
                standing: 'not in effect',
                says: 'it is disabled',
              },
            ],
            clients: [{ label: 'desktop-1, connected', says: 'loaded' }],
            advice: null,
          },
  })
  const impact: CategoryEffect['impact'] = {
    of: async ({ change }) => ({
      kind: 'changes',
      lines: [
        { mark: '-', of: null, point: 'shell.pages', key: '', id: 'weather', says: `→ ${change}` },
        { mark: '~', of: 'notes', point: 'tool.tools', key: 'x', says: 'conflict → in effect' },
      ],
      loads: null,
      advice: null,
    }),
  }
  const categoriesWith = (effect: CategoryEffect) =>
    ({
      effectOf: () => effect,
      atPoint: (point: string) =>
        point === 'tool.tools' ? { category: 'tool', display: { title: '工具' } } : undefined,
    }) as unknown as CategoriesPort

  it('tells each place with its id, side, the category a server place falls in and its title, and what disabling and removing take back', async () => {
    const world = setup(categoriesWith({ placement: placement('placed'), impact }))
    world.state.answer = asset
    const answer = await world.call('describe-asset')
    expect(writes('describe-asset', answer)).toBe(true)
    const line = (change: string) => [
      { mark: '-', of: null, point: 'shell.pages', key: '', id: 'weather', says: `→ ${change}` },
      {
        mark: '~',
        of: 'notes',
        point: 'tool.tools',
        key: 'x',
        id: null,
        says: 'conflict → in effect',
      },
    ]
    expect('body' in answer && (answer.body as { effect?: unknown }).effect).toEqual({
      places: [
        {
          point: 'shell.pages',
          key: '',
          id: 'weather',
          side: 'client',
          category: null,
          categoryTitle: null,
          standing: 'in effect',
          says: '',
        },
        {
          point: 'tool.tools',
          key: 'weather__forecast',
          id: null,
          side: 'server',
          category: 'tool',
          categoryTitle: '工具',
          standing: 'not in effect',
          says: 'it is disabled',
        },
      ],
      clients: [{ label: 'desktop-1, connected', says: 'loaded' }],
      advice: null,
      disable: line('disable'),
      remove: line('remove'),
    })
  })

  it('leaves the effect out when where it is placed cannot be read now, or the category tells none', async () => {
    for (const categories of [
      categoriesWith({ placement: placement('unavailable'), impact }),
      { effectOf: () => undefined } as unknown as CategoriesPort,
    ]) {
      const world = setup(categories)
      world.state.answer = asset
      const answer = await world.call('describe-asset')
      expect(answer.outcome).toBe('succeeded')
      expect('body' in answer && 'effect' in (answer.body as object)).toBe(false)
    }
  })
})

describe('observe-assets', () => {
  it('opens for a login that may act for the tenant, subscribes to that tenant, and frames each change', async () => {
    const world = setup()
    const opened = await world.contribution.observations['observe-assets'](
      {
        principal: loginIdentity(ALICE),
        messageId: 'm-o',
        revision: 1,
        signal: new AbortController().signal,
      },
      { tenant: ALICE.tenant },
    )
    if (opened.outcome !== 'succeeded') throw new Error(opened.outcome)
    expect(await opened.frames.next()).toEqual({ done: false, value: { kind: 'changed' } })
    expect(world.listeners.map(one => one.tenant)).toEqual([ALICE.tenantText])
    world.listeners[0]?.listener.changed()
    expect(await opened.frames.next()).toEqual({ done: false, value: { kind: 'changed' } })
  })

  it('a login that may not act for the tenant is denied and nothing is subscribed', async () => {
    const world = setup()
    const opened = await world.contribution.observations['observe-assets'](
      {
        principal: loginIdentity(ALICE),
        messageId: 'm-o',
        revision: 1,
        signal: new AbortController().signal,
      },
      { tenant: BOB.tenant },
    )
    expect(opened).toEqual({ outcome: 'denied' })
    expect(world.listeners).toEqual([])
  })

  it('a login whose acting cannot be settled now answers basis-unavailable, not denied', async () => {
    const world = setup()
    world.state.refusal = 'basis-unavailable'
    const opened = await world.contribution.observations['observe-assets'](
      {
        principal: loginIdentity(ALICE),
        messageId: 'm-o',
        revision: 1,
        signal: new AbortController().signal,
      },
      { tenant: ALICE.tenant },
    )
    expect(opened).toEqual({ outcome: 'basis-unavailable' })
    expect(world.listeners).toEqual([])
  })
})

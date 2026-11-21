import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import type { Codec } from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
import { assetsProtocol } from '@omne-harness/assets-protocol'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const tenant = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})

function tree(value: unknown) {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}
function expectRoundTrip(codec: Codec<any>, sample: unknown) {
  const read = codec.read(tree(sample), limits)
  expect(read.ok).toBe(true)
  if (!read.ok) return
  const written = codec.write(read.value, limits)
  expect(written.ok).toBe(true)
  if (written.ok) expect(JSON.parse(writeJsonText(written.value))).toEqual(sample)
}
const rejects = (codec: Codec<any>, sample: unknown) =>
  expect(codec.read(tree(sample), limits).ok).toBe(false)

const table = {
  'list-settings': { identity: 'login', effect: 'read', limit: 'small' },
  'describe-setting': { identity: 'login', effect: 'read', limit: 'small' },
  'set-setting': { identity: 'login', effect: 'commit', limit: 'small' },
  'clear-setting': { identity: 'login', effect: 'commit', limit: 'small' },
  'list-categories': { identity: 'login', effect: 'read', limit: 'small' },
  'describe-category': { identity: 'login', effect: 'read', limit: 'small' },
  'list-assets': { identity: 'login', effect: 'read', limit: 'small' },
  'describe-asset': { identity: 'login', effect: 'read', limit: 'small' },
  'create-asset': { identity: 'login', effect: 'commit', limit: 'input' },
  'begin-asset-upload': { identity: 'login', effect: 'commit', limit: 'input' },
  'append-asset-upload': { identity: 'login', effect: 'commit', limit: 'input' },
  'commit-asset-upload': { identity: 'login', effect: 'commit', limit: 'small' },
  'set-asset-enabled': { identity: 'login', effect: 'commit', limit: 'small' },
  'remove-asset': { identity: 'login', effect: 'commit', limit: 'small' },
  'query-asset-operation': { identity: 'login', effect: 'read', limit: 'input' },
} as const

const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied']
const published = ['invalid', 'not-found', 'conflict', 'unknown']
const holding = ['no-change', 'not-found', 'not-writable', 'conflict', 'unknown']
const outcomes = {
  'list-settings': ['not-visible', 'conflict'],
  'describe-setting': ['not-visible', 'conflict'],
  'set-setting': ['no-change', 'not-visible', 'invalid', 'conflict', 'not-writable', 'unknown'],
  'clear-setting': ['no-change', 'not-visible', 'invalid', 'conflict', 'not-writable', 'unknown'],
  'list-categories': [],
  'describe-category': ['not-found'],
  'list-assets': ['not-found', 'invalid'],
  'describe-asset': ['not-found'],
  'create-asset': published,
  'begin-asset-upload': ['invalid', 'not-found', 'conflict', 'limited', 'unknown'],
  'append-asset-upload': ['not-found', 'invalid', 'unknown'],
  'commit-asset-upload': published,
  'set-asset-enabled': holding,
  'remove-asset': holding,
  'query-asset-operation': [
    'no-change',
    'not-committed',
    'not-found',
    'not-writable',
    'invalid',
    'conflict',
    'limited',
  ],
} as const

const operations = assetsProtocol.operations
type Name = keyof typeof operations

const asset = { kind: 'asset', category: 'tool', name: 'shell' }
const independent = { kind: 'independent', providerId: 'calendar', definitionId: 'environment' }
const declaration = {
  title: 'Invoke',
  purpose: 'Whether Shell may run',
  appliesAt: 'next call',
  clearEffect: 'falls back',
  group: { id: 'shell', title: 'Shell', description: 'Shell settings' },
}
const head = { owner: asset, item: 'invoke', revision: '7', declaration }
const views = {
  ordinary: {
    ...head,
    kind: 'ordinary',
    valueSchema: { type: 'integer', minimum: 1 },
    default: { kind: 'set', value: 3 },
    own: { kind: 'unset' },
    effective: { value: { kind: 'set', value: 3 }, source: 'default' },
    lockedBy: null,
    editable: { kind: 'yes' },
  },
  permission: {
    ...head,
    kind: 'permission',
    choices: [
      { value: 'deny', label: 'Deny', description: '', permitsOperation: false },
      { value: 'auto', label: 'Auto', description: 'no approval', permitsOperation: true },
    ],
    default: 'ask',
    own: 'auto',
    effective: { kind: 'value', value: 'ask', source: 'organization' },
    bound: ['deny', 'ask'],
    editable: { kind: 'no', reason: 'prohibited-above' },
  },
  prohibited: {
    ...head,
    kind: 'permission',
    choices: [],
    default: 'ask',
    own: null,
    effective: { kind: 'prohibited', by: 'organization' },
    bound: null,
    editable: { kind: 'no', reason: 'locked' },
  },
  secret: {
    ...head,
    kind: 'secret',
    own: 'unreadable',
    official: 'unreadable',
    editable: { kind: 'no', reason: 'not-a-source' },
  },
} as const

describe('assets/v1', () => {
  it('is assets major 1 with the setting, category and asset operations and one observation', () => {
    expect(assetsProtocol.name).toBe('assets')
    expect(assetsProtocol.major).toBe(1)
    expect(Object.keys(operations).sort()).toEqual(Object.keys(table).sort())
    expect(Object.keys(assetsProtocol.observations)).toEqual(['observe-assets'])
  })

  it('observe-assets needs a login, opens on a tenant and only says something changed', () => {
    const observation = assetsProtocol.observations['observe-assets']
    expect(observation.identity).toBe('login')
    expect(observation.ends).toEqual([])
    expect('countsAsAccess' in observation).toBe(false)
    expectRoundTrip(observation.open, { tenant })
    rejects(observation.open, {})
    expectRoundTrip(observation.frame, { kind: 'changed' })
    rejects(observation.frame, { kind: 'changed', revision: 3 })
  })

  it.each(Object.entries(table))(
    '%s has the identity, effect and limit of the table',
    (name, row) => {
      const operation = operations[name as Name]
      expect({
        identity: operation.identity,
        effect: operation.effect,
        limit: operation.limit,
      }).toEqual(row)
      expect('countsAsAccess' in operation).toBe(false)
      expect('carriesCredential' in operation).toBe(false)
    },
  )

  it.each(Object.entries(outcomes))('%s answers the outcomes of §9', (name, own) => {
    const operation = operations[name as Name]
    expect(Object.keys(operation.outcomes).sort()).toEqual([...always, ...own].sort())
    for (const fixed of ['protocol-rejected', 'basis-unavailable', 'denied', 'unknown'])
      if (fixed in operation.outcomes)
        expect(operation.outcomes[fixed as keyof typeof operation.outcomes]).toBe(true)
  })
})

describe('bodies', () => {
  const write = { tenant, owner: asset, item: 'invoke', operation: 'op-1', expectedRevision: '7' }

  it('every setting operation carries its target tenant in the body', () => {
    for (const [name, operation] of Object.entries(operations))
      if (name !== 'list-categories')
        rejects(operation.body, { owner: asset, item: 'invoke', after: null, limit: 10 })
  })

  const skill = { category: 'skill', name: 'review' }
  const manifest = [
    { path: 'SKILL.md', bytes: 120 },
    { path: 'scripts/run.mjs', bytes: 0 },
  ]
  const requests = {
    'describe-category': [{ category: 'skill' }, { category: '' }],
    'list-assets': [
      { tenant, category: 'skill', after: 'review', limit: 100 },
      { tenant, category: 'skill', after: null, limit: 101 },
    ],
    'describe-asset': [
      { tenant, ...skill },
      { tenant, category: 'skill' },
    ],
    'create-asset': [
      { tenant, operation: 'op-1', category: 'fixture', name: 'a', body: { depth: [1, 'a'] } },
      { tenant, category: 'fixture', name: 'a', body: {} },
    ],
    'begin-asset-upload': [
      { tenant, operation: 'up-1', ...skill, manifest },
      { tenant, operation: 'up-1', ...skill, manifest: [{ path: 'SKILL.md' }] },
    ],
    'append-asset-upload': [
      { tenant, upload: 'up-1', path: 'SKILL.md', offset: 0, bytes: 'IyBSZXZpZXcK' },
      { tenant, upload: 'up-1', path: 'SKILL.md', offset: -1, bytes: 'IyBSZXZpZXcK' },
    ],
    'commit-asset-upload': [
      { tenant, upload: 'up-1' },
      { tenant, operation: 'up-1' },
    ],
    'set-asset-enabled': [
      { tenant, operation: 'op-2', holding: 'held-1', enabled: false },
      { tenant, operation: 'op-2', ...skill, enabled: false },
    ],
    'remove-asset': [
      { tenant, operation: 'op-3', holding: 'held-1' },
      { tenant, holding: 'held-1' },
    ],
  } as const

  it.each(Object.entries(requests))(
    '%s reads its body and rejects one that is off by a field',
    (name, [good, bad]) => {
      const codec = operations[name as Name].body
      expectRoundTrip(codec, good)
      rejects(codec, bad)
    },
  )

  it('every asset operation but describe-category carries its target tenant', () => {
    for (const [name, [good]] of Object.entries(requests))
      if (name !== 'describe-category') {
        const { tenant: _tenant, ...withoutTenant } = good as Record<string, unknown>
        rejects(operations[name as Name].body, withoutTenant)
      }
  })

  it('an appended part is base64 text, read back to the same bytes', () => {
    const codec = operations['append-asset-upload'].body
    const read = codec.read(tree(requests['append-asset-upload'][0]), limits)
    expect(read.ok && Array.from(read.value.bytes)).toEqual(
      Array.from(new TextEncoder().encode('# Review\n')),
    )
    rejects(codec, { ...requests['append-asset-upload'][0], bytes: 'IyBSZXZpZXcK=' })
  })

  it('query-asset-operation names the operation and repeats the request of each kind', () => {
    const codec = operations['query-asset-operation'].body
    for (const request of [
      { kind: 'create-asset', category: 'fixture', name: 'a', body: { depth: 1 } },
      { kind: 'begin-asset-upload', ...skill, manifest },
      { kind: 'commit-asset-upload' },
      { kind: 'set-asset-enabled', holding: 'held-1', enabled: true },
      { kind: 'remove-asset', holding: 'held-1' },
    ])
      expectRoundTrip(codec, { tenant, operation: 'op-1', request })
    rejects(codec, { tenant, operation: 'op-1', request: { kind: 'append-asset-upload' } })
    rejects(codec, { tenant, request: { kind: 'commit-asset-upload' } })
  })

  it('list-categories carries no tenant: after is the next text or null, limit is a page limit', () => {
    const codec = operations['list-categories'].body
    expectRoundTrip(codec, { after: null, limit: 100 })
    expectRoundTrip(codec, { after: 'model-provider', limit: 1 })
    rejects(codec, { tenant, after: null, limit: 10 })
    rejects(codec, { after: null, limit: 101 })
    rejects(codec, { after: null })
  })

  it('list-settings asks for one half: the assets, narrowed to one or not, or the independent settings', () => {
    const codec = operations['list-settings'].body
    expectRoundTrip(codec, { tenant, scope: { kind: 'asset' }, after: null, limit: 100 })
    expectRoundTrip(codec, {
      tenant,
      scope: { kind: 'asset', asset: { name: 'shell' } },
      after: '20',
      limit: 1,
    })
    expectRoundTrip(codec, { tenant, scope: { kind: 'independent' }, after: null, limit: 100 })
    rejects(codec, { tenant, after: null, limit: 100 })
    rejects(codec, { tenant, asset: { name: 'shell' }, after: null, limit: 100 })
    rejects(codec, { tenant, scope: { kind: 'both' }, after: null, limit: 100 })
    rejects(codec, {
      tenant,
      scope: { kind: 'independent', asset: { name: 'shell' } },
      after: null,
      limit: 100,
    })
    rejects(codec, { tenant, scope: { kind: 'asset' }, after: null, limit: 101 })
    rejects(codec, { tenant, scope: { kind: 'asset' }, after: null })
  })

  it('describe-setting names one item of an asset or of an independent group', () => {
    const codec = operations['describe-setting'].body
    expectRoundTrip(codec, { tenant, owner: asset, item: 'invoke' })
    expectRoundTrip(codec, { tenant, owner: { kind: 'asset', name: 'shell' }, item: 'invoke' })
    expectRoundTrip(codec, { tenant, owner: independent, item: 'timezone' })
    rejects(codec, { tenant, owner: asset, item: '' })
    rejects(codec, { tenant, asset: { category: 'tool', name: 'shell' }, item: 'invoke' })
    rejects(codec, { tenant, owner: { kind: 'independent', providerId: 'calendar' }, item: 'x' })
    rejects(codec, { tenant, owner: { ...independent, name: 'shell' }, item: 'x' })
  })

  it('set-setting takes an ordinary value, a pick or a secret, never an allowed set', () => {
    const codec = operations['set-setting'].body
    expectRoundTrip(codec, { ...write, value: { kind: 'ordinary', value: { depth: [1, 'a'] } } })
    expectRoundTrip(codec, { ...write, value: { kind: 'permission', pick: 'auto' } })
    expectRoundTrip(codec, { ...write, value: { kind: 'secret', secret: 'sk' } })
    rejects(codec, { ...write, value: { kind: 'permission', pick: 'auto', allowed: ['auto'] } })
    rejects(codec, { ...write, expectedRevision: '07', value: { kind: 'permission', pick: 'a' } })
    rejects(codec, { ...write, operation: '', value: { kind: 'permission', pick: 'a' } })
  })

  it('clear-setting carries the operation and the revision it read', () => {
    const codec = operations['clear-setting'].body
    expectRoundTrip(codec, write)
    expectRoundTrip(codec, { ...write, owner: independent })
    rejects(codec, { tenant, owner: asset, item: 'invoke', operation: 'op-1' })
  })
})

describe('answers', () => {
  it('a listed page carries every kind of view, its next and its completeness', () => {
    const codec = operations['list-settings'].outcomes.succeeded
    expectRoundTrip(codec, { items: Object.values(views), next: '2', completeness: 'partial' })
    expectRoundTrip(codec, { items: [], next: null, completeness: 'complete' })
  })

  it('a view names its owner, asset or independent, and the group its item is in', () => {
    const codec = operations['describe-setting'].outcomes.succeeded
    expectRoundTrip(codec, { item: { ...views.ordinary, owner: independent } })
    rejects(codec, { item: { ...views.ordinary, owner: { kind: 'asset', name: 'shell' } } })
    rejects(codec, { item: { ...views.ordinary, asset: { category: 'tool', name: 'shell' } } })
    const { group: _group, ...withoutGroup } = declaration
    rejects(codec, { item: { ...views.ordinary, declaration: withoutGroup } })
  })

  it.each(Object.entries(views))('a described %s view carries its revision', (_, view) => {
    const codec = operations['describe-setting'].outcomes.succeeded
    expectRoundTrip(codec, { item: view })
    const { revision: _revision, ...withoutRevision } = view
    rejects(codec, { item: withoutRevision })
  })

  it('a page of categories carries each category with its name, summary and creation, and its next', () => {
    const codec = operations['list-categories'].outcomes.succeeded
    for (const creation of ['none', 'data', 'directory'])
      expectRoundTrip(codec, {
        items: [{ category: 'tool', title: '工具', summary: '代理可以调用的函数。', creation }],
        next: 'tool',
      })
    expectRoundTrip(codec, { items: [], next: null })
    rejects(codec, { items: [{ category: 'tool', title: '工具', summary: 's' }], next: null })
    rejects(codec, {
      items: [{ category: 'tool', title: '工具', summary: 's', creation: 'upload' }],
      next: null,
    })
  })

  it('a described category gives a data schema or the three directory limits, by its creation', () => {
    const codec = operations['describe-category'].outcomes.succeeded
    const head = { category: 'skill', title: '技能', summary: '一份带说明的目录。', hint: null }
    expectRoundTrip(codec, { ...head, creation: { kind: 'none' } })
    expectRoundTrip(codec, { ...head, hint: '选一个目录', creation: { kind: 'data', schema: {} } })
    const limits3 = { files: 200, fileBytes: 1_048_576, totalBytes: 8_388_608 }
    expectRoundTrip(codec, { ...head, creation: { kind: 'directory', limits: limits3 } })
    rejects(codec, { ...head, creation: { kind: 'directory' } })
    rejects(codec, { ...head, creation: { kind: 'none', schema: {} } })
  })

  const summary = {
    title: 'Review',
    description: 'Reviews a change.',
    facts: [{ name: 'files', text: '2' }],
  }
  const row = {
    category: 'skill',
    name: 'review',
    version: 'sha256:00',
    selection: 'follow',
    enabled: true,
    holding: 'held-1',
    origin: 'customized',
    summary,
  }

  it('a page of assets carries each row with its holding, origin and summary', () => {
    const codec = operations['list-assets'].outcomes.succeeded
    expectRoundTrip(codec, {
      items: [row, { ...row, name: 'plain', origin: 'official', enabled: false, summary: null }],
      next: 'review',
      completeness: 'partial',
    })
    expectRoundTrip(codec, { items: [], next: null, completeness: 'complete' })
    const { holding: _holding, ...withoutHolding } = row
    rejects(codec, { items: [withoutHolding], next: null, completeness: 'complete' })
    rejects(codec, {
      items: [{ ...row, summary: { ...summary, facts: Array(9).fill(summary.facts[0]) } }],
      next: null,
      completeness: 'complete',
    })
  })

  it('a described asset carries its row, revision, content, standing and whether it has settings', () => {
    const codec = operations['describe-asset'].outcomes.succeeded
    const base = { item: row, revision: 3, settings: true }
    for (const content of [
      { kind: 'data', body: { depth: 1 } },
      { kind: 'directory', entries: [{ path: 'SKILL.md', bytes: 120 }] },
    ])
      for (const standing of [
        { kind: 'selected' },
        { kind: 'filtered', reason: 'disabled', by: null },
        { kind: 'filtered', reason: 'blocked', by: 'organization' },
        { kind: 'unavailable', layer: 'tenant' },
      ])
        expectRoundTrip(codec, { ...base, content, standing })
    rejects(codec, { ...base, content: { kind: 'directory' }, standing: { kind: 'selected' } })
  })

  it('a creation answers the version, the holding and whether it changed; a refusal its reason', () => {
    for (const name of ['create-asset', 'commit-asset-upload'] as const) {
      const { succeeded, invalid } = operations[name].outcomes
      expectRoundTrip(succeeded, { version: 'sha256:00', holding: 'held-1', changed: false })
      rejects(succeeded, { version: 'sha256:00', holding: 'held-1' })
      expectRoundTrip(invalid, { reason: 'creation-closed' })
      expectRoundTrip(invalid, { reason: 'incomplete', missing: ['SKILL.md'] })
      rejects(invalid, {})
    }
  })

  it('an upload answers the part size and what has arrived; an append the bytes received', () => {
    expectRoundTrip(operations['begin-asset-upload'].outcomes.succeeded, {
      partBytes: 524_288,
      received: [{ path: 'SKILL.md', bytes: 0 }],
    })
    expectRoundTrip(operations['append-asset-upload'].outcomes.succeeded, { received: 120 })
  })

  it('a holding change that cannot be made says whether it is official or removed', () => {
    for (const name of ['set-asset-enabled', 'remove-asset'] as const) {
      const outcomes = operations[name].outcomes
      expectRoundTrip(outcomes.succeeded, {})
      for (const reason of ['official', 'removed'])
        expectRoundTrip(outcomes['not-writable'], { reason })
      rejects(outcomes['not-writable'], { reason: 'locked' })
    }
  })

  it('a recalled operation answers the success of whichever kind it was', () => {
    const codec = operations['query-asset-operation'].outcomes.succeeded
    expectRoundTrip(codec, { version: 'sha256:00', holding: 'held-1', changed: true })
    expectRoundTrip(codec, { partBytes: 1, received: [] })
    expectRoundTrip(codec, {})
    rejects(codec, { version: 'sha256:00' })
  })

  it('a write answers the new revision, and not-writable its reason', () => {
    for (const name of ['set-setting', 'clear-setting'] as const) {
      const { succeeded, 'not-writable': notWritable } = operations[name].outcomes
      expectRoundTrip(succeeded, { revision: '8' })
      for (const reason of ['locked', 'out-of-bound', 'prohibited-above', 'not-a-source'])
        expectRoundTrip(notWritable, { reason })
      rejects(notWritable, {})
    }
  })
})

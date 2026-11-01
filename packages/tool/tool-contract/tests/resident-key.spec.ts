// The resident key text and the stored shape (SPEC「常驻登记键与 shape 的文本编码」). Each case
// names the defect it catches: a key text that is not a function of the key, two writers that
// would compute different texts for the same key, a stored shape that does not read back, or a
// reader that drops a bad reference and returns the rest.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import {
  encodeResidentKey,
  projectResidentReferences,
  residentToolFacts,
  type ResidentReferencesPage,
  type SourceLayer,
} from '@omne-harness/tool-contract'
import {
  sameBindingKey,
  sameShape,
  type ToolBindingKey,
  type ToolShape,
} from '@omne-harness/tool-contract/provider'
import { testingTenant, testingWorkspace } from '@omne-harness/tool-contract/testing'

const ORG = 'org_c0nf0rmance000000000000000'
const ACC = 'acc_c0nf0rmance000000000000000'
const tenantA = () => testingTenant(ORG, ACC)
const tenantB = () =>
  testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000')
const WORKSPACE = 'wsp_c0nf0rmance000000000000000'

function key(layer: SourceLayer, revision = '1', name = 'read_file'): ToolBindingKey {
  return {
    layer,
    asset: {
      name,
      adoption: { owner: 'acme', name, revision, digest: `sha256:${name}-${revision}` },
    },
  }
}

const declared = (digest: string) =>
  ({
    kind: 'declared',
    schema: '{"type":"object"}',
    vocabulary: { owner: 'json-schema', name: 'draft-2020-12', digest },
  }) as const

const functionShape: ToolShape = {
  name: 'read_file',
  kind: 'function',
  parameters: declared('d1'),
}
const commandsShape: ToolShape = {
  name: 'git',
  kind: 'commands',
  commands: [
    { name: 'status', parameters: { kind: 'executor-owned' } },
    { name: 'commit', parameters: declared('d2') },
  ],
}

function layers(): readonly SourceLayer[] {
  const organization = tenantA().organization
  return [
    { kind: 'official' },
    { kind: 'organization', organization },
    { kind: 'tenant', tenant: tenantA() },
    { kind: 'workspace', workspace: testingWorkspace(WORKSPACE) },
  ]
}

function encoded(value: ToolBindingKey): string {
  const result = encodeResidentKey(value)
  if ('failure' in result) throw new Error(`encode: ${JSON.stringify(result.failure)}`)
  return result.ok
}

function stored(shape: ToolShape, at: ToolBindingKey = key({ kind: 'official' })): JsonValue {
  const facts = residentToolFacts(at, shape)
  if ('failure' in facts) throw new Error(`facts: ${JSON.stringify(facts.failure)}`)
  return facts.ok.shape
}

function page(...shapes: readonly JsonValue[]): ResidentReferencesPage {
  return {
    sessions: shapes.map((shape, index) => ({
      tenant: index % 2 === 0 ? tenantA() : tenantB(),
      session: 'session-1',
      capability: 'read_file',
      shape,
    })),
    next: 'opaque-next',
  }
}

describe('encodeResidentKey', () => {
  it('gives the rk1 eight-string array for each source layer', () => {
    const texts = layers().map(layer => JSON.parse(encoded(key(layer))) as string[])
    expect(texts.map(parts => parts.slice(0, 3))).toEqual([
      ['rk1', 'official', ''],
      ['rk1', 'organization', ORG],
      ['rk1', 'tenant', JSON.stringify({ organization: ORG, account: ACC })],
      ['rk1', 'workspace', WORKSPACE],
    ])
    for (const parts of texts)
      expect(parts.slice(3)).toEqual(['read_file', 'acme', 'read_file', '1', 'sha256:read_file-1'])
  })

  it('is deterministic: separately built equal keys give the same text', () => {
    for (const layer of layers()) expect(encoded(key(layer))).toBe(encoded(key(layer)))
    // A fresh tenant value minted from the same texts is the same layer.
    expect(encoded(key({ kind: 'tenant', tenant: tenantA() }))).toBe(
      encoded(key({ kind: 'tenant', tenant: tenantA() })),
    )
  })

  it('gives equal texts exactly when sameBindingKey holds', () => {
    const keys: ToolBindingKey[] = [
      ...layers().map(layer => key(layer)),
      ...layers().map(layer => key(layer, '2')),
      key({ kind: 'tenant', tenant: tenantB() }),
      key({ kind: 'official' }, '1', 'write_file'),
      // Texts that would collide under a naive join stay apart.
      key({ kind: 'official' }, '1', 'a","b'),
      {
        layer: { kind: 'official' },
        asset: { name: 'x', adoption: { owner: 'o', name: 'n', revision: 'r', digest: 'd' } },
      },
      {
        layer: { kind: 'official' },
        asset: { name: 'x', adoption: { owner: 'o', name: 'n', revision: 'r', digest: 'd' } },
      },
    ]
    for (const left of keys)
      for (const right of keys)
        expect(encoded(left) === encoded(right)).toBe(sameBindingKey(left, right))
  })

  it('refuses a workspace that was not minted, as sameSourceLayer treats it', () => {
    const copied = structuredClone(testingWorkspace(WORKSPACE))
    expect(encodeResidentKey(key({ kind: 'workspace', workspace: copied }))).toEqual({
      failure: { field: 'layer.workspace', reason: 'identity' },
    })
  })

  it('refuses an organization or tenant text that does not parse', () => {
    const organization = { name: 'OrganizationId', text: 'not-an-org' } as never
    expect(encodeResidentKey(key({ kind: 'organization', organization }))).toEqual({
      failure: { field: 'layer.organization', reason: 'identity' },
    })
    const tenant = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: ORG },
      account: { name: 'AccountId', text: 'acc_X' },
    } as never
    expect(encodeResidentKey(key({ kind: 'tenant', tenant }))).toEqual({
      failure: { field: 'layer.tenant', reason: 'identity' },
    })
  })

  it('names the empty or mistyped asset member', () => {
    const base = key({ kind: 'official' })
    expect(
      encodeResidentKey({
        ...base,
        asset: { ...base.asset, adoption: { ...base.asset.adoption, digest: '' } },
      }),
    ).toEqual({ failure: { field: 'asset.adoption.digest', reason: 'empty' } })
    expect(encodeResidentKey({ ...base, asset: { ...base.asset, name: 7 as never } })).toEqual({
      failure: { field: 'asset.name', reason: 'type' },
    })
    expect(encodeResidentKey({ ...base, layer: { kind: 'galaxy' } as never })).toEqual({
      failure: { field: 'layer.kind', reason: 'type' },
    })
  })
})

describe('residentToolFacts', () => {
  it('gives the asset name as capability and the key text', () => {
    const at = key({ kind: 'tenant', tenant: tenantA() })
    const facts = residentToolFacts(at, functionShape)
    if ('failure' in facts) throw new Error('facts')
    expect(facts.ok.capability).toBe('read_file')
    expect(facts.ok.key).toBe(encoded(at))
  })

  it('stores commands sorted by name, so the order of the input does not change the bytes', () => {
    const reversed: ToolShape = {
      ...commandsShape,
      commands: [...(commandsShape.kind === 'commands' ? commandsShape.commands : [])].reverse(),
    }
    expect(stored(reversed)).toEqual(stored(commandsShape))
    const value = stored(commandsShape)
    const commands =
      value.kind === 'object' ? value.entries.find(entry => entry.key === 'commands')?.value : null
    const names =
      commands?.kind === 'array'
        ? commands.items.map(item =>
            item.kind === 'object' && item.entries[0]?.value.kind === 'string'
              ? item.entries[0].value.value
              : null,
          )
        : null
    expect(names).toEqual(['commit', 'status'])
  })

  it('refuses a shape the reader would refuse, instead of storing it', () => {
    const empty = { ...functionShape, name: '' }
    expect(residentToolFacts(key({ kind: 'official' }), empty)).toEqual({
      failure: { field: 'shape.name', reason: 'empty' },
    })
  })

  it('fails on the key before it looks at the shape', () => {
    const copied = structuredClone(testingWorkspace(WORKSPACE))
    expect(residentToolFacts(key({ kind: 'workspace', workspace: copied }), functionShape)).toEqual(
      {
        failure: { field: 'layer.workspace', reason: 'identity' },
      },
    )
  })
})

describe('projectResidentReferences', () => {
  it('maps each reference to a holder with its tenant and the same shape, and keeps next', () => {
    const result = projectResidentReferences(page(stored(functionShape), stored(commandsShape)))
    if ('failure' in result) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.next).toBe('opaque-next')
    expect(result.ok.items.map(item => item.holder)).toEqual(['session-1', 'session-1'])
    expect(result.ok.items[0]?.tenant).toEqual(tenantA())
    expect(result.ok.items[1]?.tenant).toEqual(tenantB())
    expect(sameShape(result.ok.items[0]?.shape as ToolShape, functionShape)).toBe(true)
    expect(sameShape(result.ok.items[1]?.shape as ToolShape, commandsShape)).toBe(true)
  })

  it('keeps a null next and an empty page', () => {
    expect(projectResidentReferences({ sessions: [], next: null })).toEqual({
      ok: { items: [], next: null },
    })
  })

  const object = (...entries: readonly (readonly [string, JsonValue])[]): JsonValue => ({
    kind: 'object',
    entries: entries.map(([key, value]) => ({ key, value })),
  })
  const str = (value: string): JsonValue => ({ kind: 'string', value })
  const owned = object(['kind', str('executor-owned')])

  const refusals: readonly (readonly [string, JsonValue, string, string])[] = [
    [
      'an unknown kind',
      object(['name', str('t')], ['kind', str('other')], ['parameters', owned]),
      'shape.kind',
      'type',
    ],
    [
      'an extra member',
      object(
        ['name', str('t')],
        ['kind', str('function')],
        ['parameters', owned],
        ['extra', str('x')],
      ),
      'shape.extra',
      'type',
    ],
    [
      'a missing member',
      object(['name', str('t')], ['kind', str('function')]),
      'shape.parameters',
      'type',
    ],
    [
      'a duplicated member',
      object(
        ['name', str('t')],
        ['name', str('u')],
        ['kind', str('function')],
        ['parameters', owned],
      ),
      'shape.name',
      'type',
    ],
    [
      'an empty name',
      object(['name', str('')], ['kind', str('function')], ['parameters', owned]),
      'shape.name',
      'empty',
    ],
    [
      'a commands member on a function',
      object(
        ['name', str('t')],
        ['kind', str('function')],
        ['commands', { kind: 'array', items: [] }],
      ),
      'shape.commands',
      'type',
    ],
    [
      'a declared parameters without vocabulary digest',
      object(
        ['name', str('t')],
        ['kind', str('function')],
        [
          'parameters',
          object(
            ['kind', str('declared')],
            ['schema', str('{}')],
            ['vocabulary', object(['owner', str('o')], ['name', str('n')])],
          ),
        ],
      ),
      'shape.parameters.vocabulary.digest',
      'type',
    ],
    [
      'an executor-owned parameters with a schema',
      object(
        ['name', str('t')],
        ['kind', str('function')],
        ['parameters', object(['kind', str('executor-owned')], ['schema', str('{}')])],
      ),
      'shape.parameters.schema',
      'type',
    ],
    [
      'a command with an empty name',
      object(
        ['name', str('g')],
        ['kind', str('commands')],
        ['commands', { kind: 'array', items: [object(['name', str('')], ['parameters', owned])] }],
      ),
      'shape.commands[0].name',
      'empty',
    ],
    [
      'a number where a string belongs',
      object(
        ['name', { kind: 'number', lexeme: '1' }],
        ['kind', str('function')],
        ['parameters', owned],
      ),
      'shape.name',
      'type',
    ],
    [
      'a plain object instead of a JSON tree',
      { name: 't', kind: 'function' } as never,
      'shape',
      'type',
    ],
  ]

  for (const [name, bad, field, reason] of refusals)
    it(`fails the whole page on ${name}, naming the reference`, () => {
      expect(projectResidentReferences(page(stored(functionShape), bad))).toEqual({
        failure: { field: `sessions[1].${field}`, reason },
      })
    })
})

import { describe, expect, it } from 'vitest'
import { carrierRecordId } from '@omne-harness-lite/asset-model'
import { toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { evaluate, type NonConnectorEvaluationInput } from '../src/index.ts'
import {
  assignment,
  at,
  bob,
  cap,
  definition,
  e1,
  github,
  holding,
  mcp,
  root,
  shell,
  simple,
  tenant,
  tool,
  workspace,
} from './fixtures.ts'

function result(input: NonConnectorEvaluationInput) {
  const outcome = evaluate(input)
  if (!('ok' in outcome)) throw new Error(writeJsonLossless(outcome))
  return outcome.ok
}
function invalid(input: NonConnectorEvaluationInput, condition?: string): void {
  const outcome = evaluate(input)
  expect(Object.keys(outcome)).toEqual(['invalidInput'])
  if (!('invalidInput' in outcome)) throw new Error('expected invalid input')
  expect(outcome.invalidInput.diagnostics.length).toBeGreaterThan(0)
  if (condition !== undefined)
    expect(outcome.invalidInput.diagnostics[0]?.condition).toBe(condition)
}
describe('input conditions and multi-error priority', () => {
  it('C3 missing workspace rejects its holdings', () => {
    const { workspace: _workspace, ...base } = e1()
    invalid(base, 'C3')
  })
  it('C4 duplicate scope/identifier and duplicate item are rejected', () => {
    const base = simple()
    invalid({ ...base, holdings: [...base.holdings, holding('factory', shell, 'ast_value')] }, 'C4')
    invalid({
      ...base,
      holdings: [
        ...base.holdings,
        {
          ...holding('tenant', shell, 'ast_value', [
            assignment('timeout', 'PT1S'),
            assignment('timeout', 'PT2S'),
          ]),
          basis: { kind: 'official' },
        },
      ],
    })
  })
  it('C5 requires exactly one definition only for held records', () => {
    const base = simple()
    const held = base.definitions[1]
    if (held === undefined) throw new Error('fixture absent')
    invalid({ ...base, definitions: [...base.definitions, held] }, 'C5')
    const extra = definition('ast_unheld', shell, tool('shell'))
    expect(result({ ...base, definitions: [...base.definitions, extra, extra] })).toEqual(
      result(base),
    )
    invalid({
      ...base,
      definitions: base.definitions.map(entry =>
        entry.id === held.id ? { ...entry, capability: cap('tool', 'different') } : entry,
      ),
    })
  })
  it('C8 shared non-carrier workspace identity is rejected', () => {
    const base = e1()
    invalid(
      {
        ...base,
        holdings: base.holdings.map(entry =>
          entry.holder.layer === 'workspace' && entry.capability.category === 'mcp'
            ? { ...entry, asset: 'ast_t_github', basis: { kind: 'organization' } }
            : entry,
        ),
      },
      'C8',
    )
  })
  for (const selection of ['empty-current', 'missing-pinned'] as const)
    it(`C9 ${selection}`, () => {
      const base = simple()
      invalid(
        {
          ...base,
          ...(selection === 'empty-current'
            ? {
                definitions: base.definitions.map(entry =>
                  entry.id === 'ast_value'
                    ? { ...entry, draft: tool('shell'), versions: [] }
                    : entry,
                ),
              }
            : {
                holdings: base.holdings.map(entry =>
                  entry.asset === 'ast_value'
                    ? { ...entry, versionSelection: { kind: 'pinned', number: 2 } }
                    : entry,
                ),
              }),
        },
        'C9',
      )
    })
  it('disabled and locked-below records do not require resolvable versions', () => {
    const base = simple()
    const empty = definition('ast_empty', shell, tool('shell'), 'customized')
    const definitionEmpty = { ...empty, draft: tool('shell'), versions: [] }
    const disabled = {
      ...base,
      definitions: [...base.definitions, definitionEmpty],
      holdings: [
        ...base.holdings,
        holding('tenant', shell, empty.id, [assignment('disabled', true)]),
      ],
    }
    expect(result(disabled).assets.find(entry => entry.capability.name === 'shell')?.asset).toBe(
      'ast_value',
    )
    const locked = {
      ...base,
      definitions: [...base.definitions, definitionEmpty],
      holdings: [
        ...base.holdings.map(entry =>
          entry.asset === 'ast_value' ? { ...entry, immutable: true } : entry,
        ),
        holding('tenant', shell, empty.id),
      ],
    }
    expect(result(locked).assets.find(entry => entry.capability.name === 'shell')?.asset).toBe(
      'ast_value',
    )
  })
  it('C10 real duration Schema rejects a selected setting but ignores root and undeclared settings', () => {
    const base = simple()
    invalid(
      {
        ...base,
        session: [{ capability: shell, assignment: assignment('timeout', 'not-duration') }],
      },
      'C10',
    )
    expect(
      result({
        ...base,
        session: [
          { capability: root, assignment: assignment('timeout', 'not-duration') },
          { capability: shell, assignment: assignment('not-a-property', 'not-duration') },
        ],
      }),
    ).toEqual(result(base))
  })
  it('C11 duplicates and C14 duplicates/resident presence are rejected', () => {
    const base = simple()
    const repeated = { capability: shell, assignment: assignment('timeout', 'PT1S') }
    invalid({ ...base, session: [repeated, repeated] }, 'C11')
    invalid(
      {
        ...base,
        root: {
          definition: root,
          references: [{ capability: shell }, { capability: shell, resident: true }],
        },
      },
      'C14',
    )
    invalid(
      {
        ...base,
        root: { definition: root, references: [{ capability: github, resident: false }] },
      },
      'C14',
    )
  })
  it('C13 rejects not_fetched, wrong category, absent scope holding, and duplicates', () => {
    const base = e1()
    invalid(
      {
        ...base,
        mcpActionSets: [{ endpoint: github, scope: 'workspace', actions: { kind: 'not_fetched' } }],
      },
      'C13',
    )
    invalid(
      {
        ...base,
        mcpActionSets: [
          {
            endpoint: shell,
            scope: 'factory',
            actions: { kind: 'fetched', fetchedAt: at, tools: [] },
          },
        ],
      },
      'C13',
    )
    invalid(
      {
        ...base,
        mcpActionSets: [
          {
            endpoint: github,
            scope: 'organization',
            actions: { kind: 'fetched', fetchedAt: at, tools: [] },
          },
        ],
      },
      'C13',
    )
    invalid(
      { ...base, mcpActionSets: [...(base.mcpActionSets ?? []), ...(base.mcpActionSets ?? [])] },
      'C13',
    )
  })
  it('invalidInput precedes cycle and unsupported even when the violating assignment is visited later', () => {
    const base = simple()
    const plugin = cap('plugin', 'bundle')
    invalid(
      {
        ...base,
        definitions: [
          ...base.definitions,
          definition('ast_plugin', plugin, { category: 'plugin', members: [shell] }),
        ],
        holdings: [...base.holdings, holding('factory', plugin, 'ast_plugin')],
        root: {
          definition: root,
          references: [{ capability: plugin }, { capability: root }, { capability: shell }],
        },
        session: [{ capability: shell, assignment: assignment('execute', { allowed: ['yolo'] }) }],
      },
      'C10',
    )
  })
  it('getters are rejected without execution before availability inspection', () => {
    let accessed = 0
    const malformed = {
      ...simple(),
      get definitions(): NonConnectorEvaluationInput['definitions'] {
        accessed++
        throw new Error('must not run')
      },
    }
    invalid(malformed, 'C1')
    expect(accessed).toBe(0)
  })
})

describe('workspace restrictions, resident, version selection and caller ownership', () => {
  it('workspace stdio MCP and command hook are disabled before selection', () => {
    const base = simple()
    const hook = cap('loop_extension', 'hook')
    const mcpAsset = carrierRecordId(workspace, github)
    const hookAsset = carrierRecordId(workspace, hook)
    const input = {
      ...base,
      workspace,
      definitions: [
        ...base.definitions,
        definition(
          mcpAsset,
          github,
          {
            category: 'mcp',
            body: {
              transport: { kind: 'stdio', command: 'example', args: [] },
              timeouts: { connect: 'PT1S', call: 'PT1S' },
              permissions: { execute: { default: 'ask' } },
            },
          },
          'customized',
        ),
        definition(
          hookAsset,
          hook,
          {
            category: 'loop_extension',
            extension: {
              name: 'hook',
              position: 'before_action',
              power: 'observe',
              implementation: {
                kind: 'command',
                host: 'codex',
                dialect: 'sh',
                event: 'before_action',
                command: 'example',
              },
            },
          },
          'customized',
        ),
      ],
      holdings: [
        ...base.holdings,
        holding('workspace', github, mcpAsset),
        holding('workspace', hook, hookAsset),
      ],
      root: { definition: root, references: [{ capability: github }, { capability: hook }] },
    }
    const effective = result(input)
    expect(effective.composition).toEqual([])
    expect(effective.filteredOut).toEqual(
      expect.arrayContaining([
        { capability: github, from: 'workspace', reason: 'disabled' },
        { capability: hook, from: 'workspace', reason: 'disabled' },
      ]),
    )
  })
  it('pinned version governs declarations/references and current remains explicit', () => {
    const base = simple()
    const entry = base.definitions[1]
    if (entry === undefined) throw new Error('fixture absent')
    const versions = [
      ...entry.versions,
      { number: 2, content: tool('shell', 'PT2S', 'auto', ['missing']), publishedAt: at },
    ]
    const current = result({
      ...base,
      definitions: [base.definitions[0] ?? entry, { ...entry, versions }],
    })
    expect(current.assets.find(entry => entry.capability.name === 'shell')?.version).toBe(2)
    expect(current.unresolved).toEqual([
      { capability: cap('skill', 'missing'), referencedBy: shell },
    ])
    const pinned = result({
      ...base,
      definitions: [base.definitions[0] ?? entry, { ...entry, versions }],
      holdings: base.holdings.map(entry =>
        entry.asset === 'ast_value'
          ? { ...entry, versionSelection: { kind: 'pinned', number: 1 } }
          : entry,
      ),
    })
    expect(pinned.assets.find(entry => entry.capability.name === 'shell')?.version).toBe(1)
    expect(pinned.unresolved).toEqual([])
    expect(pinned.values.find(entry => entry.item === 'timeout')?.value).toBe('PT60S')
  })
  it('transitive tool/skill residents default false, and output ownership never freezes the input', () => {
    const base = e1()
    const before = writeJsonLossless(base)
    const effective = result(base)
    expect(writeJsonLossless(base)).toBe(before)
    expect(Object.isFrozen(base)).toBe(false)
    expect(Object.isFrozen(base.holdings[0])).toBe(false)
    expect(Object.isFrozen(effective)).toBe(true)
    expect(Object.isFrozen(effective.values[0]?.value)).toBe(true)
    expect(effective.assets.find(entry => entry.capability.name === 'shell')?.resident).toBe(true)
    expect(effective.assets.find(entry => entry.capability.name === 'audit')?.resident).toBe(false)
    expect(
      Object.hasOwn(
        effective.assets.find(entry => entry.capability.name === 'github') ?? {},
        'resident',
      ),
    ).toBe(false)
  })
  it('root body is opaque to composition and attributes', () => {
    const base = simple()
    const replaced = {
      ...base,
      definitions: base.definitions.map(entry =>
        entry.capability.category === 'agent_definition'
          ? {
              ...entry,
              versions: [
                {
                  number: 1,
                  content: {
                    category: 'agent_definition' as const,
                    body: toOpaqueJson({
                      references: [{ ...root }],
                      settings: [{ item: 'illegal', default: 1 }],
                    }),
                  },
                  publishedAt: at,
                },
              ],
            }
          : entry,
      ),
    }
    expect(result(replaced)).toEqual(result(base))
  })
})

describe('S42 tenant auto writing is a separate explicit fact', () => {
  const cases = [
    { name: 'no tenant holding', org: [], tenant: undefined, expected: true },
    {
      name: 'organization unlocked ask is only a pick',
      org: [assignment('execute', { allowed: ['ask'] })],
      tenant: undefined,
      expected: true,
    },
    {
      name: 'organization forbid is an unlocked bound',
      org: [assignment('execute', { allowed: ['forbid'] })],
      tenant: undefined,
      expected: false,
    },
    {
      name: 'organization bound includes auto',
      org: [assignment('execute', { allowed: ['auto', 'ask'] }, true)],
      tenant: undefined,
      expected: true,
    },
    {
      name: 'tenant immutable pick',
      org: [],
      tenant: [assignment('execute', { allowed: ['auto'] }, true)],
      expected: false,
    },
    {
      name: 'tenant unlocked forbid may be rewritten',
      org: [],
      tenant: [assignment('execute', { allowed: ['forbid'] })],
      expected: true,
    },
  ]
  for (const row of cases)
    it(row.name, () => {
      const base = simple()
      const input = {
        ...base,
        holdings: [
          ...base.holdings,
          {
            ...holding('organization', shell, 'ast_value', row.org),
            basis: { kind: 'official' as const },
          },
          ...(row.tenant === undefined
            ? []
            : [
                {
                  ...holding('tenant', shell, 'ast_value', row.tenant),
                  basis: { kind: 'official' as const },
                },
              ]),
        ],
      }
      expect(result(input).values.find(entry => entry.item === 'execute')?.tenantAutoWritable).toBe(
        row.expected,
      )
    })
  it('an organization bound still blocks auto when its custom asset is disabled', () => {
    const base = simple()
    const input = {
      ...base,
      definitions: [
        ...base.definitions,
        definition('ast_org', shell, tool('shell'), 'customized', bob, true),
        definition('ast_t', shell, tool('shell'), 'customized'),
      ],
      holdings: [
        ...base.holdings,
        holding('organization', shell, 'ast_org', [
          assignment('disabled', true),
          assignment('execute', { allowed: ['ask'] }, true),
        ]),
        holding('tenant', shell, 'ast_t'),
      ],
    }
    const execute = result(input).values.find(entry => entry.item === 'execute')
    expect(execute?.value).toEqual({ allowed: ['ask'] })
    expect(execute?.lockedAt).toBeUndefined()
    expect(execute?.tenantAutoWritable).toBe(false)
  })
})

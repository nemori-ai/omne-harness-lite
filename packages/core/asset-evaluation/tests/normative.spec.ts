import { describe, expect, it } from 'vitest'
import { carrierRecordId } from '@omne-harness-lite/asset-model'
import { writeJsonLossless, toOpaqueJson } from '@omne-harness-lite/content-blocks'
import {
  evaluate,
  readWorkspaceCarrier,
  type EffectiveAssembly,
  type EvaluationResult,
  type NonConnectorEvaluationInput,
} from '../src/index.ts'
import {
  assignment,
  at,
  audit,
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
  skill,
  tenant,
  tool,
  workspace,
} from './fixtures.ts'

const allowed = (...values: string[]) => ({ allowed: values })
const plain = (value: unknown): unknown => JSON.parse(writeJsonLossless(value))
function ok(input: NonConnectorEvaluationInput): EffectiveAssembly {
  const result = evaluate(input)
  if (!('ok' in result)) throw new Error(writeJsonLossless(result))
  return result.ok
}
const value = (
  capability: { readonly category: string; readonly name: string },
  item: string,
  v: unknown,
  from: string,
  extra = {},
) => ({ capability, item, value: v, from, ...extra })
const asset = (
  capability: { readonly category: string; readonly name: string },
  record: string,
  from: string,
  replaced: readonly string[] = [],
  extra = {},
) => ({ capability, asset: record, version: 1, from, replaced, ...extra })
function sets(
  result: EffectiveAssembly,
  expected: {
    root: unknown
    assets: readonly unknown[]
    composition: readonly unknown[]
    values: readonly unknown[]
    filteredOut: readonly unknown[]
    unresolved: readonly unknown[]
  },
): void {
  expect(plain(result.root)).toEqual(expected.root)
  for (const field of ['assets', 'composition', 'values', 'filteredOut', 'unresolved'] as const) {
    expect(plain(result[field])).toEqual(expect.arrayContaining([...expected[field]]))
    expect(result[field]).toHaveLength(expected[field].length)
  }
}

describe('E1 complete real body projection and E3 read-to-evaluate chain', () => {
  it('E1 compares root and all five sets in one evaluation', () => {
    const result = ok(e1())
    sets(result, {
      root,
      assets: [
        asset(root, 'ast_off_assistant', 'tenant'),
        asset(shell, 'ast_t_shell', 'tenant', ['factory', 'organization'], { resident: true }),
        asset(audit, 'ast_org_audit', 'organization', [], {
          lockedAt: 'organization',
          resident: false,
        }),
        asset(github, carrierRecordId(workspace, github), 'workspace', ['tenant']),
      ],
      composition: [shell, audit, github],
      values: [
        value(shell, 'timeout', 'PT45S', 'factory'),
        value(shell, 'execute', allowed('auto'), 'tenant', { tenantAutoWritable: true }),
        value(shell, 'usableBy', allowed('self'), 'factory'),
        value(audit, 'variant', 'quick', 'session'),
        value(audit, 'usableBy', allowed('self'), 'factory'),
        value(
          github,
          'connectionTarget',
          { kind: 'streamable_http', url: 'https://mcp.repo-tools.invalid' },
          'factory',
          { provenance: 'workspace' },
        ),
        value(github, 'connectTimeout', 'PT1S', 'factory'),
        value(github, 'callTimeout', 'PT10S', 'workspace'),
        value(github, 'execute:search', allowed('ask'), 'tenant', { tenantAutoWritable: false }),
        value(github, 'execute:push', allowed('ask'), 'factory', { tenantAutoWritable: false }),
        value(github, 'usableBy', allowed('self'), 'factory'),
      ],
      filteredOut: [
        { capability: audit, from: 'tenant', reason: 'locked_below' },
        { capability: audit, from: 'workspace', reason: 'locked_below' },
        { capability: github, from: 'workspace', reason: 'workspace_placement' },
        { capability: github, from: 'workspace', reason: 'workspace_permission' },
      ],
      unresolved: [{ capability: cap('skill', 'release-notes'), referencedBy: root }],
    })
    expect(plain(ok(e1()))).toEqual(plain(result))
    expect(result.values.some(entry => entry.item === 'credential')).toBe(false)
  })
  it('E1 all additional branches change only their hand-calculated fields', () => {
    const base = e1()
    const original = ok(base)
    const changed = ok({
      ...base,
      holdings: base.holdings.map(entry =>
        entry.asset === 'ast_t_shell'
          ? { ...entry, assignments: [assignment('execute', allowed('forbid'))] }
          : entry,
      ),
    })
    expect(plain(changed.assets)).toEqual(plain(original.assets))
    expect(plain(changed.composition)).toEqual(plain(original.composition))
    expect(plain(changed.filteredOut)).toEqual(plain(original.filteredOut))
    expect(plain(changed.unresolved)).toEqual(plain(original.unresolved))
    expect(
      plain(
        changed.values.filter(
          entry => !(entry.capability.name === 'shell' && entry.item === 'execute'),
        ),
      ),
    ).toEqual(
      plain(
        original.values.filter(
          entry => !(entry.capability.name === 'shell' && entry.item === 'execute'),
        ),
      ),
    )
    expect(
      plain(
        changed.values.find(entry => entry.capability.name === 'shell' && entry.item === 'execute'),
      ),
    ).toEqual(
      value(shell, 'execute', allowed('forbid'), 'tenant', {
        lockedAt: 'tenant',
        tenantAutoWritable: true,
      }),
    )
    expect(
      plain(
        ok({
          ...base,
          definitions: [
            ...base.definitions,
            definition('ast_extra', shell, tool('shell', 'PT5S'), 'customized'),
          ],
        }),
      ),
    ).toEqual(plain(original))
    const { mcpActionSets: _actions, ...noActions } = base
    const absent = ok(noActions)
    expect(plain(absent.values)).toEqual(
      plain(original.values.filter(entry => !entry.item.startsWith('execute:'))),
    )
    expect(plain(absent.filteredOut)).toEqual(plain(original.filteredOut))
    const locked = ok({
      ...base,
      holdings: base.holdings.map(entry =>
        entry.asset === 'ast_t_shell'
          ? { ...entry, assignments: [assignment('execute', allowed('auto'), true)] }
          : entry,
      ),
    })
    expect(
      plain(
        locked.values.find(entry => entry.capability.name === 'shell' && entry.item === 'execute'),
      ),
    ).toEqual(
      value(shell, 'execute', allowed('auto'), 'tenant', {
        lockedAt: 'tenant',
        tenantAutoWritable: false,
      }),
    )
    const disabled = ok({
      ...base,
      holdings: base.holdings.map(entry =>
        entry.asset === 'ast_t_shell'
          ? { ...entry, assignments: [...entry.assignments, assignment('disabled', true)] }
          : entry,
      ),
    })
    expect(
      disabled.values.find(entry => entry.capability.name === 'shell' && entry.item === 'execute')
        ?.tenantAutoWritable,
    ).toBe(false)
  })
  it('E3 retains values, drops only locks/unknown references, with no since', () => {
    const manifest = {
      format: 1,
      assets: [
        { capability: github, source: 'mcp/github.json' },
        { capability: audit, source: 'skills/audit' },
      ],
      assignments: [
        { capability: github, item: 'callTimeout', value: 'PT10S' },
        {
          capability: github,
          item: 'connectionTarget',
          value: { kind: 'streamable_http', url: 'https://evil.invalid' },
        },
        { capability: github, item: 'execute:search', value: allowed('auto') },
        { capability: audit, item: 'variant', value: 'lenient', immutable: true },
        { capability: root, item: 'default_model', value: 'model-x' },
      ],
      disabled: [shell],
    }
    const result = readWorkspaceCarrier(manifest, workspace)
    if (!('ok' in result)) throw new Error(writeJsonLossless(result))
    expect(plain(result.ok.dropped)).toEqual([
      { capability: audit, item: 'variant', reason: 'immutable_flag' },
      { capability: root, item: 'default_model', reason: 'unknown_asset' },
      { capability: shell, reason: 'unknown_asset' },
    ])
    expect(result.ok.holdings).toHaveLength(2)
    for (const entry of result.ok.holdings) {
      expect(Object.hasOwn(entry, 'since')).toBe(false)
      expect(entry.immutable).toBe(false)
      expect(
        entry.assignments.every(item => !Object.hasOwn(item, 'since') && item.immutable === false),
      ).toBe(true)
      expect(entry.asset).toBe(carrierRecordId(workspace, entry.capability))
    }
    const base = e1()
    const inputs = result.ok.holdings.map(entry => ({
      ...entry,
      since: at,
      assignments: entry.assignments.map(item => ({ ...item, since: at })),
    }))
    expect(
      plain(
        ok({
          ...base,
          holdings: [
            ...base.holdings.filter(entry => entry.holder.layer !== 'workspace'),
            ...inputs,
          ],
        }),
      ),
    ).toEqual(plain(ok(base)))
  })
})

describe('E2 disable first, E6 usable before locks', () => {
  it('E2a same-name workspace disabled leaves tenant asset', () => {
    const c = cap('skill', 'review')
    const ws = carrierRecordId(workspace, c)
    const input = {
      ...simple(c),
      workspace,
      holdings: [
        holding('factory', root, 'ast_root'),
        holding('tenant', c, 'ast_t'),
        holding('workspace', c, ws, [assignment('disabled', true)]),
      ],
      definitions: [
        definition('ast_root', root, { category: 'agent_definition', body: toOpaqueJson({}) }),
        definition('ast_t', c, skill('review'), 'customized'),
        definition(ws, c, skill('review'), 'customized'),
      ],
    }
    sets(ok(input), {
      root,
      assets: [
        asset(root, 'ast_root', 'factory'),
        asset(c, 'ast_t', 'tenant', [], { resident: false }),
      ],
      composition: [c],
      values: [value(c, 'usableBy', allowed('self'), 'factory')],
      filteredOut: [{ capability: c, from: 'workspace', reason: 'disabled' }],
      unresolved: [],
    })
  })
  it('E2b disjunction removes every holding of the disabled asset', () => {
    const base = simple()
    const result = ok({
      ...base,
      definitions: [
        base.definitions[0] ??
          definition('ast_root', root, { category: 'agent_definition', body: toOpaqueJson({}) }),
        definition('ast_lint', shell, tool('shell'), 'customized', tenant, true),
      ],
      holdings: [
        holding('factory', root, 'ast_root'),
        holding('organization', shell, 'ast_lint', [assignment('disabled', true)]),
        {
          ...holding('tenant', shell, 'ast_lint', [assignment('disabled', false)]),
          basis: { kind: 'organization' },
        },
      ],
    })
    sets(result, {
      root,
      assets: [asset(root, 'ast_root', 'factory')],
      composition: [],
      values: [],
      filteredOut: [
        { capability: shell, from: 'organization', reason: 'disabled' },
        { capability: shell, from: 'tenant', reason: 'disabled' },
      ],
      unresolved: [{ capability: shell, referencedBy: root }],
    })
  })
  for (const branch of ['A', 'B', 'C', 'D', 'E', 'F'] as const)
    it(`E6 ${branch}`, () => {
      const whose = branch === 'A' ? bob : tenant
      const c = cap('tool', 'fmt')
      const orgAssignments =
        branch === 'D'
          ? [assignment('usableBy', allowed('member'))]
          : branch === 'F'
            ? [assignment('usableBy', allowed('superAdministrator', 'member'), true)]
            : []
      const definitions = [
        definition('ast_root', root, { category: 'agent_definition', body: toOpaqueJson({}) }),
        definition('ast_off', c, tool('fmt')),
        definition('ast_org', c, tool('fmt'), 'customized', bob, true),
        definition('ast_t', c, tool('fmt'), 'customized'),
      ]
      const input = {
        ...simple(),
        tenant: whose,
        root: { definition: root, references: [{ capability: c }] },
        definitions,
        holdings: [
          holding('factory', root, 'ast_root', [], false, whose),
          ...(branch === 'C' ? [] : [holding('factory', c, 'ast_off', [], false, whose)]),
          holding(
            'organization',
            c,
            'ast_org',
            orgAssignments,
            branch === 'E' || branch === 'F',
            whose,
          ),
          ...(branch === 'E' || branch === 'F' ? [holding('tenant', c, 'ast_t')] : []),
        ],
      }
      const result = ok(input)
      const chosen =
        branch === 'C'
          ? undefined
          : branch === 'B'
            ? 'ast_off'
            : branch === 'E'
              ? 'ast_t'
              : 'ast_org'
      const u =
        branch === 'D'
          ? value(c, 'usableBy', allowed('member'), 'organization')
          : branch === 'F'
            ? value(c, 'usableBy', allowed('superAdministrator', 'member'), 'organization', {
                lockedAt: 'organization',
              })
            : value(c, 'usableBy', allowed('self'), 'factory')
      sets(result, {
        root,
        assets: [
          asset(root, 'ast_root', 'factory'),
          ...(chosen === undefined
            ? []
            : [
                asset(
                  c,
                  chosen,
                  branch === 'B' ? 'factory' : branch === 'E' ? 'tenant' : 'organization',
                  branch === 'B' ? [] : ['factory'],
                  { resident: false, ...(branch === 'F' ? { lockedAt: 'organization' } : {}) },
                ),
              ]),
        ],
        composition: chosen === undefined ? [] : [c],
        values:
          chosen === undefined
            ? []
            : [
                u,
                value(c, 'timeout', 'PT60S', 'factory'),
                value(c, 'execute', allowed('ask'), 'factory', {
                  tenantAutoWritable: branch !== 'F',
                }),
              ],
        filteredOut: ['B', 'C', 'E'].includes(branch)
          ? [{ capability: c, from: 'organization', reason: 'not_usable' }]
          : branch === 'F'
            ? [{ capability: c, from: 'tenant', reason: 'locked_below' }]
            : [],
        unresolved: chosen === undefined ? [{ capability: c, referencedBy: root }] : [],
      })
    })
})

describe('E5 invalid input is a complete rejection', () => {
  const mutations: readonly {
    name: string
    mutate: (input: NonConnectorEvaluationInput) => NonConnectorEvaluationInput
  }[] = [
    {
      name: 'foreign holder tenant',
      mutate: input => ({
        ...input,
        holdings: input.holdings.map((entry, index) =>
          index === 2 ? { ...entry, holder: { layer: 'tenant', tenant: bob } } : entry,
        ),
      }),
    },
    {
      name: 'foreign workspace',
      mutate: input => ({ ...input, workspace: { ...workspace, tenant: bob } }),
    },
    {
      name: 'official disabled',
      mutate: input => ({
        ...input,
        holdings: input.holdings.map((entry, index) =>
          index === 4
            ? { ...entry, assignments: [...entry.assignments, assignment('disabled', true)] }
            : entry,
        ),
      }),
    },
    {
      name: 'wrong root category',
      mutate: input => ({ ...input, root: { ...input.root, definition: shell } }),
    },
    {
      name: 'missing held definition',
      mutate: input => ({
        ...input,
        definitions: input.definitions.filter(entry => entry.id !== 'ast_t_audit'),
      }),
    },
    {
      name: 'factory assignment',
      mutate: input => ({
        ...input,
        holdings: input.holdings.map((entry, index) =>
          index === 3 ? { ...entry, assignments: [assignment('timeout', 'PT90S')] } : entry,
        ),
      }),
    },
    {
      name: 'permission outside domain',
      mutate: input => ({
        ...input,
        holdings: input.holdings.map((entry, index) =>
          index === 5 ? { ...entry, assignments: [assignment('execute', allowed('yolo'))] } : entry,
        ),
      }),
    },
    {
      name: 'ineffective member',
      mutate: input => ({ ...input, standing: { standing: 'ineffective' } }),
    },
    {
      name: 'resident on MCP',
      mutate: input => ({
        ...input,
        root: {
          ...input.root,
          references: input.root.references.map(entry =>
            entry.capability.category === 'mcp' ? { ...entry, resident: true } : entry,
          ),
        },
      }),
    },
  ]
  for (const mutation of mutations)
    it(mutation.name, () => {
      const result = evaluate(mutation.mutate(e1()))
      expect(Object.keys(result)).toEqual(['invalidInput'])
    })
  it('missing references is C1, never empty composition', () => {
    // @ts-expect-error Deliberately missing required input.
    const result = evaluate({ ...e1(), root: { definition: root } })
    expect(Object.keys(result)).toEqual(['invalidInput'])
  })
})

describe('E7/E8 cycle and unsupported categories with fixed priority', () => {
  it('E7 A root recursion fails and B skill/tool permitted recursion succeeds', () => {
    const c = cap('skill', 'style')
    const t = cap('tool', 'format')
    const base = {
      ...simple(c),
      definitions: [
        definition(
          'ast_root',
          root,
          { category: 'agent_definition', body: toOpaqueJson({}) },
          'customized',
        ),
        definition('ast_skill', c, skill('style', undefined, ['format'])),
        definition('ast_tool', t, tool('format', 'PT60S', 'ask', ['style'])),
      ],
      holdings: [
        holding('tenant', root, 'ast_root'),
        holding('factory', c, 'ast_skill'),
        holding('factory', t, 'ast_tool'),
      ],
    }
    const cycle = evaluate({
      ...base,
      root: { definition: root, references: [{ capability: t }, { capability: root }] },
    })
    expect(plain(cycle)).toEqual({ compositionCycle: { cycle: [root] } })
    const success = ok(base)
    sets(success, {
      root,
      assets: [
        asset(root, 'ast_root', 'tenant'),
        asset(c, 'ast_skill', 'factory', [], { resident: false }),
        asset(t, 'ast_tool', 'factory', [], { resident: false }),
      ],
      composition: [c, t],
      values: [
        value(c, 'usableBy', allowed('self'), 'factory'),
        value(t, 'usableBy', allowed('self'), 'factory'),
        value(t, 'timeout', 'PT60S', 'factory'),
        value(t, 'execute', allowed('ask'), 'factory', { tenantAutoWritable: true }),
      ],
      filteredOut: [],
      unresolved: [],
    })
  })
  it('E7 C disabled root is unresolved without referencedBy and does not walk refs', () => {
    const c = cap('skill', 'style')
    const t = cap('tool', 'format')
    const base = simple(c)
    const result = ok({
      ...base,
      definitions: [
        definition(
          'ast_root',
          root,
          { category: 'agent_definition', body: toOpaqueJson({}) },
          'customized',
        ),
        definition('ast_skill', c, skill('style', undefined, ['format'])),
        definition('ast_tool', t, tool('format', 'PT60S', 'ask', ['style'])),
      ],
      holdings: [
        holding('tenant', root, 'ast_root', [assignment('disabled', true)]),
        holding('factory', c, 'ast_skill'),
        holding('factory', t, 'ast_tool'),
      ],
      root: { definition: root, references: [{ capability: t }, { capability: root }] },
    })
    sets(result, {
      root,
      assets: [asset(c, 'ast_skill', 'factory'), asset(t, 'ast_tool', 'factory')],
      composition: [],
      values: [],
      filteredOut: [{ capability: root, from: 'tenant', reason: 'disabled' }],
      unresolved: [{ capability: root }],
    })
  })
  for (const category of ['agent_definition', 'plugin'] as const)
    it(`E8 ${category} supported shell is insufficient to assemble`, () => {
      const base = simple()
      const c = cap(category, 'extra')
      const content =
        category === 'plugin'
          ? { category: 'plugin' as const, members: [shell] }
          : { category: 'agent_definition' as const, body: toOpaqueJson({}) }
      const input = {
        ...base,
        root: { definition: root, references: [{ capability: shell }, { capability: c }] },
        definitions: [...base.definitions, definition('ast_extra', c, content)],
        holdings: [...base.holdings, holding('factory', c, 'ast_extra')],
      }
      expect(plain(evaluate(input))).toEqual({ categoryUnsupported: { category } })
      expect(
        plain(
          evaluate({
            ...input,
            root: { definition: root, references: [{ capability: c }, { capability: root }] },
          }),
        ),
      ).toEqual({ compositionCycle: { cycle: [root] } })
    })
  it('E8 C disabled plugin is unresolved, never unsupported', () => {
    const base = simple()
    const c = cap('plugin', 'bundle')
    const result = ok({
      ...base,
      root: { definition: root, references: [{ capability: shell }, { capability: c }] },
      definitions: [
        ...base.definitions,
        definition('ast_plugin', c, { category: 'plugin', members: [shell] }, 'customized'),
      ],
      holdings: [
        ...base.holdings,
        holding('tenant', c, 'ast_plugin', [assignment('disabled', true)]),
      ],
    })
    sets(result, {
      root,
      assets: [
        asset(root, 'ast_root', 'factory'),
        asset(shell, 'ast_value', 'factory', [], { resident: false }),
      ],
      composition: [shell],
      values: [
        value(shell, 'usableBy', allowed('self'), 'factory'),
        value(shell, 'timeout', 'PT60S', 'factory'),
        value(shell, 'execute', allowed('ask'), 'factory', { tenantAutoWritable: true }),
      ],
      filteredOut: [{ capability: c, from: 'tenant', reason: 'disabled' }],
      unresolved: [{ capability: c, referencedBy: root }],
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  carrierRecordId,
  DISABLED_DECLARATION,
  USABLE_BY_DECLARATION,
  type AssetHolding,
  type AssetVersion,
  type AttributeDeclaration,
  type CapabilityId,
} from '@omne-harness-lite/asset-model'
import { toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { computeEvaluation, type EvaluationFacts } from '../src/compute.ts'
import {
  readWorkspaceCarrier,
  type EffectiveAssembly,
  type NonConnectorEvaluationInput,
} from '../src/index.ts'
import {
  assignment,
  audit,
  bob,
  cap,
  definition,
  e1,
  github,
  holding,
  root,
  shell,
  simple,
  skill,
  tenant,
  tool,
  workspace,
  at,
} from './fixtures.ts'

// Normative examples supply their selected-version declarations/references as
// facts. These run the actual shared four-step kernel. Real public body derivation
// has separate cases in normative.spec.ts and body-domain.spec.ts.
const p = (...allowed: string[]) => ({ allowed })
const timeout = (seconds: number): AttributeDeclaration => ({
  item: 'timeout_s',
  kind: 'setting',
  category: 'preference',
  domain: { kind: 'open', schema: { type: 'integer', minimum: 1 } },
  default: seconds,
})
const execution: AttributeDeclaration = {
  item: 'execution',
  kind: 'permission',
  domain: { kind: 'enum', values: ['forbid', 'auto', 'ask'] },
  default: 'ask',
}
const network: AttributeDeclaration = {
  item: 'network',
  kind: 'permission',
  domain: { kind: 'enum', values: ['允许', '禁止'] },
  default: '禁止',
}
const setting = (item: string, defaultValue: string): AttributeDeclaration => ({
  item,
  kind: 'setting',
  category: 'preference',
  domain: { kind: 'open', schema: { type: 'string' } },
  default: defaultValue,
})
function given(
  input: NonConnectorEvaluationInput,
  declared: (holding: AssetHolding) => readonly AttributeDeclaration[],
  referenced: (version: AssetVersion) => readonly CapabilityId[] = () => [],
) {
  const declarations = new Map<AssetHolding, readonly AttributeDeclaration[]>()
  const references = new Map<AssetVersion, readonly CapabilityId[]>()
  for (const entry of input.holdings)
    declarations.set(entry, [DISABLED_DECLARATION, USABLE_BY_DECLARATION, ...declared(entry)])
  for (const record of input.definitions)
    for (const version of record.versions) references.set(version, referenced(version))
  const facts: EvaluationFacts = { declarations, references }
  return computeEvaluation(input, facts)
}
function successful(result: ReturnType<typeof given>): EffectiveAssembly {
  if (!('ok' in result)) throw new Error(writeJsonLossless(result))
  return result.ok
}
const asset = (
  capability: CapabilityId,
  id: string,
  from: string,
  replaced: readonly string[] = [],
  extra = {},
) => ({ capability, asset: id, version: 1, from, replaced, ...extra })
const value = (capability: CapabilityId, item: string, v: unknown, from: string, extra = {}) => ({
  capability,
  item,
  value: v,
  from,
  ...extra,
})
function sets(
  result: EffectiveAssembly,
  expected: {
    root: CapabilityId
    assets: readonly unknown[]
    composition: readonly unknown[]
    values: readonly unknown[]
    filteredOut: readonly unknown[]
    unresolved: readonly unknown[]
  },
): void {
  expect(result.root).toEqual(expected.root)
  for (const field of ['assets', 'composition', 'values', 'filteredOut', 'unresolved'] as const) {
    expect(JSON.parse(writeJsonLossless(result[field]))).toEqual(
      expect.arrayContaining([...expected[field]]),
    )
    expect(result[field]).toHaveLength(expected[field].length)
  }
}
function originalE1(): NonConnectorEvaluationInput {
  const base = e1()
  return {
    ...base,
    holdings: base.holdings.map(entry => ({
      ...entry,
      assignments: entry.assignments.map(a =>
        a.item === 'execute'
          ? { ...a, item: 'execution' }
          : a.item === 'timeout'
            ? { ...a, item: 'timeout_s', value: 120 }
            : a.item === 'callTimeout'
              ? { ...a, value: 10 }
              : a.item === 'connectionTarget'
                ? { ...a, value: 'https://evil.invalid' }
                : a,
      ),
    })),
  }
}
function e1Result(input: NonConnectorEvaluationInput): EffectiveAssembly {
  return successful(
    given(input, entry => {
      if (entry.capability.category === 'tool')
        return entry.asset === 'ast_t_shell'
          ? [timeout(45), execution]
          : [timeout(60), execution, network]
      if (entry.capability.category === 'skill')
        return [
          setting(
            'variant',
            entry.asset === 'ast_org_audit'
              ? 'standard'
              : entry.asset === 'ast_t_audit'
                ? 'light'
                : 'repo',
          ),
        ]
      if (entry.capability.category !== 'mcp') return []
      const ws = entry.holder.layer === 'workspace'
      const actions = input.mcpActionSets?.find(
        x => x.scope === entry.holder.layer && x.endpoint.name === entry.capability.name,
      )
      return [
        {
          item: 'connectionTarget',
          kind: 'setting',
          category: 'placement_identity',
          domain: { kind: 'open', schema: { type: 'string' } },
          default: ws ? 'https://mcp.repo-tools.invalid' : 'https://mcp.github.invalid',
        },
        {
          item: 'credential',
          kind: 'setting',
          category: 'placement_identity',
          domain: { kind: 'open', schema: { type: 'string' } },
        },
        {
          item: 'callTimeout',
          kind: 'setting',
          category: 'preference',
          domain: { kind: 'open', schema: { type: 'integer', minimum: 1 } },
          default: ws ? 20 : 30,
        },
        ...(actions?.actions.kind === 'fetched'
          ? actions.actions.tools.map(action => ({
              item: `execute:${action.name}`,
              kind: 'permission' as const,
              domain: { kind: 'enum' as const, values: ['forbid', 'auto', 'ask'] },
              default: ws ? 'auto' : 'ask',
            }))
          : []),
      ]
    }),
  )
}
const e1Expected = {
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
    value(shell, 'timeout_s', 45, 'factory'),
    value(shell, 'execution', p('auto'), 'tenant', { tenantAutoWritable: true }),
    value(shell, 'usableBy', p('self'), 'factory'),
    value(audit, 'variant', 'quick', 'session'),
    value(audit, 'usableBy', p('self'), 'factory'),
    value(github, 'connectionTarget', 'https://mcp.repo-tools.invalid', 'factory', {
      provenance: 'workspace',
    }),
    value(github, 'callTimeout', 10, 'workspace'),
    value(github, 'execute:search', p('ask'), 'tenant', { tenantAutoWritable: false }),
    value(github, 'execute:push', p('ask'), 'factory', { tenantAutoWritable: false }),
    value(github, 'usableBy', p('self'), 'factory'),
  ],
  filteredOut: [
    { capability: audit, from: 'tenant', reason: 'locked_below' },
    { capability: audit, from: 'workspace', reason: 'locked_below' },
    { capability: github, from: 'workspace', reason: 'workspace_placement' },
    { capability: github, from: 'workspace', reason: 'workspace_permission' },
  ],
  unresolved: [{ capability: cap('skill', 'release-notes'), referencedBy: root }],
}
describe('original given normative sets through the actual shared kernel', () => {
  it('E1 ten values, root and all five sets, replay and four additional branches', () => {
    const input = originalE1()
    const result = e1Result(input)
    sets(result, e1Expected)
    expect(e1Result(input)).toEqual(result)
    const changed = e1Result({
      ...input,
      holdings: input.holdings.map(h =>
        h.asset === 'ast_t_shell'
          ? { ...h, assignments: [assignment('execution', p('forbid'))] }
          : h,
      ),
    })
    sets(changed, {
      ...e1Expected,
      values: e1Expected.values.map(v =>
        v.item === 'execution'
          ? value(shell, 'execution', p('forbid'), 'tenant', {
              lockedAt: 'tenant',
              tenantAutoWritable: true,
            })
          : v,
      ),
    })
    sets(
      e1Result({
        ...input,
        definitions: [
          ...input.definitions,
          definition('ast_x_shell', shell, tool('shell', 'PT5S'), 'customized'),
        ],
      }),
      e1Expected,
    )
    const { mcpActionSets: _actions, ...noActions } = input
    sets(e1Result(noActions), {
      ...e1Expected,
      values: e1Expected.values.filter(v => !v.item.startsWith('execute:')),
    })
    const locked = e1Result({
      ...input,
      holdings: input.holdings.map(h =>
        h.asset === 'ast_t_shell'
          ? { ...h, assignments: [assignment('execution', p('auto'), true)] }
          : h,
      ),
    })
    sets(locked, {
      ...e1Expected,
      values: e1Expected.values.map(v =>
        v.item === 'execution'
          ? value(shell, 'execution', p('auto'), 'tenant', {
              lockedAt: 'tenant',
              tenantAutoWritable: false,
            })
          : v,
      ),
    })
    expect(
      e1Result({
        ...input,
        holdings: input.holdings.map(h =>
          h.asset === 'ast_t_shell'
            ? { ...h, assignments: [...h.assignments, assignment('disabled', true)] }
            : h,
        ),
      }).values.find(v => v.item === 'execution')?.tenantAutoWritable,
    ).toBe(false)
  })
  it('E3 original numeric/URL assignments read to the original E1 result', () => {
    const input = originalE1()
    const manifest = {
      format: 1,
      assets: [
        { capability: github, source: 'mcp/github.json' },
        { capability: audit, source: 'skills/audit' },
      ],
      assignments: [
        { capability: github, item: 'callTimeout', value: 10 },
        { capability: github, item: 'connectionTarget', value: 'https://evil.invalid' },
        { capability: github, item: 'execute:search', value: p('auto') },
        { capability: audit, item: 'variant', value: 'lenient', immutable: true },
        { capability: shell, item: 'timeout_s', value: 8 },
      ],
      disabled: [shell],
    }
    const read = readWorkspaceCarrier(manifest, workspace)
    if (!('ok' in read)) throw new Error(writeJsonLossless(read))
    expect(read.ok.dropped).toEqual([
      { capability: audit, item: 'variant', reason: 'immutable_flag' },
      { capability: shell, item: 'timeout_s', reason: 'unknown_asset' },
      { capability: shell, reason: 'unknown_asset' },
    ])
    const completed = read.ok.holdings.map(h => ({
      ...h,
      since: at,
      assignments: h.assignments.map(a => ({ ...a, since: at })),
    }))
    expect(completed).toEqual(input.holdings.filter(h => h.holder.layer === 'workspace'))
    sets(
      e1Result({
        ...input,
        holdings: [...input.holdings.filter(h => h.holder.layer !== 'workspace'), ...completed],
      }),
      e1Expected,
    )
  })
  for (const branch of ['A', 'B', 'C', 'D', 'E', 'F'] as const)
    it(`E6 ${branch} only the original reserved items`, () => {
      const c = cap('tool', 'fmt')
      const whose = branch === 'A' ? bob : tenant
      const helper = cap('agent_definition', 'helper6')
      const defs = [
        definition('ast_off_helper6', helper, {
          category: 'agent_definition',
          body: toOpaqueJson({}),
        }),
        definition('ast_off_fmt', c, tool('fmt')),
        definition('ast_org_fmt', c, tool('fmt'), 'customized', bob, true),
        definition('ast_t_fmt', c, tool('fmt'), 'customized'),
      ]
      const input: NonConnectorEvaluationInput = {
        tenant: whose,
        standing: { standing: 'effective', role: 'member' },
        definitions: defs,
        root: { definition: helper, references: [{ capability: c }] },
        holdings: [
          holding('factory', helper, 'ast_off_helper6', [], false, whose),
          ...(branch === 'C' ? [] : [holding('factory', c, 'ast_off_fmt', [], false, whose)]),
          holding(
            'organization',
            c,
            'ast_org_fmt',
            branch === 'D'
              ? [assignment('usableBy', p('member'))]
              : branch === 'F'
                ? [assignment('usableBy', p('superAdministrator', 'member'), true)]
                : [],
            branch === 'E' || branch === 'F',
            whose,
          ),
          ...(branch === 'E' || branch === 'F' ? [holding('tenant', c, 'ast_t_fmt')] : []),
        ],
      }
      const chosen =
        branch === 'C'
          ? undefined
          : branch === 'B'
            ? 'ast_off_fmt'
            : branch === 'E'
              ? 'ast_t_fmt'
              : 'ast_org_fmt'
      sets(successful(given(input, () => [])), {
        root: helper,
        assets: [
          asset(helper, 'ast_off_helper6', 'factory'),
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
                branch === 'D'
                  ? value(c, 'usableBy', p('member'), 'organization')
                  : branch === 'F'
                    ? value(c, 'usableBy', p('superAdministrator', 'member'), 'organization', {
                        lockedAt: 'organization',
                      })
                    : value(c, 'usableBy', p('self'), 'factory'),
              ],
        filteredOut: ['B', 'C', 'E'].includes(branch)
          ? [{ capability: c, from: 'organization', reason: 'not_usable' }]
          : branch === 'F'
            ? [{ capability: c, from: 'tenant', reason: 'locked_below' }]
            : [],
        unresolved: chosen === undefined ? [{ capability: c, referencedBy: helper }] : [],
      })
    })
  for (const branch of ['A', 'B', 'C'] as const)
    it(`E7 ${branch} exact original given declarations and reciprocal references`, () => {
      const helper = cap('agent_definition', 'helper7'),
        c = cap('skill', 'style'),
        t = cap('tool', 'format')
      const input: NonConnectorEvaluationInput = {
        ...simple(),
        root: {
          definition: helper,
          references:
            branch === 'B' ? [{ capability: c }] : [{ capability: t }, { capability: helper }],
        },
        definitions: [
          definition(
            'ast_t_helper7',
            helper,
            { category: 'agent_definition', body: toOpaqueJson({}) },
            'customized',
          ),
          definition('ast_off_style', c, skill('style', undefined, ['format'])),
          definition('ast_off_format', t, tool('format', 'PT60S', 'ask', ['style'])),
        ],
        holdings: [
          holding(
            'tenant',
            helper,
            'ast_t_helper7',
            branch === 'C' ? [assignment('disabled', true)] : [],
          ),
          holding('factory', c, 'ast_off_style'),
          holding('factory', t, 'ast_off_format'),
        ],
      }
      const outcome = given(
        input,
        () => [],
        version =>
          version.content.category === 'skill'
            ? [t]
            : version.content.category === 'tool'
              ? [c]
              : [],
      )
      if (branch === 'A') expect(outcome).toEqual({ compositionCycle: { cycle: [helper] } })
      else
        sets(successful(outcome), {
          root: helper,
          assets: [
            ...(branch === 'B' ? [asset(helper, 'ast_t_helper7', 'tenant')] : []),
            asset(c, 'ast_off_style', 'factory', [], branch === 'B' ? { resident: false } : {}),
            asset(t, 'ast_off_format', 'factory', [], branch === 'B' ? { resident: false } : {}),
          ],
          composition: branch === 'B' ? [c, t] : [],
          values:
            branch === 'B'
              ? [
                  value(c, 'usableBy', p('self'), 'factory'),
                  value(t, 'usableBy', p('self'), 'factory'),
                ]
              : [],
          filteredOut:
            branch === 'B' ? [] : [{ capability: helper, from: 'tenant', reason: 'disabled' }],
          unresolved: branch === 'B' ? [] : [{ capability: helper }],
        })
    })
  it('E8 disabled plugin succeeds with the complete original reserved-only sets', () => {
    const helper = cap('agent_definition', 'helper8'),
      plugin = cap('plugin', 'dev'),
      t = cap('tool', 'shell')
    const input: NonConnectorEvaluationInput = {
      ...simple(),
      root: { definition: helper, references: [{ capability: t }, { capability: plugin }] },
      definitions: [
        definition('ast_off_helper8', helper, {
          category: 'agent_definition',
          body: toOpaqueJson({}),
        }),
        definition('ast_off_shell', t, tool('shell')),
        definition('ast_t_dev', plugin, { category: 'plugin', members: [t] }, 'customized'),
      ],
      holdings: [
        holding('factory', helper, 'ast_off_helper8'),
        holding('factory', t, 'ast_off_shell'),
        holding('tenant', plugin, 'ast_t_dev', [assignment('disabled', true)]),
      ],
    }
    sets(successful(given(input, () => [])), {
      root: helper,
      assets: [
        asset(helper, 'ast_off_helper8', 'factory'),
        asset(t, 'ast_off_shell', 'factory', [], { resident: false }),
      ],
      composition: [t],
      values: [value(t, 'usableBy', p('self'), 'factory')],
      filteredOut: [{ capability: plugin, from: 'tenant', reason: 'disabled' }],
      unresolved: [{ capability: plugin, referencedBy: helper }],
    })
  })
})

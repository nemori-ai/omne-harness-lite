import { describe, expect, it } from 'vitest'
import {
  DISABLED_DECLARATION,
  USABLE_BY_DECLARATION,
  type AssetHolding,
  type AssetVersion,
  type AttributeDeclaration,
  type CapabilityId,
} from '@omne-harness-lite/asset-model'
import { toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { computeEvaluation, type EvaluationFacts } from '../src/compute.ts'
import type { EffectiveAssembly, NonConnectorEvaluationInput } from '../src/index.ts'
import { assignment, cap, definition, holding, shell, simple, tool } from './fixtures.ts'

// E4 supplies declarations as its given facts. They are fed into the same private
// computation used by public evaluate, without inventing a real ToolDefinition port.
const helper = cap('agent_definition', 'helper3')
const timeout = (defaultValue: number): AttributeDeclaration => ({
  item: 'timeout_s',
  kind: 'setting',
  category: 'preference',
  domain: { kind: 'open', schema: { type: 'integer', minimum: 1 } },
  default: defaultValue,
})
const execution = (defaultValue: string): AttributeDeclaration => ({
  item: 'execution',
  kind: 'permission',
  domain: { kind: 'enum', values: ['forbid', 'auto', 'ask'] },
  default: defaultValue,
})
const network: AttributeDeclaration = {
  item: 'network',
  kind: 'permission',
  domain: { kind: 'enum', values: ['允许', '禁止'] },
  default: '禁止',
}
const p = (...allowed: string[]) => ({ allowed })
const plain = (value: unknown): unknown => JSON.parse(writeJsonLossless(value))
function compare(
  result: EffectiveAssembly,
  expected: {
    assets: readonly unknown[]
    values: readonly unknown[]
    filteredOut: readonly unknown[]
  },
): void {
  expect(result.root).toEqual(helper)
  expect(result.composition).toEqual([shell])
  expect(result.unresolved).toEqual([])
  for (const field of ['assets', 'values', 'filteredOut'] as const) {
    expect(plain(result[field])).toEqual(expect.arrayContaining([...expected[field]]))
    expect(result[field]).toHaveLength(expected[field].length)
  }
}
function inputOf(
  branch: 'A' | 'B' | 'C' | 'D' | 'E',
  unlockedNetwork = false,
): { input: NonConnectorEvaluationInput; facts: EvaluationFacts } {
  const definitions = [
    definition('ast_off_helper3', helper, { category: 'agent_definition', body: toOpaqueJson({}) }),
    definition('ast_off_shell', shell, tool('shell', 'PT60S', branch === 'E' ? 'auto' : 'ask')),
    definition('ast_t_shell', shell, tool('shell', 'PT45S'), 'customized'),
  ]
  const org =
    branch === 'E'
      ? [assignment('execution', p('ask', 'forbid'), true)]
      : [
          assignment('timeout_s', 120, true),
          assignment('execution', p(branch === 'D' ? 'forbid' : 'ask'), branch !== 'D'),
          assignment('network', p('允许'), !unlockedNetwork),
        ]
  const holdings = [
    holding('factory', helper, 'ast_off_helper3'),
    holding('factory', shell, 'ast_off_shell'),
    {
      ...holding('organization', shell, 'ast_off_shell', org, branch === 'B'),
      basis: { kind: 'official' as const },
    },
    ...(branch === 'E'
      ? []
      : branch === 'C' || branch === 'D'
        ? [
            {
              ...holding('tenant', shell, 'ast_off_shell', [assignment('execution', p('auto'))]),
              basis: { kind: 'official' as const },
            },
          ]
        : [holding('tenant', shell, 'ast_t_shell')]),
  ]
  const input: NonConnectorEvaluationInput = {
    ...simple(),
    root: { definition: helper, references: [{ capability: shell, resident: true }] },
    definitions,
    holdings,
  }
  const declarations = new Map<AssetHolding, readonly AttributeDeclaration[]>()
  const references = new Map<AssetVersion, readonly CapabilityId[]>()
  for (const entry of holdings) {
    declarations.set(entry, [
      DISABLED_DECLARATION,
      USABLE_BY_DECLARATION,
      ...(entry.capability.category !== 'tool'
        ? []
        : entry.asset === 'ast_t_shell'
          ? [timeout(45), execution('ask')]
          : [timeout(60), execution(branch === 'E' ? 'auto' : 'ask'), network]),
    ])
  }
  for (const entry of definitions) for (const version of entry.versions) references.set(version, [])
  return { input, facts: { declarations, references } }
}
function evaluated(
  branch: 'A' | 'B' | 'C' | 'D' | 'E',
  unlockedNetwork = false,
): EffectiveAssembly {
  const { input, facts } = inputOf(branch, unlockedNetwork)
  const result = computeEvaluation(input, facts)
  if (!('ok' in result)) throw new Error(writeJsonLossless(result))
  return result.ok
}
const value = (item: string, v: unknown, from: string, extra = {}) => ({
  capability: shell,
  item,
  value: v,
  from,
  ...extra,
})
describe('the complete original E4 given declarations and five expected result sets', () => {
  for (const branch of ['A', 'B', 'C', 'D', 'E'] as const)
    it(`E4 ${branch}`, () => {
      compare(evaluated(branch), {
        assets: [
          {
            capability: helper,
            asset: 'ast_off_helper3',
            version: 1,
            from: 'factory',
            replaced: [],
          },
          {
            capability: shell,
            asset: branch === 'A' ? 'ast_t_shell' : 'ast_off_shell',
            version: 1,
            from: branch === 'A' || branch === 'C' || branch === 'D' ? 'tenant' : 'organization',
            replaced: branch === 'A' ? ['factory', 'organization'] : [],
            resident: true,
            ...(branch === 'B' ? { lockedAt: 'organization' } : {}),
          },
        ],
        values: [
          value('usableBy', p('self'), 'factory'),
          value(
            'timeout_s',
            branch === 'A' ? 45 : branch === 'E' ? 60 : 120,
            branch === 'A' || branch === 'E' ? 'factory' : 'organization',
            branch === 'A' || branch === 'E' ? {} : { lockedAt: 'organization' },
          ),
          value(
            'execution',
            p(branch === 'D' ? 'forbid' : 'ask'),
            branch === 'D' || branch === 'E' ? 'organization' : 'factory',
            { lockedAt: 'organization', tenantAutoWritable: false },
          ),
          value(
            'network',
            branch === 'A' ? p() : branch === 'E' ? p('禁止') : p('允许'),
            branch === 'E' ? 'factory' : 'organization',
            branch === 'E' ? {} : { lockedAt: 'organization' },
          ),
        ],
        filteredOut:
          branch === 'B' ? [{ capability: shell, from: 'tenant', reason: 'locked_below' }] : [],
      })
    })
  it('E4 A additional unlocked network pick does not create a missing permission', () => {
    const locked = evaluated('A')
    const unlocked = evaluated('A', true)
    expect(unlocked).toEqual({
      ...locked,
      values: locked.values.filter(entry => entry.item !== 'network'),
    })
  })
})

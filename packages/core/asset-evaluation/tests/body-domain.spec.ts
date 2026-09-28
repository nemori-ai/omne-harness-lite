import { describe, expect, it } from 'vitest'
import { createAssetModelJudge } from '@omne-harness-lite/asset-model'
import { toOpaqueJson, writeJsonLossless, type JsonValue } from '@omne-harness-lite/content-blocks'
import { toolBodyContract } from '@omne-harness-lite/tool-definition'
import { loopExtensionBodyContract } from '@omne-harness-lite/loop-extension'
import { skillBodyContract } from '@omne-harness-lite/skill-package/v2'
import { mcpBodyContract } from '@omne-harness-lite/mcp-endpoint'
import { slashCommandBodyContract } from '@omne-harness-lite/slash-command'
import {
  BodyProviderUnavailableError,
  defaultBodyContracts,
  evaluate,
  type EvaluationInput,
  type NonConnectorEvaluationInput,
} from '../src/index.ts'
import {
  cap,
  definition,
  holding,
  root,
  shell,
  skill,
  tool,
  mcp,
  simple,
  at,
  tenant,
} from './fixtures.ts'

function assembled(input: NonConnectorEvaluationInput) {
  const result = evaluate(input)
  if (!('ok' in result)) throw new Error(writeJsonLossless(result))
  return result.ok
}
function unavailable(input: EvaluationInput): void {
  // @ts-expect-error Runtime-domain controls deliberately exercise the unavailable full domain.
  expect(() => evaluate(input)).toThrow(BodyProviderUnavailableError)
}

describe('precise current body-provider domain', () => {
  it('default construction contains the five released real ports', () => {
    expect(Object.keys(defaultBodyContracts).sort()).toEqual([
      'loop_extension',
      'mcp',
      'skill',
      'slash_command',
      'tool',
    ])
    expect(Object.isFrozen(defaultBodyContracts)).toBe(true)
    expect(Object.values(defaultBodyContracts).every(port => Object.isFrozen(port))).toBe(true)
    expect(defaultBodyContracts.tool).toBe(toolBodyContract)
    expect(defaultBodyContracts.loop_extension).toBe(loopExtensionBodyContract)
    expect(defaultBodyContracts.skill).toBe(skillBodyContract)
    expect(defaultBodyContracts.mcp).toBe(mcpBodyContract)
    expect(defaultBodyContracts.slash_command).toBe(slashCommandBodyContract)
  })
  const connector = { category: 'connector', name: 'external' } as const
  const actual = { category: 'connector', body: {} } as const
  for (const position of ['record', 'draft', 'current', 'historical', 'unheld'] as const)
    it(`actual ${position} Connector is technical unavailability`, () => {
      const base = simple()
      const entry = base.definitions[1]
      if (entry === undefined) throw new Error('fixture absent')
      const unavailableDefinition =
        position === 'record'
          ? { ...entry, capability: connector }
          : position === 'draft'
            ? { ...entry, draft: actual }
            : position === 'historical'
              ? {
                  ...entry,
                  versions: [
                    { number: 1, content: actual, publishedAt: at },
                    ...entry.versions.map(version => ({ ...version, number: 2 })),
                  ],
                }
              : {
                  ...entry,
                  ...(position === 'unheld' ? { id: 'ast_unheld' } : {}),
                  versions: [{ number: 1, content: actual, publishedAt: at }],
                }
      unavailable({
        ...base,
        definitions:
          position === 'unheld'
            ? [...base.definitions, unavailableDefinition]
            : [base.definitions[0] ?? entry, unavailableDefinition],
      })
    })
  it('ordinary Connector references are unresolved and a held identifier without a definition is C5', () => {
    const base = simple()
    const result = assembled({
      ...base,
      root: {
        definition: root,
        references: [{ capability: connector }],
        attributes: [],
        source: { asset: 'ast_root', version: 1 },
      },
    })
    expect(result.composition).toEqual([])
    expect(result.unresolved).toEqual([{ capability: connector, referencedBy: root }])
    expect(
      evaluate({
        ...base,
        holdings: [...base.holdings, holding('tenant', connector, 'ast_missing')],
      }),
    ).toHaveProperty('invalidInput.diagnostics.0.condition', 'C5')
  })
  it('opaque JSON and body data named category never recursively constrain availability', () => {
    const base = simple()
    const rootRecord = base.definitions[0]
    if (rootRecord === undefined) throw new Error('fixture absent')
    const result = assembled({
      ...base,
      definitions: [
        {
          ...rootRecord,
          versions: [
            {
              number: 1,
              content: {
                category: 'agent_definition',
                body: toOpaqueJson({
                  category: 'connector',
                  definitions: [
                    { capability: connector, draft: actual, versions: [{ content: actual }] },
                  ],
                }),
              },
              publishedAt: at,
            },
          ],
        },
        definition('ast_value', shell, {
          category: 'tool',
          definition: {
            name: 'shell',
            description: 'category: connector',
            paradigm: 'single',
            origin: { kind: 'authored' },
            input: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  const: 'connector',
                  description: 'ordinary JSON category value',
                },
              },
            },
            permissions: { execute: { default: 'ask' } },
          },
        }),
      ],
    })
    expect(result.composition).toEqual([shell])
  })
})

describe('real five ports to AssetModel and evaluation', () => {
  const skillId = cap('skill', 'review')
  const mcpId = cap('mcp', 'remote')
  const loopId = cap('loop_extension', 'guard')
  const slashId = cap('slash_command', 'review')
  const definitions = [
    definition('ast_root', root, { category: 'agent_definition', body: toOpaqueJson({}) }),
    definition('ast_tool', shell, tool('shell')),
    definition('ast_skill', skillId, skill('review', undefined, ['shell'])),
    definition('ast_mcp', mcpId, mcp()),
    definition('ast_loop', loopId, {
      category: 'loop_extension',
      extension: {
        name: 'guard',
        position: 'before_action',
        power: 'rewrite',
        implementation: { kind: 'builtin', builtinName: 'guard' },
      },
    }),
    definition('ast_slash', slashId, {
      category: 'slash_command',
      body: { description: 'review', binding: { kind: 'skill', skill: { ...skillId } } },
    }),
  ]
  const input: NonConnectorEvaluationInput = {
    tenant,
    standing: { standing: 'effective', role: 'member' },
    definitions,
    holdings: definitions.map(entry => holding('factory', entry.capability, entry.id)),
    root: {
      definition: root,
      references: [shell, skillId, mcpId, loopId, slashId].map(capability => ({ capability })),
      attributes: [],
      source: { asset: 'ast_root', version: 1 },
    },
    mcpActionSets: [
      {
        endpoint: mcpId,
        scope: 'factory',
        actions: {
          kind: 'fetched',
          fetchedAt: at,
          tools: [{ name: 'search', inputSchema: { type: 'object' } }],
        },
      },
    ],
  }
  it('one complete result derives actual settings, power, per-action execution, and references', () => {
    const result = assembled(input)
    expect(result.composition).toEqual(
      expect.arrayContaining([shell, skillId, mcpId, loopId, slashId]),
    )
    expect(result.composition).toHaveLength(5)
    expect(result.assets).toHaveLength(6)
    expect(result.values).toHaveLength(13)
    expect(result.values).toEqual(
      expect.arrayContaining([
        { capability: loopId, item: 'power', value: { allowed: ['rewrite'] }, from: 'factory' },
        { capability: loopId, item: 'position', value: 'before_action', from: 'factory' },
        {
          capability: mcpId,
          item: 'execute:search',
          value: { allowed: ['ask'] },
          from: 'factory',
          tenantAutoWritable: false,
        },
      ]),
    )
    expect(result.filteredOut).toEqual([])
    expect(result.unresolved).toEqual([])
  })
  for (const category of ['tool', 'skill', 'mcp', 'loop_extension', 'slash_command'] as const)
    it(`invalid ${category} body is rejected by the real AssetModel and evaluation`, () => {
      const entry = definitions.find(item => item.capability.category === category)
      if (entry === undefined) throw new Error('fixture absent')
      const invalid: JsonValue = category === 'tool' ? { name: 'wrong', paradigm: 'single' } : {}
      const content =
        category === 'tool'
          ? { category, definition: invalid }
          : category === 'loop_extension'
            ? { category, extension: invalid }
            : { category, body: invalid }
      const rejected = { ...entry, versions: [{ number: 1, content, publishedAt: at }] }
      expect(
        createAssetModelJudge(defaultBodyContracts).judgeAssetValue('AssetDefinition', rejected),
      ).toHaveProperty('rejected')
      expect(
        evaluate({
          ...input,
          definitions: input.definitions.map(item => (item.id === entry.id ? rejected : item)),
        }),
      ).toHaveProperty('invalidInput')
    })
})

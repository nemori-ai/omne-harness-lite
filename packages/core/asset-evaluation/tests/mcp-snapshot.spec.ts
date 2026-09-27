import { describe, expect, it } from 'vitest'
import { carrierRecordId } from '@omne-harness-lite/asset-model'
import { evaluate, type NonConnectorEvaluationInput } from '../src/index.ts'
import {
  at,
  assignment,
  definition,
  github,
  holding,
  mcp,
  root,
  simple,
  workspace,
} from './fixtures.ts'

function effective(input: NonConnectorEvaluationInput) {
  const outcome = evaluate(input)
  if (!('ok' in outcome)) throw new Error('expected complete evaluation')
  return outcome.ok
}
const common: NonConnectorEvaluationInput = {
  ...simple(),
  definitions: [...simple().definitions, definition('ast_mcp', github, mcp())],
  holdings: [...simple().holdings, holding('factory', github, 'ast_mcp')],
  root: { definition: root, references: [{ capability: github }] },
}

describe('MCP action snapshot knowledge and holder scope', () => {
  it('absent snapshots derive static fields only', () => {
    const result = effective(common)
    expect(result.values.map(entry => entry.item)).toEqual([
      'callTimeout',
      'connectTimeout',
      'connectionTarget',
      'usableBy',
    ])
    expect(result.values.some(entry => entry.item.startsWith('execute:'))).toBe(false)
  })
  it('not_fetched is C13, with no assembly partial result', () => {
    const outcome = evaluate({
      ...common,
      mcpActionSets: [{ endpoint: github, scope: 'factory', actions: { kind: 'not_fetched' } }],
    })
    expect(Object.keys(outcome)).toEqual(['invalidInput'])
    expect(outcome).toHaveProperty('invalidInput.diagnostics.0.condition', 'C13')
  })
  it('fetched empty is knowledge of no actions and has the same static value set', () => {
    expect(
      effective({
        ...common,
        mcpActionSets: [
          {
            endpoint: github,
            scope: 'factory',
            actions: { kind: 'fetched', fetchedAt: at, tools: [] },
          },
        ],
      }),
    ).toEqual(effective(common))
  })
  it('fetched nonempty derives exactly the supplied actions and tenant writable is always false', () => {
    const result = effective({
      ...common,
      mcpActionSets: [
        {
          endpoint: github,
          scope: 'factory',
          actions: {
            kind: 'fetched',
            fetchedAt: at,
            tools: [
              { name: 'search', inputSchema: {} },
              { name: 'push', inputSchema: {} },
            ],
          },
        },
      ],
    })
    expect(result.values.filter(entry => entry.item.startsWith('execute:'))).toEqual([
      {
        capability: github,
        item: 'execute:push',
        value: { allowed: ['ask'] },
        from: 'factory',
        tenantAutoWritable: false,
      },
      {
        capability: github,
        item: 'execute:search',
        value: { allowed: ['ask'] },
        from: 'factory',
        tenantAutoWritable: false,
      },
    ])
  })
  it('a snapshot from a different held scope does not become the selected asset action set', () => {
    const base = {
      ...common,
      definitions: [...common.definitions, definition('ast_t', github, mcp(), 'customized')],
      holdings: [...common.holdings, holding('tenant', github, 'ast_t')],
    }
    const result = effective({
      ...base,
      mcpActionSets: [
        {
          endpoint: github,
          scope: 'factory',
          actions: {
            kind: 'fetched',
            fetchedAt: at,
            tools: [{ name: 'factory-only', inputSchema: {} }],
          },
        },
      ],
    })
    expect(result.values.some(entry => entry.item.startsWith('execute:'))).toBe(false)
  })
  it('workspace permissions are retained then excluded even without a known action', () => {
    const id = carrierRecordId(workspace, github)
    const input = {
      ...common,
      workspace,
      definitions: [
        ...common.definitions,
        definition(id, github, mcp(undefined, undefined, 'auto'), 'customized'),
      ],
      holdings: [
        ...common.holdings,
        holding('workspace', github, id, [assignment('execute:unknown', { allowed: ['auto'] })]),
      ],
    }
    const result = effective(input)
    expect(result.values.some(entry => entry.item.startsWith('execute:'))).toBe(false)
    expect(result.filteredOut).toEqual([
      { capability: github, from: 'workspace', reason: 'workspace_permission' },
    ])
  })
})

// @module-tag slow
// 归慢层：重 CPU：每条用例跑完整的 evaluate，正文判定在调用中真实编译 JSON Schema（不替换）。
import { describe, expect, it } from 'vitest'
import { evaluate, type NonConnectorEvaluationInput } from '../src/index.ts'
import { at, assignment, bob, definition, github, holding, mcp, root, simple } from './fixtures.ts'

function effective(input: NonConnectorEvaluationInput) {
  const outcome = evaluate(input)
  if (!('ok' in outcome)) throw new Error('expected complete evaluation')
  return outcome.ok
}
const common: NonConnectorEvaluationInput = {
  ...simple(),
  definitions: [...simple().definitions, definition('ast_mcp', github, mcp())],
  holdings: [...simple().holdings, holding('factory', github, 'ast_mcp')],
  root: {
    definition: root,
    references: [{ capability: github }],
    attributes: [],
    source: { asset: 'ast_root', version: 1 },
  },
}
const replaced: NonConnectorEvaluationInput = {
  ...common,
  definitions: [...common.definitions, definition('ast_t', github, mcp(), 'customized')],
  holdings: [
    ...common.holdings,
    { ...holding('organization', github, 'ast_mcp'), basis: { kind: 'official' } },
    holding('tenant', github, 'ast_t'),
  ],
}
function outer(
  value: readonly string[],
  immutable: boolean,
  item = 'execute:gone',
): NonConnectorEvaluationInput {
  return {
    ...replaced,
    holdings: replaced.holdings.map(entry =>
      entry.holder.layer === 'organization'
        ? { ...entry, assignments: [assignment(item, { allowed: value }, immutable)] }
        : entry,
    ),
  }
}

describe('C10 validates only the S21/S23 participating assignments', () => {
  it('missing outer unlocked pick is not used, even when outside its declaration domain', () => {
    expect(effective(outer(['yolo'], false))).toEqual(effective(replaced))
  })
  it('the same missing strictly outer immutable bound fails before intersection with strict', () => {
    const outcome = evaluate(outer(['yolo'], true))
    expect(Object.keys(outcome)).toEqual(['invalidInput'])
    expect(outcome).toHaveProperty('invalidInput.diagnostics.0.condition', 'C10')
    expect(
      effective(outer(['auto'], true)).values.find(entry => entry.item === 'execute:gone'),
    ).toEqual({
      capability: github,
      item: 'execute:gone',
      value: { allowed: [] },
      from: 'organization',
      lockedAt: 'organization',
      tenantAutoWritable: false,
    })
  })
  it('missing same-layer immutable value does not automatically create a permission', () => {
    const input = {
      ...common,
      holdings: [
        ...common.holdings,
        {
          ...holding('organization', github, 'ast_mcp', [
            assignment('execute:gone', { allowed: ['yolo'] }, true),
          ]),
          basis: { kind: 'official' as const },
        },
      ],
    }
    expect(effective(input).values.some(entry => entry.item === 'execute:gone')).toBe(false)
  })
  it('missing inner not_usable holding value is not used', () => {
    const input = {
      ...common,
      definitions: [
        ...common.definitions,
        definition('ast_org', github, mcp(), 'customized', bob, true),
      ],
      holdings: [
        ...common.holdings,
        holding('organization', github, 'ast_org', [
          assignment('execute:gone', { allowed: ['yolo'] }, true),
        ]),
      ],
    }
    const result = effective(input)
    expect(result.assets.find(entry => entry.capability.name === 'github')?.from).toBe('factory')
    expect(result.filteredOut).toEqual([
      { capability: github, from: 'organization', reason: 'not_usable' },
    ])
    expect(result.values.some(entry => entry.item === 'execute:gone')).toBe(false)
  })
  it('an existing effective permission checks every candidate even when a valid inner pick would win', () => {
    const base = outer(['yolo'], false, 'execute:search')
    const input = {
      ...base,
      holdings: base.holdings.map(entry =>
        entry.holder.layer === 'tenant'
          ? { ...entry, assignments: [assignment('execute:search', { allowed: ['ask'] })] }
          : entry,
      ),
      mcpActionSets: [
        {
          endpoint: github,
          scope: 'tenant' as const,
          actions: {
            kind: 'fetched' as const,
            fetchedAt: at,
            tools: [{ name: 'search', inputSchema: {} }],
          },
        },
      ],
    }
    expect(evaluate(input)).toHaveProperty('invalidInput.diagnostics.0.condition', 'C10')
  })
})

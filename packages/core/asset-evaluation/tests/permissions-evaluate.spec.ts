// @module-tag slow
// 归慢层：重 CPU：每条用例跑完整的 evaluate，正文判定在调用中真实编译 JSON Schema（不替换）。
import { describe, expect, it } from 'vitest'
import { evaluate } from '../src/index.ts'
import { assignment, definition, holding, shell, simple, tool } from './fixtures.ts'

const p = (...allowed: string[]) => ({ allowed })
const rows = [
  {
    name: 'author ask, tenant auto',
    default: 'ask',
    org: [],
    tenant: [assignment('execute', p('auto'))],
    value: p('auto'),
    from: 'tenant',
    lockedAt: undefined,
    writable: true,
  },
  {
    name: 'organization empty bound',
    default: 'ask',
    org: [assignment('execute', p(), true)],
    tenant: [assignment('execute', p('auto'))],
    value: p(),
    from: 'organization',
    lockedAt: 'organization',
    writable: false,
  },
  {
    name: 'tenant forbid is bound',
    default: 'ask',
    org: [assignment('execute', p('ask', 'forbid'), true)],
    tenant: [assignment('execute', p('forbid'))],
    value: p('forbid'),
    from: 'tenant',
    lockedAt: 'organization',
    writable: false,
  },
  {
    name: 'author fitting ask after disjoint pick',
    default: 'ask',
    org: [assignment('execute', p('ask'), true)],
    tenant: [assignment('execute', p('auto'))],
    value: p('ask'),
    from: 'factory',
    lockedAt: 'organization',
    writable: false,
  },
  {
    name: 'nearest ask rather than forbid',
    default: 'auto',
    org: [assignment('execute', p('ask', 'forbid'), true)],
    tenant: [],
    value: p('ask'),
    from: 'organization',
    lockedAt: 'organization',
    writable: false,
  },
  {
    name: 'unlocked forbid cannot be picked away',
    default: 'ask',
    org: [assignment('execute', p('forbid'))],
    tenant: [assignment('execute', p('auto'))],
    value: p('forbid'),
    from: 'organization',
    lockedAt: 'organization',
    writable: false,
  },
  {
    name: 'unlocked organization ask is overridden',
    default: 'ask',
    org: [assignment('execute', p('ask'))],
    tenant: [assignment('execute', p('auto'))],
    value: p('auto'),
    from: 'tenant',
    lockedAt: undefined,
    writable: true,
  },
]
describe('S23 seven product rows through public evaluate and the actual ToolDefinition port', () => {
  for (const row of rows)
    it(row.name, () => {
      const base = simple()
      const input = {
        ...base,
        definitions: base.definitions.map(entry =>
          entry.id === 'ast_value'
            ? definition('ast_value', shell, tool('shell', 'PT60S', row.default))
            : entry,
        ),
        holdings: [
          ...base.holdings,
          {
            ...holding('organization', shell, 'ast_value', row.org),
            basis: { kind: 'official' as const },
          },
          {
            ...holding('tenant', shell, 'ast_value', row.tenant),
            basis: { kind: 'official' as const },
          },
        ],
      }
      const outcome = evaluate(input)
      if (!('ok' in outcome)) throw new Error('expected complete evaluation')
      expect(outcome.ok.values.find(entry => entry.item === 'execute')).toEqual({
        capability: shell,
        item: 'execute',
        value: row.value,
        from: row.from,
        tenantAutoWritable: row.writable,
        ...(row.lockedAt === undefined ? {} : { lockedAt: row.lockedAt }),
      })
      expect(outcome.ok.composition).toEqual([shell])
      expect(outcome.ok.unresolved).toEqual([])
      expect(outcome.ok.filteredOut).toEqual([])
    })
})

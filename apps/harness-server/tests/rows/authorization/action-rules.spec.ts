import { describe, expect, it } from 'vitest'
import { actionRulesSchema, toolActionRule } from '../../../src/rows/authorization/action-rules.ts'

const adoption = (name: string, digest = 'd1') => ({ owner: 'o', name, revision: '1', digest })
const probe = (name: string) => ({ category: 'probe', name })
const tool = (name: string) => ({ category: 'tool', name })
const rules = (given: readonly unknown[]) =>
  actionRulesSchema.parse({ revision: 'r1', rules: given })

describe('an action rule that names a source', () => {
  const allowed = rules([
    { id: 'shell', effect: 'allow', tool: 'Shell' },
    { id: 'probes', effect: 'allow', source: { category: 'probe' } },
  ])

  it('matches every action of a capability of the category, whatever the entry is named', () => {
    expect(toolActionRule(allowed, adoption('probe__alpha'), probe('alpha'))?.id).toBe('probes')
    expect(toolActionRule(allowed, adoption('anything', 'd2'), probe('beta'))?.id).toBe('probes')
    expect(toolActionRule(allowed, adoption('Shell'), tool('Shell'))?.id).toBe('shell')
  })

  it('matches nothing of another category, though the entry is named alike', () => {
    expect(toolActionRule(allowed, adoption('probe__alpha'), tool('probe__alpha'))).toBeUndefined()
    expect(
      toolActionRule(allowed, adoption('probe__alpha'), { category: 'other', name: 'alpha' }),
    ).toBeUndefined()
  })

  it('names one capability when it gives the name, and a deny wins over an allow whichever names more', () => {
    const narrowed = rules([
      { id: 'probes', effect: 'allow', source: { category: 'probe' } },
      { id: 'no-alpha', effect: 'deny', source: { category: 'probe', name: 'alpha' } },
    ])
    expect(toolActionRule(narrowed, adoption('probe__alpha'), probe('alpha'))?.id).toBe('no-alpha')
    expect(toolActionRule(narrowed, adoption('probe__beta'), probe('beta'))?.id).toBe('probes')
    const closed = rules([
      { id: 'alpha', effect: 'allow', source: { category: 'probe', name: 'alpha' } },
      { id: 'no-probes', effect: 'deny', source: { category: 'probe' } },
    ])
    expect(toolActionRule(closed, adoption('probe__alpha'), probe('alpha'))?.id).toBe('no-probes')
  })

  it.each([
    ['a source without a category', { id: 'a', effect: 'allow', source: { name: 'alpha' } }],
    ['an empty category', { id: 'a', effect: 'allow', source: { category: '' } }],
    [
      'a rule with a tool and a source',
      { id: 'a', effect: 'allow', tool: 'X', source: { category: 'probe' } },
    ],
    [
      'a source rule with a definition',
      { id: 'a', effect: 'allow', source: { category: 'probe' }, definition: adoption('x') },
    ],
  ])('is refused as configuration: %s', (_name, rule) => {
    expect(actionRulesSchema.safeParse({ revision: 'r1', rules: [rule] }).success).toBe(false)
  })
})

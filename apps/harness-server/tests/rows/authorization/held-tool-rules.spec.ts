import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { actionRulesSchema, toolActionRule } from '../../../src/rows/authorization/action-rules.ts'
import { HELD_TOOL_OWNER } from '../../../src/rows/tool-host/held-tools.ts'

const held = (name: string, owner = HELD_TOOL_OWNER) => ({
  owner,
  name,
  revision: `tool/${name}`,
  digest: 'sha256:held',
})
const match = (set: Parameters<typeof toolActionRule>[0], definition: ReturnType<typeof held>) =>
  toolActionRule(set, definition, { category: 'tool', name: definition.name })
const rules = actionRulesSchema.parse({
  revision: 'test-1',
  rules: [
    { id: 'files', effect: 'allow', tool: 'Files' },
    { id: 'held-tools', effect: 'allow', definitionOwner: HELD_TOOL_OWNER },
    { id: 'no-wiper', effect: 'deny', tool: 'wiper' },
  ],
})

describe('an action rule that names the owner of a definition', () => {
  it('covers every tool whose definition that owner adopts, whatever its name', () => {
    expect(match(rules, held('wordcount'))?.id).toBe('held-tools')
    expect(match(rules, held('anything-else'))?.id).toBe('held-tools')
  })

  it('does not cover a definition of another owner', () => {
    expect(match(rules, held('wordcount', '@omne-harness/elsewhere'))).toBeUndefined()
  })

  it('yields to a prohibition of the same tool by name', () => {
    expect(match(rules, held('wiper'))).toMatchObject({ id: 'no-wiper', effect: 'deny' })
  })

  it('is one of two forms: a rule names a tool or an owner, never both and never neither', () => {
    const one = (rule: object) => actionRulesSchema.safeParse({ revision: '1', rules: [rule] })
    expect(one({ id: 'a', effect: 'allow', tool: 'Files', definitionOwner: 'x' }).success).toBe(
      false,
    )
    expect(one({ id: 'a', effect: 'allow' }).success).toBe(false)
    expect(one({ id: 'a', effect: 'allow', definitionOwner: '' }).success).toBe(false)
  })

  it('is what the distribution allows the tools a tenant holds by', () => {
    const distribution = JSON.parse(
      readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
    ) as { rows: { id: string; config?: { actionRules?: unknown } }[] }
    const configured = actionRulesSchema.parse(
      distribution.rows.find(row => row.id === 'authorization')?.config?.actionRules,
    )
    expect(match(configured, held('wordcount'))).toMatchObject({ effect: 'allow' })
    expect(match(configured, held('wordcount', '@omne-harness/elsewhere'))).toBeUndefined()
  })
})

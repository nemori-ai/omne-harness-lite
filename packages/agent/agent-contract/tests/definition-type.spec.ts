import { describe, expect, it } from 'vitest'
import { AGENT_TYPES, SUMMARY_LIMITS, judgeAgentDefinition } from '@omne-harness/agent-contract'

const base = {
  category: 'AgentDefinition',
  name: 'reviewer',
  type: 'non-master',
  summary: 'Reviews a change against its spec and reports what does not hold.',
  references: [],
  attributes: [],
}
const without = (key: 'type' | 'summary') => {
  const { [key]: _dropped, ...rest } = base
  return rest
}
const malformed = { kind: 'refused', reason: 'malformed' }

describe('the type and the summary of an Agent definition', () => {
  it('has exactly the two types master and non-master', () => {
    expect(AGENT_TYPES).toEqual(['master', 'non-master'])
  })

  it.each(AGENT_TYPES)('accepts the type %s and keeps the type and the summary', async type => {
    const judged = await judgeAgentDefinition({ ...base, type })
    expect(judged).toMatchObject({ kind: 'accepted', value: { type, summary: base.summary } })
    if (judged.kind === 'accepted') expect(Object.isFrozen(judged.value)).toBe(true)
  })

  it('refuses a definition without a type, and one with a type outside the two', async () => {
    expect(await judgeAgentDefinition(without('type'))).toMatchObject(malformed)
    expect(await judgeAgentDefinition({ ...base, type: 'lead' })).toMatchObject(malformed)
    expect(await judgeAgentDefinition({ ...base, type: 'Master' })).toMatchObject(malformed)
  })

  it('refuses a definition without a summary, and one whose summary says nothing', async () => {
    expect(await judgeAgentDefinition(without('summary'))).toMatchObject(malformed)
    expect(await judgeAgentDefinition({ ...base, summary: '' })).toMatchObject(malformed)
    expect(await judgeAgentDefinition({ ...base, summary: ' \n\t ' })).toEqual({
      ...malformed,
      detail: 'summary: says nothing',
    })
  })

  it('accepts a summary of exactly the limit in UTF-8 bytes and refuses one byte more', async () => {
    const limit = SUMMARY_LIMITS.maxBytes
    expect(limit).toBe(1000)
    const three = '中'
    const atLimit = three.repeat(333) + 'a'
    expect(await judgeAgentDefinition({ ...base, summary: atLimit })).toMatchObject({
      kind: 'accepted',
    })
    expect(await judgeAgentDefinition({ ...base, summary: `${atLimit}a` })).toEqual({
      ...malformed,
      detail: `summary: 1001 UTF-8 bytes exceed ${limit}`,
    })
  })
})

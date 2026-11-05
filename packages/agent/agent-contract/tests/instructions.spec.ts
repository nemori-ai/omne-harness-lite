// The `instructions` member of a definition (SPEC "声明判断", R2-D124): the ordered prompt sections
// that a definition carries. Each test names the one rule it guards; a definition that breaks only
// that rule is `malformed` with a detail that names the section, and a definition without the member
// is judged as before, with no member added.
import { describe, expect, it } from 'vitest'
import {
  INSTRUCTION_LIMITS,
  agentBodyContract,
  judgeAgentDefinition,
} from '@omne-harness/agent-contract'
import { createCategoryRegistry, readBodyText } from '@omne-harness/assets'

const definition = (extra: Record<string, unknown> = {}) => ({
  category: 'AgentDefinition',
  name: 'coding',
  references: [],
  attributes: [],
  ...extra,
})

const section = (id: string, text = `# ${id}`) => ({ id, text })

async function refusal(value: unknown) {
  const judged = await judgeAgentDefinition(value)
  if (judged.kind !== 'refused') throw new Error('expected a refusal')
  return judged
}

// Three UTF-8 bytes per character, one UTF-16 unit each: the unit limit of the declaration (10000)
// does not see the overflow, the byte limit of a section must.
const CJK = '码'

describe('an accepted definition with instructions', () => {
  it('keeps every section in the order given, frozen, and nothing else', async () => {
    const judged = await judgeAgentDefinition(
      definition({ instructions: [section('role', 'A'), section('tools', 'B')] }),
    )
    expect(judged).toStrictEqual({
      kind: 'accepted',
      value: {
        category: 'AgentDefinition',
        name: 'coding',
        references: [],
        attributes: [],
        instructions: [
          { id: 'role', text: 'A' },
          { id: 'tools', text: 'B' },
        ],
      },
    })
    if (judged.kind !== 'accepted') throw new Error('refused')
    expect(Object.isFrozen(judged.value.instructions)).toBe(true)
    expect(Object.isFrozen(judged.value.instructions?.[0])).toBe(true)
  })

  it('a definition without the member is legal and gets no member added', async () => {
    const judged = await judgeAgentDefinition(definition())
    expect(judged).toStrictEqual({
      kind: 'accepted',
      value: { category: 'AgentDefinition', name: 'coding', references: [], attributes: [] },
    })
    if (judged.kind !== 'accepted') throw new Error('refused')
    expect('instructions' in judged.value).toBe(false)
  })

  it('accepts the most sections allowed and a text of exactly the byte limit', async () => {
    const many = Array.from({ length: INSTRUCTION_LIMITS.maxSections }, (_, index) =>
      section(`s${index}`),
    )
    expect(await judgeAgentDefinition(definition({ instructions: many }))).toMatchObject({
      kind: 'accepted',
    })
    const full = 'a'.repeat(INSTRUCTION_LIMITS.maxSectionBytes)
    expect(
      await judgeAgentDefinition(definition({ instructions: [section('role', full)] })),
    ).toMatchObject({ kind: 'accepted' })
  })
})

describe('a definition whose instructions break one rule is malformed, and the detail names it', () => {
  it('a repeated section id', async () => {
    const judged = await refusal(
      definition({ instructions: [section('role'), section('tools'), section('role')] }),
    )
    expect(judged.reason).toBe('malformed')
    expect(judged.detail).toMatch(/instructions\[2\]\.id: "role" repeats/u)
  })

  it('a section text over the byte limit, counted in UTF-8 bytes and not in characters', async () => {
    // 3334 characters: below the unit limit of the declaration, 10002 bytes.
    const over = CJK.repeat(3334)
    expect(over.length).toBeLessThan(INSTRUCTION_LIMITS.maxSectionBytes)
    const judged = await refusal(definition({ instructions: [section('role', over)] }))
    expect(judged.reason).toBe('malformed')
    expect(judged.detail).toMatch(/instructions\[0\]\.text: 10002 UTF-8 bytes exceed 10000/u)
    // 3333 characters: 9999 bytes, legal.
    expect(
      await judgeAgentDefinition(definition({ instructions: [section('role', CJK.repeat(3333))] })),
    ).toMatchObject({ kind: 'accepted' })
  })

  it('a whole declaration over the declaration byte limit, each section within its own', async () => {
    // 11 sections of 9500 bytes: every section is legal, the document is over 100000 bytes.
    const sections = Array.from({ length: 11 }, (_, index) =>
      section(`s${index}`, 'a'.repeat(9500)),
    )
    const judged = await refusal(definition({ instructions: sections }))
    expect(judged).toStrictEqual({ kind: 'refused', reason: 'malformed' })
    // One section fewer fits.
    expect(
      await judgeAgentDefinition(definition({ instructions: sections.slice(0, 10) })),
    ).toMatchObject({ kind: 'accepted' })
  })

  it('an empty list: "no prompt" has one spelling, absence', async () => {
    const judged = await refusal(definition({ instructions: [] }))
    expect(judged.reason).toBe('malformed')
    expect(judged.detail).toMatch(/^instructions: /u)
  })

  it('one section more than the limit', async () => {
    const many = Array.from({ length: INSTRUCTION_LIMITS.maxSections + 1 }, (_, index) =>
      section(`s${index}`),
    )
    const judged = await refusal(definition({ instructions: many }))
    expect(judged.reason).toBe('malformed')
    expect(judged.detail).toMatch(/^instructions: /u)
  })

  it('an id that does not match the id pattern', async () => {
    for (const id of ['Role', '1st', 'a b', 'a'.repeat(65)]) {
      const judged = await refusal(definition({ instructions: [section(id)] }))
      expect(judged.reason, id).toBe('malformed')
      expect(judged.detail, id).toMatch(/instructions\[0\]\.id: .* does not match/u)
    }
  })

  it('a text that carries the variable marker of the prompt renderer', async () => {
    const judged = await refusal(definition({ instructions: [section('role', 'Hi {{name}}')] }))
    expect(judged.reason).toBe('malformed')
    expect(judged.detail).toMatch(/instructions\[0\]\.text: contains "\{\{"/u)
  })

  it('a section with a member the table does not list, an empty text, or a non-array member', async () => {
    for (const instructions of [
      [{ id: 'role', text: 'A', order: 1 }],
      [{ id: 'role', text: '' }],
      [{ id: 'role' }],
      'role',
      null,
    ]) {
      const judged = await refusal(definition({ instructions }))
      expect(judged.reason, JSON.stringify(instructions)).toBe('malformed')
      expect(judged.detail, JSON.stringify(instructions)).toMatch(/^instructions/u)
    }
  })
})

describe('the body contract applies the same instruction rules', () => {
  const limits = {
    maxBytes: 100_000,
    maxDepth: 10,
    maxItems: 200,
    maxMembers: 80,
    maxStringLength: 10_000,
    maxNumberLength: 100,
  }
  const judge = (content: unknown) => {
    const registry = createCategoryRegistry()
    registry.register(agentBodyContract())
    const contract = registry.lookup('AgentDefinition')
    const read = readBodyText(JSON.stringify(content), limits)
    if (contract === undefined || read.kind !== 'ok') throw new Error('fixture')
    return contract.judge(read.value)
  }
  const body = (instructions: unknown) => ({
    name: 'coding',
    references: [],
    attributes: [],
    instructions,
  })

  it('accepts a body with ordered sections', () => {
    expect(judge(body([section('role'), section('tools')]))).toEqual({ ok: true })
  })

  it('refuses the rules of the definition judgment as invalid-instructions', () => {
    for (const instructions of [
      [],
      [section('role'), section('role')],
      [section('role', CJK.repeat(3334))],
      [section('Role')],
      [section('role', '{{x}}')],
      [{ id: 'role' }],
      'role',
    ]) {
      expect(judge(body(instructions)), JSON.stringify(instructions)).toEqual({
        ok: false,
        rejected: 'invalid-instructions',
      })
    }
  })

  it('refuses an unknown key inside a section as unknown-field, like every other unknown key', () => {
    expect(judge(body([{ id: 'role', text: 'A', order: 1 }]))).toEqual({
      ok: false,
      rejected: 'unknown-field',
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  createCategoryRegistry,
  isReadBody,
  readBodyText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/assets'
import { agentBodyContract, judgeAgentDefinition } from '@omne-harness/agent-contract'

const limits: JsonLimits = {
  maxBytes: 10_000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 100,
  maxStringLength: 100,
  maxNumberLength: 100,
}

function document(text: string): JsonValue {
  const read = readBodyText(text, limits)
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

function bodyOf(content: unknown): JsonValue {
  return document(JSON.stringify(content))
}

const ref = (category: string, name: string, resident?: unknown) =>
  resident === undefined
    ? { capability: { category, name } }
    : { capability: { category, name }, resident }

const legal = {
  name: 'reviewer',
  version: 'v2',
  references: [ref('skill', 'review', true), ref('tool', 'read_file')],
  attributes: [{ item: 'model' }, { item: 'first_token_wait_limit' }],
}

type Row = {
  readonly label: string
  readonly content: Record<string, unknown>
  /** The refusal word of the body judgment. Absent means the body is accepted. */
  readonly rejected?: string
  /** The reason of `judgeAgentDefinition`. It names only two of the finer words and uses `malformed` otherwise. */
  readonly definitionReason?: string
}

// One table drives both entries. `judgeAgentDefinition` takes the same content plus `category`.
const rows: readonly Row[] = [
  { label: 'legal full body', content: legal },
  { label: 'legal minimal body', content: { name: 'a', references: [], attributes: [] } },
  {
    label: 'resident false',
    content: { name: 'a', references: [ref('skill', 's', false)], attributes: [] },
  },
  {
    label: 'missing name',
    content: { references: [], attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'empty name',
    content: { name: '', references: [], attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'non-string name',
    content: { name: 7, references: [], attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'empty version',
    content: { name: 'a', version: '', references: [], attributes: [] },
    rejected: 'invalid-version',
  },
  {
    label: 'numeric version',
    content: { name: 'a', version: 3, references: [], attributes: [] },
    rejected: 'invalid-version',
  },
  {
    label: 'null version',
    content: { name: 'a', version: null, references: [], attributes: [] },
    rejected: 'invalid-version',
  },
  {
    label: 'references missing',
    content: { name: 'a', attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'references null',
    content: { name: 'a', references: null, attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'references an object',
    content: { name: 'a', references: ref('skill', 's'), attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'reference element is not an object',
    content: { name: 'a', references: ['skill/s'], attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'capability missing',
    content: { name: 'a', references: [{ resident: true }], attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'capability name missing',
    content: { name: 'a', references: [{ capability: { category: 'skill' } }], attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'capability category empty',
    content: { name: 'a', references: [ref('', 's')], attributes: [] },
    rejected: 'incomplete-reference',
  },
  {
    label: 'capability name not a string',
    content: {
      name: 'a',
      references: [{ capability: { category: 'skill', name: 1 } }],
      attributes: [],
    },
    rejected: 'incomplete-reference',
  },
  {
    label: 'duplicate capability',
    content: {
      name: 'a',
      references: [ref('skill', 's'), ref('tool', 't'), ref('skill', 's', true)],
      attributes: [],
    },
    rejected: 'duplicate-capability',
    definitionReason: 'duplicate-capability',
  },
  {
    label: 'same name in another category',
    content: { name: 'a', references: [ref('skill', 's'), ref('tool', 's')], attributes: [] },
  },
  {
    label: 'resident is a string',
    content: { name: 'a', references: [ref('skill', 's', 'yes')], attributes: [] },
    rejected: 'invalid-resident',
  },
  {
    label: 'resident is null',
    content: { name: 'a', references: [ref('skill', 's', null)], attributes: [] },
    rejected: 'invalid-resident',
  },
  {
    label: 'attributes missing',
    content: { name: 'a', references: [] },
    rejected: 'unknown-attribute',
  },
  {
    label: 'attributes null',
    content: { name: 'a', references: [], attributes: null },
    rejected: 'unknown-attribute',
  },
  {
    label: 'attributes an object',
    content: { name: 'a', references: [], attributes: { item: 'model' } },
    rejected: 'unknown-attribute',
  },
  {
    label: 'attribute element is a string',
    content: { name: 'a', references: [], attributes: ['model'] },
    rejected: 'unknown-attribute',
  },
  {
    label: 'attribute item missing',
    content: { name: 'a', references: [], attributes: [{}] },
    rejected: 'unknown-attribute',
  },
  {
    label: 'unknown attribute item',
    content: { name: 'a', references: [], attributes: [{ item: 'temperature' }] },
    rejected: 'unknown-attribute',
    definitionReason: 'unknown-attribute',
  },
  {
    label: 'attribute item not a string',
    content: { name: 'a', references: [], attributes: [{ item: 1 }] },
    rejected: 'unknown-attribute',
  },
  {
    label: 'duplicate attribute item',
    content: { name: 'a', references: [], attributes: [{ item: 'model' }, { item: 'model' }] },
    rejected: 'duplicate-attribute',
  },
  {
    label: 'unknown top-level key',
    content: { name: 'a', references: [], attributes: [], needs: [] },
    rejected: 'unknown-field',
  },
  {
    label: 'unknown key in a reference',
    content: {
      name: 'a',
      references: [{ capability: { category: 'skill', name: 's' }, pinned: true }],
      attributes: [],
    },
    rejected: 'unknown-field',
  },
  {
    label: 'unknown key in a capability',
    content: {
      name: 'a',
      references: [{ capability: { category: 'skill', name: 's', version: 'v1' } }],
      attributes: [],
    },
    rejected: 'unknown-field',
  },
  {
    label: 'unknown key in an attribute',
    content: { name: 'a', references: [], attributes: [{ item: 'model', value: 'x' }] },
    rejected: 'unknown-field',
  },
]

describe('agentBodyContract registration', () => {
  it('registers under the category name and is retrieved from the registry', () => {
    const registry = createCategoryRegistry()
    const contract = agentBodyContract()
    registry.register(contract)
    const found = registry.lookup('AgentDefinition')
    expect(found).toBeDefined()
    expect(found?.category).toBe('AgentDefinition')
    expect(found?.judge).toBe(contract.judge)
    expect(found?.deriveDeclarations).toBe(contract.deriveDeclarations)
    expect(found?.references).toBe(contract.references)
    expect(registry.lookup('agent-definition')).toBeUndefined()
  })

  it('describes the body as a read JSON document without making it a checker', () => {
    const { schema } = agentBodyContract()
    expect(isReadBody(schema)).toBe(true)
    expect(schema).toMatchObject({ kind: 'object' })
    // The schema is descriptive: a body that matches it is not thereby judged legal.
    expect(agentBodyContract().judge(schema)).toEqual({
      ok: false,
      rejected: 'incomplete-reference',
    })
  })

  it('refuses a second registration of the category', () => {
    const registry = createCategoryRegistry()
    registry.register(agentBodyContract())
    expect(() => registry.register(agentBodyContract())).toThrow(/already registered/)
  })
})

describe('judge agrees with judgeAgentDefinition', () => {
  it.each(rows)('$label', async ({ content, rejected, definitionReason }) => {
    const registry = createCategoryRegistry()
    registry.register(agentBodyContract())
    const contract = registry.lookup('AgentDefinition')
    if (contract === undefined) throw new Error('contract missing')

    const bodyJudgment = contract.judge(bodyOf(content))
    const definitionJudgment = await judgeAgentDefinition({
      category: 'AgentDefinition',
      ...content,
    })

    if (rejected === undefined) {
      expect(bodyJudgment).toEqual({ ok: true })
      expect(definitionJudgment.kind).toBe('accepted')
    } else {
      expect(bodyJudgment).toEqual({ ok: false, rejected })
      expect(definitionJudgment).toEqual({
        kind: 'refused',
        reason: definitionReason ?? 'malformed',
      })
    }
  })

  it('covers every refusal word of the table, and extraction throws exactly on refused rows', () => {
    const contract = agentBodyContract()
    const words = new Set(rows.flatMap(row => (row.rejected === undefined ? [] : [row.rejected])))
    expect([...words].sort()).toEqual(
      [
        'duplicate-attribute',
        'duplicate-capability',
        'incomplete-reference',
        'invalid-resident',
        'invalid-version',
        'unknown-attribute',
        'unknown-field',
      ].sort(),
    )
    for (const row of rows) {
      if (row.rejected === undefined)
        expect(() => contract.references(bodyOf(row.content))).not.toThrow()
      else expect(() => contract.references(bodyOf(row.content))).toThrow(TypeError)
    }
  })
})

describe('judge differences that come from the body entry', () => {
  const content = { name: 'reviewer', references: [], attributes: [] }

  it('compares the body name with the capability name given by the registry caller', () => {
    const { judge } = agentBodyContract()
    expect(judge(bodyOf(content), { capabilityName: 'reviewer' })).toEqual({ ok: true })
    expect(judge(bodyOf(content), { capabilityName: 'other' })).toEqual({
      ok: false,
      rejected: 'name-mismatch',
    })
  })

  it('refuses a `category` key because the registry key gives the category', async () => {
    const { judge } = agentBodyContract()
    expect(judge(bodyOf({ category: 'AgentDefinition', ...content }))).toEqual({
      ok: false,
      rejected: 'unknown-field',
    })
    const definition = await judgeAgentDefinition({ category: 'AgentDefinition', ...content })
    expect(definition.kind).toBe('accepted')
  })

  it('refuses values that are not read trees without throwing', () => {
    const { judge } = agentBodyContract()
    const refused = { ok: false, rejected: 'incomplete-reference' }
    // A hand-built tree has the right shape but was not produced by readBodyText.
    const lookalike = {
      kind: 'object',
      entries: [{ key: 'name', value: { kind: 'string', value: 'a' } }],
    }
    expect(judge(lookalike)).toEqual(refused)
    expect(judge(content)).toEqual(refused)
    expect(judge(undefined)).toEqual(refused)
    expect(judge(null)).toEqual(refused)
    expect(judge(document('[]'))).toEqual(refused)
    expect(judge(document('"reviewer"'))).toEqual(refused)
  })

  it('returns a frozen refusal', () => {
    const verdict = agentBodyContract().judge(bodyOf({ references: [], attributes: [] }))
    expect(Object.isFrozen(verdict)).toBe(true)
  })
})

describe('references', () => {
  it('returns the capability identities in body order', () => {
    const ids = agentBodyContract().references(bodyOf(legal))
    expect(ids).toEqual([
      { category: 'skill', name: 'review' },
      { category: 'tool', name: 'read_file' },
    ])
  })

  it('returns an empty list when the body references nothing', () => {
    expect(
      agentBodyContract().references(bodyOf({ name: 'a', references: [], attributes: [] })),
    ).toEqual([])
  })

  it('keeps the order of the references rather than sorting them', () => {
    const ids = agentBodyContract().references(
      bodyOf({
        name: 'a',
        references: [ref('tool', 'z'), ref('skill', 'a'), ref('tool', 'b')],
        attributes: [],
      }),
    )
    expect(ids.map(id => `${id.category}/${id.name}`)).toEqual(['tool/z', 'skill/a', 'tool/b'])
  })

  it('throws TypeError with the refusal word when the body fails judgment', () => {
    const body = bodyOf({
      name: 'a',
      references: [ref('skill', 's'), ref('skill', 's')],
      attributes: [],
    })
    expect(() => agentBodyContract().references(body)).toThrow(TypeError)
    expect(() => agentBodyContract().references(body)).toThrow(/duplicate-capability/)
  })

  it('applies the capability name context before extracting', () => {
    const body = bodyOf({ name: 'a', references: [], attributes: [] })
    expect(() => agentBodyContract().references(body, { capabilityName: 'b' })).toThrow(
      /name-mismatch/,
    )
  })
})

describe('deriveDeclarations', () => {
  it('declares nothing for a body with an empty attribute list', () => {
    expect(
      agentBodyContract().deriveDeclarations(bodyOf({ name: 'a', references: [], attributes: [] })),
    ).toEqual({ entries: [] })
  })

  it('returns the attribute items in body order', () => {
    expect(agentBodyContract().deriveDeclarations(bodyOf(legal))).toEqual({
      entries: ['model', 'first_token_wait_limit'],
    })
    expect(
      agentBodyContract().deriveDeclarations(
        bodyOf({
          name: 'a',
          references: [],
          attributes: [{ item: 'post_first_token_stall_limit' }, { item: 'model' }],
        }),
      ),
    ).toEqual({ entries: ['post_first_token_stall_limit', 'model'] })
  })

  it('throws TypeError with the refusal word when the body fails judgment', () => {
    const body = bodyOf({
      name: 'a',
      references: [],
      attributes: [{ item: 'model' }, { item: 'model' }],
    })
    expect(() => agentBodyContract().deriveDeclarations(body)).toThrow(TypeError)
    expect(() => agentBodyContract().deriveDeclarations(body)).toThrow(/duplicate-attribute/)
  })
})

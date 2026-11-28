import { describe, expect, it } from 'vitest'
import {
  SUMMARY_LIMITS,
  admitSummary,
  capabilityId,
  createCategoryPoint,
  pinBody,
  readBodyText,
  summarizeVersion,
  type BodyContract,
  type JsonValue,
} from '@omne-harness/assets'

function body(text: string): JsonValue {
  const read = readBodyText(text, {
    maxBytes: 1_000,
    maxDepth: 4,
    maxItems: 16,
    maxMembers: 16,
    maxStringLength: 200,
    maxNumberLength: 20,
  })
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

function contract(category: string, summarize?: BodyContract['summarize']): BodyContract {
  return {
    category,
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    ...(summarize === undefined ? {} : { summarize }),
  }
}

function pinned(category: string, name = 'a') {
  const id = capabilityId(category, name)
  if (!id.ok) throw new Error('identity')
  return pinBody({ identity: id.id, version: 'v1', source: 'test', body: body('{"name":"a"}') })
}

describe('admitSummary', () => {
  it('keeps a summary inside the bounds as it is', () => {
    const summary = { title: '标题', description: '一句', facts: [{ name: '文件', text: '3 个' }] }
    expect(admitSummary(summary)).toEqual(summary)
  })

  it('clips each text to its bound by code point and keeps only the first facts', () => {
    const astral = '𝔸'.repeat(SUMMARY_LIMITS.title + 5)
    const admitted = admitSummary({
      title: astral,
      description: 'd'.repeat(SUMMARY_LIMITS.description + 1),
      facts: Array.from({ length: SUMMARY_LIMITS.facts + 2 }, (_, index) => ({
        name: 'n'.repeat(SUMMARY_LIMITS.name + 1),
        text: `${index}`.padEnd(SUMMARY_LIMITS.text + 3, 't'),
      })),
    })
    expect([...(admitted?.title ?? '')]).toHaveLength(SUMMARY_LIMITS.title)
    expect(admitted?.title.startsWith('𝔸')).toBe(true)
    expect(admitted?.description).toHaveLength(SUMMARY_LIMITS.description)
    expect(admitted?.facts).toHaveLength(SUMMARY_LIMITS.facts)
    expect(admitted?.facts[0]?.name).toHaveLength(SUMMARY_LIMITS.name)
    expect(admitted?.facts[7]?.text).toHaveLength(SUMMARY_LIMITS.text)
    expect(admitted?.facts[7]?.text.startsWith('7')).toBe(true)
  })

  it.each([
    ['not an object', 'summary'],
    ['null', null],
    ['a title that is not text', { title: 1, description: '', facts: [] }],
    ['no description', { title: 't', facts: [] }],
    ['facts that are not a list', { title: 't', description: 'd', facts: {} }],
    ['a fact without text', { title: 't', description: 'd', facts: [{ name: 'n' }] }],
    ['a fact without name', { title: 't', description: 'd', facts: [{ text: 't' }] }],
    ['a fact that is null', { title: 't', description: 'd', facts: [null] }],
    ['a fact that is a number', { title: 't', description: 'd', facts: [1] }],
    ['a number', 7],
  ])('answers no summary for %s', (_, value) => {
    expect(admitSummary(value)).toBeNull()
  })
})

describe('summarizeVersion', () => {
  it('asks the category of the version, with the name and the version as context', () => {
    const point = createCategoryPoint()
    const seen: unknown[] = []
    point.contribute({
      contract: contract('note', (_, context) => {
        seen.push(context)
        return { title: 'Note', description: 'A note.', facts: [] }
      }),
      display: { title: 'Note', summary: 'Notes.' },
      point: 'note.items',
    })
    expect(summarizeVersion(point, pinned('note'))).toEqual({
      title: 'Note',
      description: 'A note.',
      facts: [],
    })
    expect(seen).toEqual([{ capabilityName: 'a', definition: 'v1' }])
  })

  it('answers no summary when the category supplies no summarize or is not registered', () => {
    const point = createCategoryPoint()
    point.contribute({
      contract: contract('note'),
      display: { title: 'Note', summary: 'Notes.' },
      point: 'note.items',
    })
    expect(summarizeVersion(point, pinned('note'))).toBeNull()
    expect(summarizeVersion(point, pinned('nobody'))).toBeNull()
  })

  it('answers no summary when summarize throws or returns a wrong shape', () => {
    const point = createCategoryPoint()
    point.contribute({
      contract: contract('thrower', () => {
        throw new Error('broken')
      }),
      display: { title: 'T', summary: 'T.' },
      point: 'thrower.items',
    })
    point.contribute({
      contract: contract('shapeless', () => ({ title: 'only a title' }) as never),
      display: { title: 'S', summary: 'S.' },
      point: 'shapeless.items',
    })
    expect(summarizeVersion(point, pinned('thrower'))).toBeNull()
    expect(summarizeVersion(point, pinned('shapeless'))).toBeNull()
  })
})

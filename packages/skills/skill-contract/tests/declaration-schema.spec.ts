import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSkillPackage } from '@omne-harness/skill-contract'
import { buildPackage, manifestText } from './package-builder.ts'

type Schema = {
  description: string
  required: string[]
  additionalProperties: boolean
  properties: Record<string, SchemaNode>
}
type SchemaNode = {
  type?: string
  description?: string
  const?: unknown
  enum?: unknown[]
  pattern?: string
  required?: string[]
  additionalProperties?: boolean
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  uniqueItems?: boolean
}

const schema: Schema = JSON.parse(
  readFileSync(new URL('../schema/skill-declaration.schema.json', import.meta.url), 'utf8'),
)

function node(...path: string[]): SchemaNode {
  let current: SchemaNode = { properties: schema.properties }
  for (const key of path) {
    const next = key === 'items' ? current.items : current.properties?.[key]
    if (next === undefined) throw new Error(`no schema node ${path.join('.')}`)
    current = next
  }
  return current
}

function verdict(declaration: unknown): string {
  return verdictOfText(JSON.stringify(declaration))
}

function verdictOfText(text: string): string {
  const built = buildPackage('demo', {
    'SKILL.md': manifestText(['name: demo', 'description: d']),
    'run.sh': 'echo',
    '.omne/skill.json': text,
  })
  const result = parseSkillPackage({ snapshot: built.snapshot, control: built.control })
  return 'ok' in result
    ? 'accepted'
    : result.failure.kind === 'rejected'
      ? result.failure.code
      : result.failure.kind
}

describe('skill-declaration.schema.json', () => {
  it('fixes the format version to 1 and closes the top-level object', () => {
    expect(schema.required).toEqual(['formatVersion'])
    expect(node('formatVersion').const).toBe(1)
    expect(node('formatVersion').type).toBe('integer')
    expect(schema.additionalProperties).toBe(false)
    expect(Object.keys(schema.properties).sort()).toEqual(
      ['dependencies', 'formatVersion', 'settings'].sort(),
    )
    expect(verdict({ formatVersion: 1, other: [] })).toBe('malformed')
  })

  it('names in its description each rule that the parser applies and the schema cannot', () => {
    for (const lexeme of ['1.0', '1e0']) {
      expect(schema.description).toContain(lexeme)
      expect(verdictOfText(`{"formatVersion": ${lexeme}}`)).toBe('declaration-format-unsupported')
    }
    expect(schema.description).toContain('setting names that repeat')
    expect(schema.description).toContain('lone surrogate')
    expect(schema.description).toContain('code points')
    expect(schema.description).toContain('repeated key')
    expect(schema.description).toContain('byte order mark')
    expect(schema.description).toContain('not UTF-8')
  })

  it('lists exactly the setting categories that the parser accepts', () => {
    const categories = node('settings', 'items', 'category').enum ?? []
    expect(categories).toEqual(['preference', 'binding'])
    for (const category of categories)
      expect(verdict({ formatVersion: 1, settings: [{ name: 'a', category }] })).toBe('accepted')
    expect(verdict({ formatVersion: 1, settings: [{ name: 'a', category: 'secret' }] })).toBe(
      'setting-category-unknown',
    )
  })

  it.each([
    ['dependencies', { category: 'tool', name: 'a' }],
    ['settings', { name: 'a', category: 'binding' }],
  ] as const)('closes each %s item and requires the same fields as the parser', (part, item) => {
    const items = node(part, 'items')
    expect(items.additionalProperties).toBe(false)
    expect(verdict({ formatVersion: 1, [part]: [{ ...item, extra: 1 }] })).toBe('malformed')
    for (const key of items.required ?? []) {
      const without = Object.fromEntries(Object.entries(item).filter(([name]) => name !== key))
      expect(verdict({ formatVersion: 1, [part]: [without] }), key).not.toBe('accepted')
    }
    const optional = Object.keys(items.properties ?? {}).filter(
      key => !(items.required ?? []).includes(key),
    )
    expect(optional).toEqual([])
  })

  it('asks for unique dependencies as the parser does', () => {
    expect(node('dependencies').uniqueItems).toBe(true)
    const tool = { category: 'tool', name: 'a' }
    expect(verdict({ formatVersion: 1, dependencies: [tool, tool] })).toBe('malformed')
  })
})

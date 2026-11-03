// The published schema of `.omne/skill.json` must agree with what `parseSkillPackage` accepts. The
// repository has no JSON Schema validator, so the test compares each rule of the schema with the
// parser on the same samples.
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

/** The rejection code of a declaration, or `accepted`. The package holds `run.sh`. */
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

const script = { entry: 'run.sh', runKind: 'shell', facilities: [] }

describe('skill-declaration.schema.json', () => {
  it('fixes the format version to 1 and closes the top-level object', () => {
    expect(schema.required).toEqual(['formatVersion'])
    expect(node('formatVersion').const).toBe(1)
    expect(node('formatVersion').type).toBe('integer')
    expect(schema.additionalProperties).toBe(false)
    expect(Object.keys(schema.properties).sort()).toEqual(
      ['dependencies', 'formatVersion', 'scripts', 'settings'].sort(),
    )
    expect(verdict({ formatVersion: 1, other: [] })).toBe('malformed')
  })

  it('names in its description each rule that the parser applies and the schema cannot', () => {
    for (const lexeme of ['1.0', '1e0']) {
      expect(schema.description).toContain(lexeme)
      expect(verdictOfText(`{"formatVersion": ${lexeme}}`)).toBe('declaration-format-unsupported')
    }
    expect(schema.description).toContain('. segments only')
    expect(verdict({ formatVersion: 1, scripts: [{ ...script, entry: './.' }] })).toBe('malformed')
    expect(schema.description).toContain('lone surrogate')
    expect(schema.description).toContain('code points')
  })

  it('lists exactly the setting categories that the parser accepts', () => {
    const categories = node('settings', 'items', 'category').enum ?? []
    expect(categories).toHaveLength(4)
    for (const category of categories)
      expect(verdict({ formatVersion: 1, settings: [{ name: 'a', category }] })).toBe('accepted')
    expect(verdict({ formatVersion: 1, settings: [{ name: 'a', category: 'secret' }] })).toBe(
      'setting-category-unknown',
    )
  })

  it.each([
    ['dependencies', { category: 'tool', name: 'a' }],
    ['scripts', script],
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
    expect(optional).toEqual(part === 'scripts' ? ['parameters'] : [])
  })

  it.each([
    'shell',
    'a',
    `a${'b'.repeat(31)}`,
    'run-kind-2',
    'Shell',
    '1a',
    '',
    `a${'b'.repeat(32)}`,
    'a_b',
  ])('agrees with the parser on the run kind and facility name %j', word => {
    const pattern = new RegExp(node('scripts', 'items', 'runKind').pattern ?? '', 'u')
    const facility = new RegExp(node('scripts', 'items', 'facilities', 'items').pattern ?? '', 'u')
    const parsed = verdict({ formatVersion: 1, scripts: [{ ...script, runKind: word }] })
    expect(pattern.test(word)).toBe(parsed === 'accepted')
    const withFacility = verdict({ formatVersion: 1, scripts: [{ ...script, facilities: [word] }] })
    expect(facility.test(word)).toBe(withFacility === 'accepted')
  })

  it.each([
    'run.sh',
    './run.sh',
    '/run.sh',
    '../run.sh',
    'a/../run.sh',
    'a\\run.sh',
    'a//run.sh',
    'a/',
    'run.sh\n',
  ])('agrees with the parser on the form of the script entry %j', entry => {
    const pattern = new RegExp(node('scripts', 'items', 'entry').pattern ?? '', 'u')
    const parsed = verdict({ formatVersion: 1, scripts: [{ ...script, entry }] })
    expect(pattern.test(entry)).toBe(parsed === 'accepted')
  })

  it('asks for unique dependencies and facilities as the parser does', () => {
    expect(node('dependencies').uniqueItems).toBe(true)
    expect(node('scripts', 'items', 'facilities').uniqueItems).toBe(true)
    const tool = { category: 'tool', name: 'a' }
    expect(verdict({ formatVersion: 1, dependencies: [tool, tool] })).toBe('malformed')
    expect(verdict({ formatVersion: 1, scripts: [{ ...script, facilities: ['n', 'n'] }] })).toBe(
      'malformed',
    )
  })
})

// What `parseSkillPackage` accepts beyond the native format, because the community Skills and the
// main hosts use it: each acceptance carries a compatibility hint in `compatibilityHints` of the
// definition, and a package without any carries no such field. A package that cannot be read at
// all stays rejected: see parse-manifest.spec.ts.
import { describe, expect, it } from 'vitest'
import { readBodyText } from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { projectAssetBody, skillBodyContract } from '@omne-harness/skill-contract'
import { manifestText } from './package-builder.ts'
import { demo, name, parse } from './parse-support.ts'

/** The definition of an accepted package, or an error naming the failure. */
function accepted(result: ReturnType<typeof parse>) {
  if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
  return result.ok
}

describe('a native package', () => {
  it('has no compatibility hints', () => {
    expect(accepted(parse('demo', { 'SKILL.md': demo() }))).not.toHaveProperty('compatibilityHints')
  })
})

describe('a description longer than 1024 characters', () => {
  it('is kept whole, with the hint description-over-limit', () => {
    const description = 'd'.repeat(1077)
    const definition = accepted(
      parse('demo', { 'SKILL.md': manifestText(['name: demo', `description: ${description}`]) }),
    )
    expect(definition.manifest.description).toBe(description)
    expect(definition.compatibilityHints).toStrictEqual(['description-over-limit'])
  })

  it('keeps 16384 characters, the limit, with the hint', () => {
    const description = 'd'.repeat(16384)
    const definition = accepted(
      parse('demo', { 'SKILL.md': manifestText(['name: demo', `description: ${description}`]) }),
    )
    expect(definition.manifest.description).toBe(description)
    expect(definition.compatibilityHints).toStrictEqual(['description-over-limit'])
  })

  it('rejects 16385 characters as malformed, by YAML and line by line alike', () => {
    const over = 'd'.repeat(16385)
    for (const lines of [
      ['name: demo', `description: ${over}`],
      ['name: demo', `description: ${over}`, 'x: a: b'],
    ])
      expect(parse('demo', { 'SKILL.md': manifestText(lines) })).toMatchObject({
        failure: { kind: 'rejected', code: 'malformed' },
      })
  })

  it('projects into an asset body that the category port takes', () => {
    const description = 'd'.repeat(1077)
    const definition = accepted(
      parse('demo', { 'SKILL.md': manifestText(['name: demo', `description: ${description}`]) }),
    )
    const body = projectAssetBody(definition)
    const read = readBodyText(writeJsonText(body), {
      maxBytes: 65536,
      maxDepth: 16,
      maxItems: 4096,
      maxMembers: 256,
      maxStringLength: 16384,
      maxNumberLength: 32,
    })
    if (read.kind !== 'ok') throw new Error(JSON.stringify(read))
    expect(skillBodyContract().judge(read.value, { capabilityName: 'demo' })).toEqual({ ok: true })
  })

  it('gives no hint at 1024 characters', () => {
    const definition = accepted(
      parse('demo', {
        'SKILL.md': manifestText(['name: demo', `description: ${'d'.repeat(1024)}`]),
      }),
    )
    expect(definition).not.toHaveProperty('compatibilityHints')
  })
})

describe('a name that differs from the package root name', () => {
  it('is the name of the definition, with the hint name-differs-from-root', () => {
    const definition = accepted(
      parse('template', { 'SKILL.md': manifestText(['name: template-skill', 'description: d']) }),
    )
    expect(definition.manifest.name).toBe('template-skill')
    expect(definition.compatibilityHints).toStrictEqual(['name-differs-from-root'])
  })

  it('is still rejected when the expected name is another one', () => {
    const result = parse(
      'template',
      { 'SKILL.md': manifestText(['name: template-skill', 'description: d']) },
      name('template'),
    )
    expect(result).toMatchObject({ failure: { kind: 'rejected', code: 'name-mismatch' } })
  })

  it('is accepted for a name read line by line too, with both hints', () => {
    const definition = accepted(
      parse('root', { 'SKILL.md': manifestText(['name: demo', 'description: a: b']) }),
    )
    expect(definition.compatibilityHints).toStrictEqual([
      'name-differs-from-root',
      'frontmatter-read-by-line',
    ])
  })
})

describe('metadata that is not a map of text', () => {
  it.each([
    [
      'a nested map',
      ['metadata:', '  credits:', '    author: Dex', '  team: core'],
      { team: 'core' },
    ],
    ['a value that is a number', ['metadata:', '  version: 1.0', '  team: core'], { team: 'core' }],
    ['a map without text values', ['metadata:', '  credits: {author: Dex}'], {}],
  ])(
    'keeps only the text values of %s, with the hint metadata-not-text-map',
    (_case, lines, kept) => {
      const definition = accepted(parse('demo', { 'SKILL.md': demo(lines) }))
      expect(definition.manifest.metadata).toStrictEqual(kept)
      expect(definition.compatibilityHints).toStrictEqual(['metadata-not-text-map'])
    },
  )

  it('leaves out metadata that is no map at all, with the hint', () => {
    const definition = accepted(parse('demo', { 'SKILL.md': demo(['metadata: [a]']) }))
    expect(definition.manifest).not.toHaveProperty('metadata')
    expect(definition.compatibilityHints).toStrictEqual(['metadata-not-text-map'])
  })
})

describe('a frontmatter that strict YAML does not read', () => {
  it.each([
    [
      'an unquoted ": " in the description',
      [
        'name: software-factory',
        'description: Shared language: the tasks it runs.',
        'disable-model-invocation: true',
      ],
      'software-factory',
      'Shared language: the tasks it runs.',
    ],
    [
      'a YAML syntax error in another field',
      ['name: demo', 'description: A demo skill.', 'x: [unclosed'],
      'demo',
      'A demo skill.',
    ],
    [
      'a duplicate key in metadata',
      ['name: demo', 'description: A demo skill.', 'metadata:', '  a: x', '  a: y'],
      'demo',
      'A demo skill.',
    ],
    [
      'a tag that YAML cannot resolve',
      ['name: demo', 'description: A demo skill.', 'x-tag: !custom value'],
      'demo',
      'A demo skill.',
    ],
    [
      'a second document',
      ['name: demo', 'description: A demo skill.', '...', 'x-after: 1'],
      'demo',
      'A demo skill.',
    ],
    [
      'quoted values and a comment',
      ['name: "demo"', "description: 'It''s: a demo.' # trailing", 'x: a: b'],
      'demo',
      "It's: a demo.",
    ],
    [
      'a plain description that goes on in indented lines',
      ['name: demo # the name', 'description: First line: and', '  the second line.', 'x: a: b'],
      'demo',
      'First line: and the second line.',
    ],
    [
      'a double-quoted description with an escape',
      ['name: demo', 'description: "Tab\\there."', 'x: a: b'],
      'demo',
      'Tab\there.',
    ],
  ])('reads name and description line by line for %s', (_case, lines, wanted, description) => {
    const definition = accepted(parse(wanted, { 'SKILL.md': manifestText(lines) }))
    expect(definition.manifest).toStrictEqual({ name: wanted, description, extra: {} })
    expect(definition.compatibilityHints).toStrictEqual(['frontmatter-read-by-line'])
  })

  it('reads the same with CRLF line ends', () => {
    const lines = ['name: demo', 'description: A: b.', 'x: a: b']
    const definition = accepted(parse('demo', { 'SKILL.md': manifestText(lines, '\r\n') }))
    expect(definition.manifest).toStrictEqual({ name: 'demo', description: 'A: b.', extra: {} })
  })

  it('gives every hint that applies, in the order of the set', () => {
    const definition = accepted(
      parse('root', {
        'SKILL.md': manifestText(['name: demo', `description: ${'d'.repeat(1025)}: x`]),
      }),
    )
    expect(definition.compatibilityHints).toStrictEqual([
      'name-differs-from-root',
      'frontmatter-read-by-line',
      'description-over-limit',
    ])
  })

  it('compares a name read line by line with the expected name', () => {
    const result = parse(
      'demo',
      { 'SKILL.md': manifestText(['name: demo', 'description: a: b']) },
      name('other'),
    )
    expect(result).toMatchObject({ failure: { kind: 'rejected', code: 'name-mismatch' } })
  })
})

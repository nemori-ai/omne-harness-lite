// SKILL.md: name-mismatch and every malformed case of the frontmatter.
import { describe, expect, it } from 'vitest'
import { manifestText } from './package-builder.ts'
import { codeOf, demo, name, parse } from './parse-support.ts'

describe('name rules', () => {
  it('rejects a name that differs from the root name even when it equals the expected name', () => {
    expect(codeOf(parse('demo', { 'SKILL.md': demo() }, name('other')))).toBe('name-mismatch')
    expect(
      codeOf(
        parse('root', { 'SKILL.md': manifestText(['name: demo', 'description: d']) }, name('demo')),
      ),
    ).toBe('name-mismatch')
  })

  it('rejects a name outside the lexicon as malformed when it equals the root name', () => {
    expect(
      codeOf(parse('Demo', { 'SKILL.md': manifestText(['name: Demo', 'description: d']) })),
    ).toBe('malformed')
  })

  it('does not change the type of a name that is not text', () => {
    expect(
      codeOf(parse('123', { 'SKILL.md': manifestText(['name: 123', 'description: d']) })),
    ).toBe('malformed')
  })
})

describe('malformed SKILL.md', () => {
  const encoder = new TextEncoder()
  it.each([
    ['a byte that is not UTF-8', new Uint8Array([...encoder.encode(demo()), 0xff])],
    ['a byte order mark', `﻿${demo()}`],
    ['no frontmatter', '# Title\nname: demo\n'],
    ['no closing delimiter', '---\nname: demo\ndescription: d\n'],
    ['no closing delimiter and no final line end', '---\nname: demo\ndescription: d'],
    ['an opening delimiter with a trailing space', '--- \nname: demo\ndescription: d\n---\n'],
    ['a closing delimiter with a trailing space', '---\nname: demo\ndescription: d\n--- \n'],
    ['an empty frontmatter', '---\n---\nBody.\n'],
    ['a frontmatter that is a list', '---\n- demo\n---\n'],
    ['a YAML syntax error', manifestText(['name: demo', 'description: [unclosed'])],
    ['a duplicate top-level key', manifestText(['name: demo', 'description: a', 'description: b'])],
    ['a duplicate key in metadata', demo(['metadata:', '  a: x', '  a: y'])],
    ['a tag that YAML cannot resolve', demo(['x-tag: !custom value'])],
    ['a binary scalar', demo(['x-bin: !!binary aGVsbG8='])],
    ['a key that is not text', demo(['x-map:', '  1: one'])],
    ['an infinite number', demo(['x-num: .inf'])],
    ['a second document', demo(['...', 'x-after: 1'])],
    ['a missing description', manifestText(['name: demo'])],
    ['an empty description', manifestText(['name: demo', 'description: ""'])],
    [
      'a description of 1025 characters',
      manifestText(['name: demo', `description: ${'d'.repeat(1025)}`]),
    ],
    ['a description that is not text', manifestText(['name: demo', 'description: 42'])],
    ['a license that is not text', demo(['license: [MIT]'])],
    ['an empty compatibility', demo(['compatibility: ""'])],
    ['a compatibility that is not text', demo(['compatibility: 5'])],
    ['metadata with a map value', demo(['metadata:', '  owner: {name: a}'])],
    ['a compatibility of 501 characters', demo([`compatibility: ${'c'.repeat(501)}`])],
    ['metadata that is not a map', demo(['metadata: [a]'])],
    ['a metadata value that is not text', demo(['metadata:', '  version: 1.0'])],
    ['allowed-tools that is not text', demo(['allowed-tools: [Read]'])],
    ['too many alias expansions', demo(aliasBomb())],
  ])('rejects %s', (_case, manifest) => {
    expect(codeOf(parse('demo', { 'SKILL.md': manifest }))).toBe('malformed')
  })

  it('keeps null, booleans and numbers of unknown fields without changing their type', () => {
    const result = parse('demo', {
      'SKILL.md': demo([
        'x-null: ~',
        'x-empty:',
        'x-true: true',
        'x-int: 7',
        'x-float: 1.5',
        'x-list: [1, "1", {k: null}]',
        'x-flow: {k}',
      ]),
    })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.manifest.extra).toEqual({
      'x-null': null,
      'x-empty': null,
      'x-true': true,
      'x-int': 7,
      'x-float': 1.5,
      'x-list': [1, '1', { k: null }],
      'x-flow': { k: null },
    })
  })

  it('leaves out every optional field that the frontmatter does not give', () => {
    const result = parse('demo', { 'SKILL.md': demo() })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.manifest).toStrictEqual({
      name: 'demo',
      description: 'A demo skill.',
      extra: {},
    })
  })

  it('keeps each optional field that the frontmatter gives', () => {
    const result = parse('demo', {
      'SKILL.md': demo([
        'license: MIT',
        'compatibility: Any shell.',
        'metadata: {team: core}',
        'allowed-tools: Read',
      ]),
    })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.manifest).toStrictEqual({
      name: 'demo',
      description: 'A demo skill.',
      license: 'MIT',
      compatibility: 'Any shell.',
      metadata: { team: 'core' },
      allowedTools: 'Read',
      extra: {},
    })
  })

  it('accepts the boundary lengths of description and compatibility', () => {
    const files = {
      'SKILL.md': manifestText([
        'name: demo',
        `description: ${'d'.repeat(1024)}`,
        `compatibility: ${'c'.repeat(500)}`,
      ]),
    }
    expect(codeOf(parse('demo', files))).toBe('accepted')
  })
})

/** Three levels of 20 aliases each: 8000 nodes from a few short lines, 4 levels deep. */
function aliasBomb(): string[] {
  const twenty = (name: string) => `[${Array.from({ length: 20 }, () => `*${name}`).join(', ')}]`
  return [
    'x-l0: &l0 [a]',
    `x-l1: &l1 ${twenty('l0')}`,
    `x-l2: &l2 ${twenty('l1')}`,
    `x-l3: ${twenty('l2')}`,
  ]
}

/** A field value of `levels` nested sequences around one scalar. */
function nested(levels: number): string {
  return `x-deep: ${'['.repeat(levels)}a${']'.repeat(levels)}`
}

describe('frontmatter budget', () => {
  it('accepts 16 nested levels, the root mapping counted, and rejects 17', () => {
    expect(codeOf(parse('demo', { 'SKILL.md': demo([nested(15)]) }))).toBe('accepted')
    expect(codeOf(parse('demo', { 'SKILL.md': demo([nested(16)]) }))).toBe('malformed')
  })

  it('accepts 4096 nodes and rejects 4097', () => {
    // The root mapping, the scalars of name and description, the list and its items.
    const list = (items: number) =>
      `x-list: [${Array.from({ length: items }, () => '1').join(', ')}]`
    expect(codeOf(parse('demo', { 'SKILL.md': demo([list(4096 - 4)]) }))).toBe('accepted')
    expect(codeOf(parse('demo', { 'SKILL.md': demo([list(4096 - 3)]) }))).toBe('malformed')
  })
})

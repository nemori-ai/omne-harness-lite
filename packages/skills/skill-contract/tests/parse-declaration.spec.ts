import { describe, expect, it } from 'vitest'
import { parseSkillPackage } from '@omne-harness/skill-contract'
import { buildPackage } from './package-builder.ts'
import { codeOf, declaration, demo, parse } from './parse-support.ts'

describe('malformed .omne/skill.json', () => {
  it.each([
    ['not JSON', '{formatVersion: 1}'],
    ['a trailing comma', '{"formatVersion": 1,}'],
    ['a duplicate key', '{"formatVersion": 1, "formatVersion": 1}'],
    ['empty input', ''],
    [
      'a string over the budget',
      declaration({
        formatVersion: 1,
        dependencies: [{ category: 'tool', name: 'n'.repeat(4097) }],
      }),
    ],
    ['a root that is not an object', '[1]'],
    ['an unknown top-level field', declaration({ formatVersion: 1, extra: true })],
    ['dependencies that are not a list', declaration({ formatVersion: 1, dependencies: {} })],
    [
      'a dependency with an extra field',
      declaration({ formatVersion: 1, dependencies: [{ category: 'tool', name: 'a', why: 'x' }] }),
    ],
    [
      'a dependency name that is not text',
      declaration({ formatVersion: 1, dependencies: [{ category: 'tool', name: 1 }] }),
    ],
    [
      'a repeated dependency',
      declaration({
        formatVersion: 1,
        dependencies: [
          { category: 'tool', name: 'a' },
          { category: 'tool', name: 'a' },
        ],
      }),
    ],
    [
      'a scripts field: a script is a file of the package, not a declaration',
      declaration({ formatVersion: 1, scripts: [] }),
    ],
    [
      'a setting without a name',
      declaration({ formatVersion: 1, settings: [{ category: 'binding' }] }),
    ],
    [
      'a setting with an empty name',
      declaration({ formatVersion: 1, settings: [{ name: '', category: 'binding' }] }),
    ],
    [
      'a setting category that is not text',
      declaration({ formatVersion: 1, settings: [{ name: 'a', category: 1 }] }),
    ],
    [
      'a repeated setting name',
      declaration({
        formatVersion: 1,
        settings: [
          { name: 'a', category: 'binding' },
          { name: 'a', category: 'preference' },
        ],
      }),
    ],
  ])('rejects %s', (_case, text) => {
    const files = { 'SKILL.md': demo(), 'run.sh': 'echo', '.omne/skill.json': text }
    expect(codeOf(parse('demo', files))).toBe('malformed')
  })

  it.each([
    ['a format version 2', declaration({ formatVersion: 2 })],
    ['no format version', declaration({ dependencies: [] })],
    ['a format version given as text', declaration({ formatVersion: '1' })],
    ['a format version that is null', declaration({ formatVersion: null })],
    ['a format version that is a boolean', declaration({ formatVersion: true })],
    ['a format version that is a list', declaration({ formatVersion: [1] })],
    ['a format version written as 1.0', '{"formatVersion": 1.0}'],
  ])('rejects %s as an unsupported format', (_case, text) => {
    expect(codeOf(parse('demo', { 'SKILL.md': demo(), '.omne/skill.json': text }))).toBe(
      'declaration-format-unsupported',
    )
  })

  it.each([
    ['a category other than tool', { category: 'skill', name: 'a' }],
    ['an empty tool name', { category: 'tool', name: '' }],
  ])('rejects %s as an invalid tool reference', (_case, dependency) => {
    const text = declaration({ formatVersion: 1, dependencies: [dependency] })
    expect(codeOf(parse('demo', { 'SKILL.md': demo(), '.omne/skill.json': text }))).toBe(
      'tool-ref-invalid',
    )
  })

  it.each(['placement-identity', 'governance'])(
    'rejects %s as an unknown setting category',
    category => {
      const text = declaration({ formatVersion: 1, settings: [{ name: 'a', category }] })
      expect(codeOf(parse('demo', { 'SKILL.md': demo(), '.omne/skill.json': text }))).toBe(
        'setting-category-unknown',
      )
    },
  )

  it('applies a smaller declaration budget that the caller gives', () => {
    const built = buildPackage('demo', {
      'SKILL.md': demo(),
      '.omne/skill.json': declaration({ formatVersion: 1 }),
    })
    const limits = {
      maxBytes: 8,
      maxDepth: 16,
      maxItems: 4096,
      maxMembers: 256,
      maxStringLength: 4096,
      maxNumberLength: 32,
    }
    expect(
      codeOf(
        parseSkillPackage({
          snapshot: built.snapshot,
          control: built.control,
          declarationLimits: limits,
        }),
      ),
    ).toBe('malformed')
  })
})

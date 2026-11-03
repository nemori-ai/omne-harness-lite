import { describe, expect, it } from 'vitest'
import {
  parseSkillPackage,
  toSkillName,
  type InspectRejectionCode,
  type SkillName,
} from '@omne-harness/skill-contract'
import {
  buildFixture,
  buildPackage,
  fixtureFiles,
  fixtureNames,
  manifestText,
  type PackageFiles,
} from './package-builder.ts'

function name(raw: string): SkillName {
  const checked = toSkillName(raw)
  if (!('ok' in checked)) throw new Error(raw)
  return checked.ok
}

function parse(rootName: string, files: PackageFiles, expectedName?: SkillName) {
  const built = buildPackage(rootName, files)
  return parseSkillPackage({
    snapshot: built.snapshot,
    control: built.control,
    ...(expectedName === undefined ? {} : { expectedName }),
  })
}

function codeOf(result: ReturnType<typeof parse>): InspectRejectionCode | 'accepted' {
  return 'ok' in result ? 'accepted' : result.failure.code
}

/** A legal SKILL.md for the root `demo`, with optional extra frontmatter lines. */
function demo(extra: readonly string[] = []): string {
  return manifestText(['name: demo', 'description: A demo skill.', ...extra])
}

function declaration(value: unknown): string {
  return JSON.stringify(value)
}

const EXPECTED: Readonly<Record<string, InspectRejectionCode | 'accepted'>> = {
  'plain-skill': 'accepted',
  'full-skill': 'accepted',
  'missing-manifest': 'manifest-missing',
  'name-mismatch': 'name-mismatch',
  'format-unsupported': 'declaration-format-unsupported',
  'script-outside': 'outside-package',
  'tool-ref-invalid': 'tool-ref-invalid',
  'setting-category-unknown': 'setting-category-unknown',
  'malformed-duplicate-key': 'malformed',
  'mismatch-before-format': 'name-mismatch',
  'tool-before-setting': 'tool-ref-invalid',
  'format-stops-declaration': 'declaration-format-unsupported',
  'outside-before-malformed': 'outside-package',
}

describe('fixture packages', () => {
  it('has an expectation for every fixture and a fixture for every rejection code', () => {
    expect(fixtureNames().sort()).toEqual(Object.keys(EXPECTED).sort())
    const codes: readonly InspectRejectionCode[] = [
      'manifest-missing',
      'name-mismatch',
      'declaration-format-unsupported',
      'outside-package',
      'tool-ref-invalid',
      'setting-category-unknown',
      'malformed',
    ]
    for (const code of codes) expect(Object.values(EXPECTED)).toContain(code)
  })

  it.each(Object.entries(EXPECTED))('%s gives %s', (fixture, expected) => {
    const built = buildFixture(fixture)
    expect(codeOf(parseSkillPackage({ snapshot: built.snapshot, control: built.control }))).toBe(
      expected,
    )
  })
})

describe('a legal package', () => {
  it('reads the manifest, keeps unknown fields as they are, and reads the declaration', () => {
    const built = buildFixture('full-skill')
    const result = parseSkillPackage({ snapshot: built.snapshot, control: built.control })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.snapshot).toBe(built.snapshot)
    expect(result.ok.manifest).toEqual({
      name: 'full-skill',
      description: 'Shows every interpreted field and one field that Skill keeps as it is.',
      license: 'Apache-2.0',
      compatibility: 'Needs a POSIX shell.',
      metadata: { author: 'example-org', version: '1.0' },
      allowedTools: 'Bash(git:*) Read',
      extra: { 'x-review': { level: 2, tags: ['alpha', 'beta'] } },
    })
    expect(result.ok.declaration.dependencies).toEqual([{ category: 'tool', name: 'read_file' }])
    expect(result.ok.declaration.settings).toEqual([
      { name: 'api-endpoint', category: 'binding' },
      { name: 'tone', category: 'preference' },
    ])
    expect(result.ok.declaration.scripts).toEqual([
      {
        entry: 'scripts/run.sh',
        runKind: 'shell',
        facilities: ['network'],
        parameters: {
          kind: 'object',
          entries: [
            { key: 'type', value: { kind: 'string', value: 'object' } },
            {
              key: 'required',
              value: { kind: 'array', items: [{ kind: 'string', value: 'target' }] },
            },
          ],
        },
      },
    ])
    expect(Object.isFrozen(result.ok)).toBe(true)
    expect(Object.isFrozen(result.ok.manifest)).toBe(true)
  })

  it('gives empty declarations when .omne/skill.json is absent or omits a part', () => {
    expect(parse('demo', { 'SKILL.md': demo() })).toMatchObject({
      ok: { declaration: { dependencies: [], scripts: [], settings: [] } },
    })
    expect(
      parse('demo', { 'SKILL.md': demo(), '.omne/skill.json': '{"formatVersion":1}' }),
    ).toMatchObject({ ok: { declaration: { dependencies: [], scripts: [], settings: [] } } })
  })

  it('accepts CRLF line ends and gives the same manifest as LF', () => {
    const lf = fixtureFiles('plain-skill')
    const text = new TextDecoder().decode(lf['SKILL.md'])
    const crlf = parse('plain-skill', { 'SKILL.md': text.replaceAll('\n', '\r\n') })
    const plain = parse('plain-skill', lf)
    if (!('ok' in crlf) || !('ok' in plain)) throw new Error('both must be accepted')
    expect(crlf.ok.manifest).toEqual(plain.ok.manifest)
    expect(crlf.ok.snapshot.digest).not.toBe(plain.ok.snapshot.digest)
  })

  it('accepts a closing delimiter on the last line without a line end', () => {
    expect(codeOf(parse('demo', { 'SKILL.md': '---\nname: demo\ndescription: d\n---' }))).toBe(
      'accepted',
    )
  })

  it('accepts every setting category and every legal script field', () => {
    const settings = ['preference', 'binding', 'placement-identity', 'governance'].map(
      (category, index) => ({ name: `s${index}`, category }),
    )
    const result = parse('demo', {
      'SKILL.md': demo(),
      'run.sh': 'echo',
      '.omne/skill.json': declaration({
        formatVersion: 1,
        settings,
        scripts: [{ entry: './run.sh', runKind: `a${'-'.repeat(31)}`, facilities: [] }],
      }),
    })
    expect(result).toMatchObject({
      ok: {
        declaration: { settings, scripts: [{ entry: 'run.sh', runKind: `a${'-'.repeat(31)}` }] },
      },
    })
  })

  it('accepts a name that equals the expected name', () => {
    expect(codeOf(parse('demo', { 'SKILL.md': demo() }, name('demo')))).toBe('accepted')
  })

  it('stores an unknown field named __proto__ as an own field', () => {
    const result = parse('demo', { 'SKILL.md': demo(['__proto__: {polluted: true}']) })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(Object.getOwnPropertyNames(result.ok.manifest.extra)).toEqual(['__proto__'])
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('resolves an alias inside a field that it keeps', () => {
    const result = parse('demo', { 'SKILL.md': demo(['x-a: &shared {k: v}', 'x-b: *shared']) })
    expect(result).toMatchObject({
      ok: { manifest: { extra: { 'x-a': { k: 'v' }, 'x-b': { k: 'v' } } } },
    })
  })
})

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

describe('rejection order', () => {
  it('gives manifest-missing before every other reason', () => {
    expect(codeOf(parse('demo', { '.omne/skill.json': declaration({ formatVersion: 9 }) }))).toBe(
      'manifest-missing',
    )
  })

  it('gives declaration-format-unsupported before outside-package and malformed', () => {
    const files = {
      'SKILL.md': manifestText(['name: demo']),
      '.omne/skill.json': declaration({
        formatVersion: 2,
        scripts: [{ entry: '../x', runKind: 'shell', facilities: [] }],
      }),
    }
    expect(codeOf(parse('demo', files))).toBe('declaration-format-unsupported')
  })

  it('gives setting-category-unknown before a malformed manifest', () => {
    const files = {
      'SKILL.md': manifestText(['name: demo']),
      '.omne/skill.json': declaration({
        formatVersion: 1,
        settings: [{ name: 'x', category: 'secret' }],
      }),
    }
    expect(codeOf(parse('demo', files))).toBe('setting-category-unknown')
  })

  it('gives tool-ref-invalid before a malformed declaration part', () => {
    const files = {
      'SKILL.md': demo(),
      '.omne/skill.json': declaration({
        formatVersion: 1,
        dependencies: [{ category: 'mcp', name: 'files' }],
        scripts: [{ entry: 'missing.sh', runKind: 'shell', facilities: [] }],
      }),
    }
    expect(codeOf(parse('demo', files))).toBe('tool-ref-invalid')
  })
})

describe('malformed SKILL.md', () => {
  const encoder = new TextEncoder()
  it.each([
    ['a byte that is not UTF-8', new Uint8Array([...encoder.encode(demo()), 0xff])],
    ['a byte order mark', `﻿${demo()}`],
    ['no frontmatter', '# Title\nname: demo\n'],
    ['no closing delimiter', '---\nname: demo\ndescription: d\n'],
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
    ['a compatibility of 501 characters', demo([`compatibility: ${'c'.repeat(501)}`])],
    ['metadata that is not a map', demo(['metadata: [a]'])],
    ['a metadata value that is not text', demo(['metadata:', '  version: 1.0'])],
    ['allowed-tools that is not text', demo(['allowed-tools: [Read]'])],
    ['too many alias expansions', demo(aliasBomb())],
  ])('rejects %s', (_case, manifest) => {
    expect(codeOf(parse('demo', { 'SKILL.md': manifest }))).toBe('malformed')
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
        settings: [{ name: 'n'.repeat(4097), category: 'binding' }],
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
      'a script without an entry',
      declaration({ formatVersion: 1, scripts: [{ runKind: 'shell', facilities: [] }] }),
    ],
    [
      'a script without facilities',
      declaration({ formatVersion: 1, scripts: [{ entry: 'run.sh', runKind: 'shell' }] }),
    ],
    [
      'a script entry that is not in the package',
      declaration({
        formatVersion: 1,
        scripts: [{ entry: 'missing.sh', runKind: 'shell', facilities: [] }],
      }),
    ],
    [
      'a script entry that is a control file',
      declaration({
        formatVersion: 1,
        scripts: [{ entry: 'SKILL.md', runKind: 'shell', facilities: [] }],
      }),
    ],
    [
      'a script entry with a backslash',
      declaration({
        formatVersion: 1,
        scripts: [{ entry: 'a\\run.sh', runKind: 'shell', facilities: [] }],
      }),
    ],
    [
      'a run kind with an uppercase letter',
      declaration({
        formatVersion: 1,
        scripts: [{ entry: 'run.sh', runKind: 'Shell', facilities: [] }],
      }),
    ],
    [
      'a run kind of 33 characters',
      declaration({
        formatVersion: 1,
        scripts: [{ entry: 'run.sh', runKind: `a${'b'.repeat(32)}`, facilities: [] }],
      }),
    ],
    [
      'a run kind that starts with a digit',
      declaration({
        formatVersion: 1,
        scripts: [{ entry: 'run.sh', runKind: '1shell', facilities: [] }],
      }),
    ],
    [
      'a facility outside the lexicon',
      declaration({
        formatVersion: 1,
        scripts: [{ entry: 'run.sh', runKind: 'shell', facilities: ['Net'] }],
      }),
    ],
    [
      'a repeated facility',
      declaration({
        formatVersion: 1,
        scripts: [{ entry: 'run.sh', runKind: 'shell', facilities: ['net', 'net'] }],
      }),
    ],
    [
      'a repeated script entry',
      declaration({
        formatVersion: 1,
        scripts: [
          { entry: 'run.sh', runKind: 'shell', facilities: [] },
          { entry: './run.sh', runKind: 'node', facilities: [] },
        ],
      }),
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
    ['no format version', declaration({ scripts: [] })],
    ['a format version given as text', declaration({ formatVersion: '1' })],
    ['a format version written as 1.0', '{"formatVersion": 1.0}'],
  ])('rejects %s as an unsupported format', (_case, text) => {
    expect(codeOf(parse('demo', { 'SKILL.md': demo(), '.omne/skill.json': text }))).toBe(
      'declaration-format-unsupported',
    )
  })

  it.each([
    ['an absolute entry', '/run.sh'],
    ['an entry with a .. segment', 'a/../../run.sh'],
  ])('rejects %s as outside the package', (_case, entry) => {
    const text = declaration({
      formatVersion: 1,
      scripts: [{ entry, runKind: 'shell', facilities: [] }],
    })
    expect(codeOf(parse('demo', { 'SKILL.md': demo(), '.omne/skill.json': text }))).toBe(
      'outside-package',
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

describe('inputs that break the precondition of the function', () => {
  it('throws when the snapshot was not made by sealSnapshot', () => {
    const built = buildPackage('demo', { 'SKILL.md': demo() })
    const forged = { ...built.snapshot }
    expect(() => parseSkillPackage({ snapshot: forged, control: built.control })).toThrow(TypeError)
  })

  it('throws when control bytes are missing or do not match the snapshot', () => {
    const built = buildPackage('demo', { 'SKILL.md': demo() })
    expect(() => parseSkillPackage({ snapshot: built.snapshot, control: {} })).toThrow(TypeError)
    expect(() =>
      parseSkillPackage({
        snapshot: built.snapshot,
        control: { manifest: new TextEncoder().encode(demo(['license: MIT'])) },
      }),
    ).toThrow(TypeError)
    expect(() =>
      parseSkillPackage({
        snapshot: built.snapshot,
        control: { ...built.control, declaration: new TextEncoder().encode('{}') },
      }),
    ).toThrow(TypeError)
  })
})

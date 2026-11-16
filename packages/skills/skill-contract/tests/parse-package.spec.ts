import { describe, expect, it } from 'vitest'
import { parseSkillPackage, type InspectRejectionCode } from '@omne-harness/skill-contract'
import {
  buildFixture,
  buildPackage,
  fixtureFiles,
  fixtureNames,
  manifestText,
} from './package-builder.ts'
import { codeOf, declaration, demo, name, parse } from './parse-support.ts'

const EXPECTED: Readonly<Record<string, InspectRejectionCode | 'accepted'>> = {
  'plain-skill': 'accepted',
  'full-skill': 'accepted',
  'missing-manifest': 'manifest-missing',
  'name-mismatch': 'name-mismatch',
  'format-unsupported': 'declaration-format-unsupported',
  'tool-ref-invalid': 'tool-ref-invalid',
  'malformed-duplicate-key': 'malformed',
  'mismatch-before-format': 'name-mismatch',
  'tool-before-malformed': 'tool-ref-invalid',
  'format-stops-declaration': 'declaration-format-unsupported',
}

describe('fixture packages', () => {
  it('has an expectation for every fixture and a fixture for every parse rejection code', () => {
    expect(fixtureNames().sort()).toEqual(Object.keys(EXPECTED).sort())
    const codes: readonly InspectRejectionCode[] = [
      'manifest-missing',
      'name-mismatch',
      'declaration-format-unsupported',
      'tool-ref-invalid',
      'malformed',
    ]
    for (const code of codes) expect(Object.values(EXPECTED)).toContain(code)
  })

  it.each(Object.entries(EXPECTED))('%s gives %s', (fixture, expected) => {
    const built = buildFixture(fixture)
    expect(
      codeOf(
        parseSkillPackage({
          snapshot: built.snapshot,
          control: built.control,
          expectedName: name(fixture),
        }),
      ),
    ).toBe(expected)
  })
})

describe('a legal package', () => {
  it('accepts an expected name that equals the root name and the manifest name', () => {
    const built = buildFixture('full-skill')
    const result = parseSkillPackage({
      snapshot: built.snapshot,
      control: built.control,
      expectedName: name('full-skill'),
    })
    expect(result).toHaveProperty('ok')
  })

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
    expect(Object.isFrozen(result.ok)).toBe(true)
    expect(Object.isFrozen(result.ok.manifest)).toBe(true)
  })

  it('gives empty declarations when .omne/skill.json is absent or omits a part', () => {
    expect(parse('demo', { 'SKILL.md': demo() })).toMatchObject({
      ok: { declaration: { dependencies: [] } },
    })
    expect(
      parse('demo', { 'SKILL.md': demo(), '.omne/skill.json': '{"formatVersion":1}' }),
    ).toMatchObject({ ok: { declaration: { dependencies: [] } } })
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

describe('rejection order', () => {
  it('gives manifest-missing before every other reason', () => {
    expect(codeOf(parse('demo', { '.omne/skill.json': declaration({ formatVersion: 9 }) }))).toBe(
      'manifest-missing',
    )
  })

  it('gives declaration-format-unsupported before malformed', () => {
    const files = {
      'SKILL.md': manifestText(['name: demo']),
      '.omne/skill.json': declaration({ formatVersion: 2, dependencies: {} }),
    }
    expect(codeOf(parse('demo', files))).toBe('declaration-format-unsupported')
  })

  it('gives tool-ref-invalid before a malformed declaration part', () => {
    const files = {
      'SKILL.md': demo(),
      '.omne/skill.json': declaration({
        formatVersion: 1,
        dependencies: [{ category: 'mcp', name: 'files' }],
        extra: true,
      }),
    }
    expect(codeOf(parse('demo', files))).toBe('tool-ref-invalid')
  })
})

describe('inputs that break the precondition of the function', () => {
  it('throws when the snapshot was not made by sealSnapshot', () => {
    const built = buildPackage('demo', { 'SKILL.md': demo() })
    const forged = { ...built.snapshot }
    expect(() => parseSkillPackage({ snapshot: forged, control: built.control })).toThrow(
      new TypeError('the snapshot was not made by sealSnapshot'),
    )
  })
})

describe('control bytes that do not belong to the snapshot', () => {
  const built = buildPackage('demo', { 'SKILL.md': demo() })
  const changed = { kind: 'version-changed' }

  it('gives version-changed when the bytes have another digest than the entry', () => {
    const manifest = new TextEncoder().encode(demo(['license: MIT']))
    expect(parseSkillPackage({ snapshot: built.snapshot, control: { manifest } })).toEqual({
      failure: changed,
    })
  })

  it('gives version-changed when the bytes of a listed control file are missing', () => {
    expect(parseSkillPackage({ snapshot: built.snapshot, control: {} })).toEqual({
      failure: changed,
    })
  })

  it('gives version-changed when bytes come for a control file that the snapshot does not list', () => {
    const declaration = new TextEncoder().encode('{"formatVersion":1}')
    expect(
      parseSkillPackage({ snapshot: built.snapshot, control: { ...built.control, declaration } }),
    ).toEqual({ failure: changed })
  })

  it('gives version-changed before manifest-missing', () => {
    const empty = buildPackage('demo', { 'notes.txt': 'x' })
    const manifest = new TextEncoder().encode(demo())
    expect(parseSkillPackage({ snapshot: empty.snapshot, control: { manifest } })).toEqual({
      failure: changed,
    })
  })
})

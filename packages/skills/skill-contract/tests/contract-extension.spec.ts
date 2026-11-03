// The additive extension of the `skill` body: description, scripts, settings and package.digest.
// The original body rules stay in contract.spec.ts, unchanged.
import { describe, expect, it } from 'vitest'
import { readBodyText, type JsonLimits, type JsonValue } from '@omne-harness/assets'
import { skillBodyContract } from '@omne-harness/skill-contract'

const limits: JsonLimits = {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 4096,
  maxNumberLength: 32,
}

function body(value: Record<string, unknown>): JsonValue {
  const read = readBodyText(JSON.stringify({ name: 'review', ...value }), limits)
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

const DIGEST = `sha256:${'ab'.repeat(32)}`
const script = { entry: 'scripts/run.sh', runKind: 'shell', facilities: ['network'] }
const full = {
  description: 'Reviews a change.',
  tools: [{ category: 'tool', name: 'read_file' }],
  scripts: [{ ...script, parameters: { type: 'object' } }],
  settings: [
    { name: 'api-endpoint', category: 'binding' },
    { name: 'tone', category: 'preference' },
    { name: 'region', category: 'placement-identity' },
    { name: 'audit', category: 'governance' },
  ],
  package: { digest: DIGEST },
}

describe('the extended skill body', () => {
  const port = skillBodyContract()

  it('accepts a body with every extension field', () => {
    expect(port.judge(body(full), { capabilityName: 'review' })).toEqual({ ok: true })
  })

  it.each(['description', 'scripts', 'settings', 'package'])('accepts a body without %s', key => {
    const rest = Object.fromEntries(Object.entries(full).filter(([name]) => name !== key))
    expect(port.judge(body(rest))).toEqual({ ok: true })
  })

  it.each([
    ['a description that is not text', { description: 3 }, 'malformed'],
    ['an empty description', { description: '' }, 'malformed'],
    ['a description of 1025 characters', { description: 'd'.repeat(1025) }, 'malformed'],
    ['scripts that are not a list', { scripts: {} }, 'malformed'],
    [
      'a script entry outside the package',
      { scripts: [{ ...script, entry: '../x.sh' }] },
      'outside-package',
    ],
    ['a script entry that is not a path', { scripts: [{ ...script, entry: 'a\\b' }] }, 'malformed'],
    ['a run kind outside the lexicon', { scripts: [{ ...script, runKind: 'Shell' }] }, 'malformed'],
    ['a script with an unknown field', { scripts: [{ ...script, mode: 'x' }] }, 'malformed'],
    ['settings that are not a list', { settings: 'x' }, 'malformed'],
    [
      'a setting category that is unknown',
      { settings: [{ name: 'a', category: 'secret' }] },
      'setting-category-unknown',
    ],
    ['a setting without a name', { settings: [{ category: 'binding' }] }, 'malformed'],
    [
      'a repeated setting name',
      {
        settings: [
          { name: 'a', category: 'binding' },
          { name: 'a', category: 'governance' },
        ],
      },
      'malformed',
    ],
    ['a package that is not an object', { package: DIGEST }, 'malformed'],
    ['a package without a digest', { package: {} }, 'malformed'],
    [
      'a package digest in another form',
      { package: { digest: DIGEST.toUpperCase() } },
      'malformed',
    ],
    ['a package with an unknown field', { package: { digest: DIGEST, size: 1 } }, 'malformed'],
  ])('rejects %s', (_case, value, rejected) => {
    const judged = body({ ...full, ...value })
    expect(port.judge(judged)).toEqual({ ok: false, rejected })
    expect(() => port.deriveDeclarations(judged)).toThrow(`failed judgment: ${rejected}`)
    expect(() => port.references(judged)).toThrow(`failed judgment: ${rejected}`)
  })

  it('gives the original reasons before the reasons of the extension', () => {
    const bad = { settings: [{ name: 'a', category: 'secret' }] }
    expect(port.judge(body({ ...bad, name: 'other' }), { capabilityName: 'review' })).toEqual({
      ok: false,
      rejected: 'name-mismatch',
    })
    expect(port.judge(body({ ...bad, tools: [{ category: 'mcp', name: 'x' }] }))).toEqual({
      ok: false,
      rejected: 'incomplete-reference',
    })
  })

  it('gives outside-package before setting-category-unknown before malformed', () => {
    const outside = { scripts: [{ ...script, entry: '/x.sh' }] }
    const category = { settings: [{ name: 'a', category: 'secret' }] }
    const malformed = { description: '' }
    expect(port.judge(body({ ...malformed, ...category, ...outside }))).toEqual({
      ok: false,
      rejected: 'outside-package',
    })
    expect(port.judge(body({ ...malformed, ...category }))).toEqual({
      ok: false,
      rejected: 'setting-category-unknown',
    })
  })
})

describe('deriveDeclarations', () => {
  const port = skillBodyContract()

  it('derives one setting:<category>:<name> entry for each setting, in order', () => {
    expect(port.deriveDeclarations(body(full))).toEqual({
      entries: [
        'setting:binding:api-endpoint',
        'setting:preference:tone',
        'setting:placement-identity:region',
        'setting:governance:audit',
      ],
    })
  })

  it('derives no entry from dependencies or scripts, and none from an original body', () => {
    const { settings: _dropped, ...rest } = full
    expect(port.deriveDeclarations(body(rest))).toEqual({ entries: [] })
    expect(port.deriveDeclarations(body({ tools: [] }))).toEqual({ entries: [] })
  })

  it('still gives the tool references of an extended body', () => {
    expect(port.references(body(full))).toEqual([{ category: 'tool', name: 'read_file' }])
  })
})

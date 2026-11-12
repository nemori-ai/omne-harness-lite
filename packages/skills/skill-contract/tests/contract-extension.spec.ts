// The additive extension of the `skill` body: description and package.digest.
// The original body rules stay in contract.spec.ts, unchanged.
import { describe, expect, it } from 'vitest'
import { readBodyText, type JsonLimits, type JsonValue } from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { skillBodyContract } from '@omne-harness/skill-contract'

/** A reader budget large enough for a description of DESCRIPTION_LIMIT characters outside the
 * basic plane (4 bytes and 2 UTF-16 units each). */
const limits: JsonLimits = {
  maxBytes: 262_144,
  maxDepth: 16,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 65_536,
  maxNumberLength: 32,
}

function body(value: Record<string, unknown>): JsonValue {
  const read = readBodyText(JSON.stringify({ name: 'review', ...value }), limits)
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

const DIGEST = `sha256:${'ab'.repeat(32)}`
const full = {
  description: 'Reviews a change.',
  tools: [{ category: 'tool', name: 'read_file' }],
  package: { digest: DIGEST },
}

describe('the extended skill body', () => {
  const port = skillBodyContract()

  it('accepts a body with every extension field', () => {
    expect(port.judge(body(full), { capabilityName: 'review' })).toEqual({ ok: true })
  })

  it.each(['description', 'package'])('accepts a body without %s', key => {
    const rest = Object.fromEntries(Object.entries(full).filter(([name]) => name !== key))
    expect(port.judge(body(rest))).toEqual({ ok: true })
  })

  it.each([
    ['a description that is not text', { description: 3 }, 'malformed'],
    ['an empty description', { description: '' }, 'malformed'],
    ['a description of 16385 characters', { description: 'd'.repeat(16385) }, 'malformed'],
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

  it.each([
    ['one character', 'd'],
    ['1025 characters', 'd'.repeat(1025)],
    ['16384 characters', 'd'.repeat(16384)],
    ['16384 characters outside the basic plane', '😀'.repeat(16384)],
  ])('accepts a description of %s', (_case, description) => {
    expect(port.judge(body({ ...full, description }))).toEqual({ ok: true })
  })

  it.each([
    ['an uppercase letter', 'Review'],
    ['consecutive hyphens', 're--view'],
    ['65 characters', 'r'.repeat(65)],
    ['an underscore', 're_view'],
  ])('rejects a name with %s as name-invalid', (_case, name) => {
    const judged = body({ ...full, name })
    expect(port.judge(judged)).toEqual({ ok: false, rejected: 'name-invalid' })
    expect(() => port.deriveDeclarations(judged)).toThrow('failed judgment: name-invalid')
  })

  it('gives name-mismatch before name-invalid, and name-invalid before a bad tool reference', () => {
    expect(port.judge(body({ ...full, name: 'Other' }), { capabilityName: 'review' })).toEqual({
      ok: false,
      rejected: 'name-mismatch',
    })
    expect(
      port.judge(body({ ...full, name: 'Bad', tools: [{ category: 'mcp', name: 'x' }] })),
    ).toEqual({
      ok: false,
      rejected: 'name-invalid',
    })
  })

  it('gives the original reasons before the reasons of the extension', () => {
    const bad = { description: '' }
    expect(port.judge(body({ ...bad, name: 'other' }), { capabilityName: 'review' })).toEqual({
      ok: false,
      rejected: 'name-mismatch',
    })
    expect(port.judge(body({ ...bad, tools: [{ category: 'mcp', name: 'x' }] }))).toEqual({
      ok: false,
      rejected: 'incomplete-reference',
    })
  })

})

describe('the schema value of the port', () => {
  it('names every body field', () => {
    const schema = JSON.parse(writeJsonText(skillBodyContract().schema))
    expect(schema.kind).toBe('skill-body')
    expect(Object.keys(schema.properties)).toEqual(['name', 'description', 'tools', 'package'])
    expect(schema.properties.tools).toEqual({ category: 'tool', name: 'string' })
    expect(schema.properties.package).toEqual({ digest: 'string' })
  })
})

describe('deriveDeclarations', () => {
  const port = skillBodyContract()

  it('derives no entry from an extended body, and none from an original body', () => {
    expect(port.deriveDeclarations(body(full))).toEqual({ entries: [] })
    expect(port.deriveDeclarations(body({ tools: [] }))).toEqual({ entries: [] })
  })

  it('still gives the tool references of an extended body', () => {
    expect(port.references(body(full))).toEqual([{ category: 'tool', name: 'read_file' }])
  })
})

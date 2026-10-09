import { adoptedSchemaBytes } from './adopted-schema-input.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  judgeSkillPackage,
  readSkillMd,
  readSkillPackage,
  schemaId,
  skillBodyContract,
  SCHEMA_DEF_NAMES,
  validate,
  type SkillPackageEntry,
} from '@omne-harness-lite/skill-package'
import * as valuesV2 from '@omne-harness-lite/skill-package/v2'
import schema from '@omne-harness-lite/skill-package/schema' with { type: 'json' }
import schemaV2 from '@omne-harness-lite/skill-package/schema/v2' with { type: 'json' }
import normative from './fixtures/text-v3.json' with { type: 'json' }

function fixtureText(index: number): string {
  const text = normative.rows[index]?.text
  if (text === undefined) throw new Error('missing frozen text fixture')
  return text
}
const ambiguity = fixtureText(0)
function entries(text = ambiguity): readonly SkillPackageEntry[] {
  return [{ kind: 'file', path: 'SKILL.md', text }]
}
const rejected = { rejected: 'malformed', malformed: 'M16' }
describe('D069 precise frozen v3 input adoption', () => {
  it('binds all new normative text cases and both schema bytes to accepted resources', () => {
    const source = readFileSync(new URL('fixtures/package-examples.md', import.meta.url))
    expect(createHash('sha256').update(source).digest('hex')).toBe(normative.sourceSha256)
    expect(normative.rows).toHaveLength(14)
    for (const [path, version] of [
      ['skill-package.schema.json', 3],
      ['skill-package.v2.schema.json', 2],
    ] as const) {
      expect(readFileSync(new URL('../schema/' + path, import.meta.url))).toEqual(
        adoptedSchemaBytes('skill-package', version),
      )
    }
    expect(schemaId).toBe(schema.$id)
    expect(valuesV2.schemaId).toBe(schemaV2.$id)
    expect(skillBodyContract.schema).toEqual(schema)
    expect(valuesV2.skillBodyContract.schema).toEqual(schemaV2)
    expect('readSkillMd' in valuesV2).toBe(false)
    expect('readSkillPackage' in valuesV2).toBe(false)
  })
  for (const [index, row] of normative.rows.entries()) {
    it(`v3 examples 6.1 row ${index + 1}: full graph checked before projection`, () => {
      const result = readSkillMd(row.text)
      if (!row.accepted) expect(result).toEqual(rejected)
      else {
        expect(result).toHaveProperty('ok')
        if (!('ok' in result)) throw new Error('accepted text did not produce values')
        expect(result.ok.manifest).toEqual({ name: 'x', description: 'd' })
        expect(result.ok.body).toBe(row.body)
        expect(result.ok.unknownKeys.length).toBeGreaterThan(0)
      }
    })
  }
  it('v3 directory row 9 propagates text M16', () => {
    expect(readSkillPackage(entries())).toEqual(rejected)
  })
  it('v3 directory row 10 rejects nested ignored ambiguity even with ordinary resources', () => {
    const row = normative.rows[2]
    if (row === undefined) throw new Error('missing nested ambiguity fixture')
    expect(
      readSkillPackage([...entries(row.text), { kind: 'file', path: 'references/a.md' }]),
    ).toEqual(rejected)
  })
  it('v3 directory row 11 preserves valid CRLF text and all unknown key traces', () => {
    const row = normative.rows[10]
    if (row === undefined) throw new Error('missing CRLF fixture')
    const result = readSkillPackage([
      ...entries(row.text),
      { kind: 'file', path: 'references/a.md' },
    ])
    if (!('ok' in result)) throw new Error('accepted directory did not produce package')
    expect(result.ok.package).toEqual({
      manifest: { name: 'x', description: 'd' },
      body: row.body,
      resources: [{ path: 'references/a.md' }],
    })
    expect(result.ok.unknownKeys).toHaveLength(2)
  })
})
describe('S24 independently determined priority across malformed text and given observations', () => {
  for (const entry of [
    { kind: 'file', path: '../outside' },
    { kind: 'link', path: 'shared', resolution: 'outside' },
  ] as const) {
    it(`escape ${entry.path} outranks text ambiguity and malformed definition`, () => {
      expect(readSkillMd(ambiguity)).toEqual(rejected)
      expect(
        readSkillPackage([
          ...entries(),
          entry,
          { kind: 'file', path: '.omne/skill.json', text: '{' },
        ]),
      ).toEqual({ rejected: 'resource_escapes' })
    })
  }
  for (const [definition, rejection] of [
    [{ format: 2, tools: [{ category: 'skill', name: 'x' }] }, 'definition_format_unsupported'],
    [{ format: 1, tools: [{ category: 'skill', name: 'x' }] }, 'tool_ref_invalid'],
    [
      { format: 1, environmentRequirement: { bindingLayer: 'unknown', facilities: [] } },
      'binding_layer_unknown',
    ],
    [{ format: 1, settings: [{ category: 'unknown' }] }, 'setting_category_unknown'],
  ] as const) {
    it(`${rejection} remains determinable without invented manifest/name facts`, () => {
      expect(
        readSkillPackage(
          [
            ...entries(),
            { kind: 'file', path: '.omne/skill.json', text: JSON.stringify(definition) },
          ],
          { capabilityName: 'Other' },
        ),
      ).toEqual({ rejected: rejection })
    })
  }
  it('missing SKILL.md outranks all independently observed errors', () => {
    expect(
      readSkillPackage([
        { kind: 'file', path: '../outside' },
        { kind: 'file', path: '.omne/skill.json', text: '{"format":2}' },
      ]),
    ).toEqual({ rejected: 'manifest_missing' })
  })
  it('unknown text names are not fabricated to report a name mismatch', () => {
    expect(readSkillPackage(entries(), { capabilityName: 'Other' })).toEqual(rejected)
  })
  it('given unsupported definition format outranks escape while text is malformed', () => {
    expect(
      readSkillPackage([
        ...entries(),
        { kind: 'file', path: '.omne/skill.json', text: '{"format":2}' },
        { kind: 'file', path: '../outside' },
      ]),
    ).toEqual({ rejected: 'definition_format_unsupported' })
  })
})
describe('finite exact version contexts include author domain compilation', () => {
  function pkg(reference: string) {
    return {
      manifest: { name: 'x', description: 'd' },
      body: 'verbatim',
      resources: [],
      definition: {
        format: 1,
        settings: [
          {
            item: 'name',
            kind: 'setting',
            category: 'preference',
            domain: { kind: 'open', schema: { $ref: reference + '#/$defs/SkillName' } },
            default: 'valid:name',
          },
        ],
      },
    }
  }
  for (const reference of [schemaId, valuesV2.schemaId]) {
    it(`current3 accepts own3 and the frozen2 transitive dependency: ${reference}`, () => {
      const value = pkg(reference)
      expect(judgeSkillPackage(value)).toEqual({ ok: true })
      expect(skillBodyContract.judge(value)).toEqual({ ok: true })
    })
  }
  it('old2 accepts own2 and refuses own3 at judge and body boundaries with M12', () => {
    const own2 = pkg(valuesV2.schemaId),
      own3 = pkg(schemaId)
    expect(valuesV2.judgeSkillPackage(own2)).toEqual({ ok: true })
    expect(valuesV2.skillBodyContract.judge(own2)).toEqual({ ok: true })
    expect(valuesV2.judgeSkillPackage(own3)).toEqual({ rejected: 'malformed', malformed: 'M12' })
    expect(valuesV2.skillBodyContract.judge(own3)).toEqual({
      rejected: 'malformed',
      malformed: 'M12',
    })
    expect(valuesV2.isSkillPackage(own3)).toBe(false)
    expect(() => valuesV2.skillBodyContract.deriveDeclarations(own3)).toThrow(TypeError)
    expect(() => valuesV2.skillBodyContract.references(own3)).toThrow(TypeError)
  })
  it('both version bindings really compile every own definition', () => {
    expect(SCHEMA_DEF_NAMES).toHaveLength(5)
    for (const name of SCHEMA_DEF_NAMES) {
      expect(validate(name, null).valid).toBe(false)
      expect(valuesV2.validate(name, null).valid).toBe(false)
    }
  })
})

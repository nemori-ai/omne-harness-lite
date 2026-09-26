import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeSkillPackage, validate, type SchemaDefName } from '@omne-harness-lite/skill-package'
import normative from './fixtures/normative.json' with { type: 'json' }

function json(text: string) {
  const value = readJsonStrict(text)
  if ('failed' in value) throw new Error('invalid normative JSON')
  return value.ok
}
function base(index = 0): Record<string, unknown> {
  const value: unknown = structuredClone(normative.packages[index])
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('missing normative base')
  return value as Record<string, unknown>
}
function mutate(
  index: number,
  change: (value: Record<string, unknown>) => void,
): Record<string, unknown> {
  const result = base(index)
  change(result)
  return result
}
function definition(pkg: Record<string, unknown>): Record<string, unknown> {
  const value = pkg.definition
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid fixture definition')
  return value as Record<string, unknown>
}
function checklist(pkg: Record<string, unknown>): Record<string, unknown> {
  const value = definition(pkg).settings
  if (!Array.isArray(value) || typeof value[0] !== 'object' || value[0] === null)
    throw new Error('invalid fixture checklist')
  return value[0] as Record<string, unknown>
}
function resource(pkg: Record<string, unknown>, path: string): void {
  if (!Array.isArray(pkg.resources)) throw new Error('fixture resources missing')
  pkg.resources.push({ path })
}
function tool(pkg: Record<string, unknown>, category: string): void {
  const d = definition(pkg)
  if (!Array.isArray(d.tools)) d.tools = []
  if (!Array.isArray(d.tools)) throw new Error('invalid fixture tools')
  d.tools.push({ category, name: 'example' })
}
function cloud(pkg: Record<string, unknown>): void {
  definition(pkg).environmentRequirement = { bindingLayer: 'cloud_vm', facilities: [] }
}
interface Case {
  readonly id: string
  readonly value: unknown
  readonly schema: boolean
  readonly rejected?: string
  readonly malformed?: string
  readonly capabilityName?: string
}
const variants: Case[] = [
  {
    id: '5.1.1',
    value: mutate(0, p => {
      delete p.manifest
    }),
    schema: false,
    rejected: 'manifest_missing',
  },
  {
    id: '5.1.2',
    value: mutate(0, p => {
      delete p.body
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M2',
  },
  {
    id: '5.1.3',
    value: mutate(0, p => {
      p.body = ''
    }),
    schema: true,
  },
  {
    id: '5.1.4',
    value: mutate(0, p => {
      delete p.resources
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M2',
  },
  {
    id: '5.1.5',
    value: mutate(0, p => {
      p.resident = true
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M3',
  },
  {
    id: '5.1.6',
    value: mutate(0, p => {
      p.capability = { category: 'skill', name: 'code-review' }
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M3',
  },
  { id: '5.1.7', value: base(), schema: true, capabilityName: 'code-review' },
  {
    id: '5.1.8',
    value: base(),
    schema: true,
    capabilityName: 'Code-Review',
    rejected: 'name_mismatch',
  },
  {
    id: '5.2.1',
    value: mutate(1, p => {
      definition(p).format = 2
    }),
    schema: false,
    rejected: 'definition_format_unsupported',
  },
  {
    id: '5.2.2',
    value: mutate(1, p => {
      tool(p, 'skill')
    }),
    schema: false,
    rejected: 'tool_ref_invalid',
  },
  {
    id: '5.2.3',
    value: mutate(1, p => {
      resource(p, '../shared/strict.md')
    }),
    schema: false,
    rejected: 'resource_escapes',
  },
  {
    id: '5.2.4',
    value: mutate(1, p => {
      definition(p).permissions = []
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M3',
  },
  {
    id: '5.2.5',
    value: mutate(1, p => {
      checklist(p).default = 'references/other.md'
    }),
    schema: true,
    rejected: 'malformed',
    malformed: 'M12',
  },
  {
    id: '5.3.1',
    value: mutate(2, p => {
      p.resources = [{ path: 'references/labels.md', mediaType: 'text/markdown' }]
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M14',
  },
  {
    id: '5.3.2',
    value: mutate(2, p => {
      p.resources = [{ path: 'bin/triage.py' }]
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M14',
  },
  {
    id: '5.3.3',
    value: mutate(2, p => {
      p.resources = [{ path: 'scripts' }]
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M14',
  },
  {
    id: '5.3.4',
    value: mutate(2, p => {
      delete definition(p).environmentRequirement
    }),
    schema: true,
  },
  {
    id: '5.3.5',
    value: mutate(2, p => {
      definition(p).settings = [
        {
          item: 'targetEnvironment',
          kind: 'setting',
          category: 'placement_identity',
          domain: { kind: 'open', schema: { type: 'object' } },
        },
      ]
    }),
    schema: true,
  },
  {
    id: '5.3.6',
    value: mutate(2, p => {
      definition(p).tools = [{ category: 'mcp', name: 'github' }]
    }),
    schema: false,
    rejected: 'tool_ref_invalid',
  },
  { id: '7.1', value: { body: 'x', resources: [] }, schema: false, rejected: 'manifest_missing' },
  {
    id: '7.2',
    value: base(),
    schema: true,
    capabilityName: 'Code-Review',
    rejected: 'name_mismatch',
  },
  {
    id: '7.3',
    value: mutate(1, p => {
      definition(p).format = 2
    }),
    schema: false,
    rejected: 'definition_format_unsupported',
  },
  {
    id: '7.4',
    value: mutate(0, p => {
      p.resources = [{ path: '/etc/passwd' }]
    }),
    schema: false,
    rejected: 'resource_escapes',
  },
  {
    id: '7.5',
    value: mutate(0, p => {
      p.definition = { format: 1, tools: [{ category: 'skill', name: 'style-guide' }] }
    }),
    schema: false,
    rejected: 'tool_ref_invalid',
  },
  { id: '7.6', value: mutate(2, cloud), schema: false, rejected: 'binding_layer_unknown' },
  {
    id: '7.7',
    value: mutate(1, p => {
      checklist(p).category = 'security'
    }),
    schema: false,
    rejected: 'setting_category_unknown',
  },
  {
    id: '7.8',
    value: mutate(0, p => {
      p.body = null
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M4',
  },
  {
    id: '8.1',
    value: { body: 'x', resources: [{ path: '/etc/passwd' }], definition: { format: 2 } },
    schema: false,
    rejected: 'manifest_missing',
  },
  {
    id: '8.2',
    value: mutate(0, p => {
      p.resources = [{ path: '../x' }]
    }),
    schema: false,
    capabilityName: 'other',
    rejected: 'name_mismatch',
  },
  {
    id: '8.3',
    value: mutate(1, p => {
      definition(p).format = 2
      tool(p, 'skill')
    }),
    schema: false,
    rejected: 'definition_format_unsupported',
  },
  {
    id: '8.4',
    value: mutate(1, p => {
      resource(p, 'C:/x')
      tool(p, 'mcp')
    }),
    schema: false,
    rejected: 'resource_escapes',
  },
  {
    id: '8.5',
    value: mutate(1, p => {
      tool(p, 'skill')
      definition(p).dependencies = ['a', 'a']
    }),
    schema: false,
    rejected: 'tool_ref_invalid',
  },
  {
    id: '8.6',
    value: mutate(1, p => {
      tool(p, 'mcp')
      checklist(p).category = 'security'
    }),
    schema: false,
    rejected: 'tool_ref_invalid',
  },
  {
    id: '8.7',
    value: mutate(2, p => {
      cloud(p)
      definition(p).tools = [{ category: 'mcp', name: 'github' }]
    }),
    schema: false,
    rejected: 'tool_ref_invalid',
  },
  {
    id: '8.8',
    value: mutate(2, p => {
      cloud(p)
      definition(p).dependencies = ['']
    }),
    schema: false,
    rejected: 'binding_layer_unknown',
  },
  {
    id: '8.9',
    value: mutate(1, p => {
      const item = checklist(p)
      item.category = 'security'
      definition(p).settings = [item, { ...item }]
    }),
    schema: false,
    rejected: 'setting_category_unknown',
  },
  {
    id: '8.10',
    value: mutate(0, p => {
      p.manifest = { name: 'code/review', description: 'd' }
    }),
    schema: false,
    capabilityName: 'code-review',
    rejected: 'name_mismatch',
  },
  {
    id: '8.11',
    value: mutate(0, p => {
      p.manifest = { name: 'code/review', description: 'd' }
    }),
    schema: false,
    rejected: 'malformed',
    malformed: 'M6',
  },
  {
    id: '9.1',
    value: mutate(0, p => {
      p.resources = [{ path: 'a.md' }, { path: 'a.md', mediaType: 'text/markdown' }]
    }),
    schema: true,
    rejected: 'malformed',
    malformed: 'M8',
  },
  {
    id: '9.2',
    value: mutate(0, p => {
      p.resources = [{ path: 'scripts' }, { path: 'scripts/a.py' }]
    }),
    schema: true,
    rejected: 'malformed',
    malformed: 'M8',
  },
  {
    id: '9.3',
    value: mutate(1, p => {
      definition(p).settings = [checklist(p), { ...checklist(p), default: 'references/lenient.md' }]
    }),
    schema: true,
    rejected: 'malformed',
    malformed: 'M12',
  },
  {
    id: '9.4',
    value: mutate(1, p => {
      checklist(p).default = 'references/other.md'
    }),
    schema: true,
    rejected: 'malformed',
    malformed: 'M12',
  },
  {
    id: '9.5',
    value: base(),
    schema: true,
    capabilityName: 'Code-Review',
    rejected: 'name_mismatch',
  },
]
describe('frozen normative examples: all rows and variants', () => {
  it('binds fixture bytes to the frozen spec and exact package Schema', () => {
    const source = readFileSync(
      new URL(
        '../../../../.meta_harness/design/spec/data/skill-package/v3/examples.md',
        import.meta.url,
      ),
    )
    expect(createHash('sha256').update(source).digest('hex')).toBe(normative.sourceSha256)
    expect(readFileSync(new URL('../schema/skill-package.schema.json', import.meta.url))).toEqual(
      readFileSync(
        new URL(
          '../../../../.meta_harness/design/spec/data/skill-package/v3/skill-package.schema.json',
          import.meta.url,
        ),
      ),
    )
    expect(normative.rows).toHaveLength(79)
    expect(variants).toHaveLength(43)
  })
  for (const row of normative.rows) {
    const definition = row.definition as SchemaDefName
    it(`${row.id}: Schema`, () => {
      expect(validate(definition, json(JSON.stringify(row.value))).valid).toBe(row.schema)
    })
    it(`${row.id}: exact rejection including malformed code`, () => {
      let pkg: unknown
      if (definition === 'SkillName')
        pkg = { ...base(), manifest: { name: row.value, description: 'd' } }
      else if (definition === 'SkillManifest') pkg = { ...base(), manifest: row.value }
      else if (definition === 'ResourceEntry') pkg = { ...base(), resources: [row.value] }
      else pkg = { ...base(), definition: row.value, resources: [{ path: 'scripts/run.py' }] }
      const expected =
        row.rejected === null
          ? { ok: true }
          : {
              rejected: row.rejected,
              ...(row.malformed === null ? {} : { malformed: row.malformed }),
            }
      expect(judgeSkillPackage(json(JSON.stringify(pkg)))).toEqual(expected)
    })
  }
  for (const [index, pkg] of normative.packages.entries()) {
    it(`5.${index + 1} base: Schema + judgment`, () => {
      expect(validate('SkillPackage', json(JSON.stringify(pkg))).valid).toBe(true)
      expect(judgeSkillPackage(json(JSON.stringify(pkg)))).toEqual({ ok: true })
    })
  }
  for (const row of variants) {
    it(`${row.id}: Schema`, () => {
      expect(validate('SkillPackage', json(JSON.stringify(row.value))).valid).toBe(row.schema)
    })
    it(`${row.id}: judgment + input unchanged`, () => {
      const input = json(JSON.stringify(row.value))
      const before = writeJsonLossless(input)
      const expected =
        row.rejected === undefined
          ? { ok: true }
          : {
              rejected: row.rejected,
              ...(row.malformed === undefined ? {} : { malformed: row.malformed }),
            }
      expect(
        judgeSkillPackage(
          input,
          row.capabilityName === undefined ? undefined : { capabilityName: row.capabilityName },
        ),
      ).toEqual(expected)
      expect(writeJsonLossless(input)).toBe(before)
    })
  }
})

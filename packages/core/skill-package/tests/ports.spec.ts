import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  isSkillPackage,
  judgeSkillPackage,
  skillAttributeDeclarations,
  skillBodyContract,
  skillDependencies,
  skillReferences,
  skillScripts,
  validate,
} from '@omne-harness-lite/skill-package'
import type { SkillPackage } from '@omne-harness-lite/skill-package'

function json(text: string) {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new Error('bad fixture JSON')
  return parsed.ok
}
const setting = (schema: string, value: string) =>
  json(
    `{"manifest":{"name":"x","description":"d"},"body":"","resources":[],"definition":{"format":1,"settings":[{"item":"n","kind":"setting","category":"preference","domain":{"kind":"open","schema":${schema}},"default":${value}}]}}`,
  )
describe('exact author domains, pure derivation and body port', () => {
  for (const member of ['item', 'kind', 'domain', 'default'] as const) {
    it(`M2: required author declaration ${member} is missing`, () => {
      const item: Record<string, unknown> = {
        item: 'tone',
        kind: 'setting',
        category: 'preference',
        domain: { kind: 'open', schema: true },
        default: 'd',
      }
      delete item[member]
      expect(
        judgeSkillPackage({
          manifest: { name: 'x', description: 'd' },
          body: '',
          resources: [],
          definition: { format: 1, settings: [item] },
        }),
      ).toEqual({ rejected: 'malformed', malformed: 'M2' })
    })
  }
  it('M4: dependency element JSON type is not coerced into a service name', () => {
    expect(
      judgeSkillPackage({
        manifest: { name: 'x', description: 'd' },
        body: '',
        resources: [],
        definition: { format: 1, dependencies: [7] },
      }),
    ).toEqual({ rejected: 'malformed', malformed: 'M4' })
  })
  for (const [id, schema, value, valid] of [
    ['large exact matching constant', '{"const":9007199254740993}', '9007199254740993', true],
    ['large adjacent constant rejected', '{"const":9007199254740993}', '9007199254740992', false],
    [
      'large upper bound',
      '{"type":"integer","maximum":9007199254740993}',
      '9007199254740993',
      true,
    ],
    [
      'large upper bound violated',
      '{"type":"integer","maximum":9007199254740993}',
      '9007199254740994',
      false,
    ],
    [
      'long fraction strict bound',
      '{"exclusiveMinimum":0.123456789012345678901}',
      '0.123456789012345678902',
      true,
    ],
    [
      'long fraction bound rejected',
      '{"exclusiveMinimum":0.123456789012345678901}',
      '0.123456789012345678901',
      false,
    ],
    ['exact decimal multiple', '{"multipleOf":0.1}', '0.3', true],
    ['incorrect decimal multiple', '{"multipleOf":0.1}', '0.3000000000000000000001', false],
    ['large exponent is still number', '{"type":"number"}', '1e400', true],
    ['fractional exponent is not integer', '{"type":"integer"}', '1e-400', false],
    ['false schema', 'false', 'null', false],
    ['true schema null', 'true', 'null', true],
    [
      'owned reference',
      '{"$ref":"https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v2/tool-definition.schema.json#/$defs/TargetEnvironment"}',
      '{"bindingLayer":"host_machine","facilities":[]}',
      true,
    ],
  ] as const) {
    it(id, () => {
      const input = setting(schema, value)
      const before = writeJsonLossless(input)
      expect(judgeSkillPackage(input)).toEqual(
        valid ? { ok: true } : { rejected: 'malformed', malformed: 'M12' },
      )
      expect(writeJsonLossless(input)).toBe(before)
    })
  }
  it('does not retain author schema mutation in a module-level compiler cache', () => {
    expect(judgeSkillPackage(setting('{"type":"number"}', '1'))).toEqual({ ok: true })
    expect(judgeSkillPackage(setting('{"type":"string"}', '1'))).toEqual({
      rejected: 'malformed',
      malformed: 'M12',
    })
    expect(judgeSkillPackage(setting('{"type":"number"}', '1'))).toEqual({ ok: true })
  })
  it('derives only author settings and exact declared dependencies, with detached immutable results', () => {
    const pkg: SkillPackage = {
      manifest: {
        name: 'x',
        description: 'd',
        compatibility: 'not a requirement',
        'allowed-tools': 'Read',
        metadata: { dependency: 'ignored' },
      },
      body: 'use an unlisted tool in a sentence',
      resources: [{ path: 'scripts/run.sh' }, { path: 'bin/run.sh' }],
      definition: {
        format: 1,
        tools: [{ category: 'tool', name: 'read' }],
        dependencies: ['service'],
        environmentRequirement: { bindingLayer: 'tenant_sandbox', facilities: ['python'] },
        settings: [
          {
            item: 'targetEnvironment',
            kind: 'setting',
            category: 'preference',
            domain: { kind: 'open', schema: { type: 'object' } },
            default: { nested: [1] },
          },
        ],
      },
    }
    expect(judgeSkillPackage(pkg)).toEqual({ ok: true })
    expect(skillDependencies(pkg)).toEqual([
      { kind: 'tool', capability: { category: 'tool', name: 'read' } },
      { kind: 'external_service', name: 'service' },
      {
        kind: 'execution_environment',
        value: { bindingLayer: 'tenant_sandbox', facilities: ['python'] },
      },
    ])
    expect(skillReferences(pkg)).toEqual([{ category: 'tool', name: 'read' }])
    expect(skillScripts(pkg)).toEqual([{ path: 'scripts/run.sh' }])
    const rootScript: SkillPackage = {
      manifest: pkg.manifest,
      body: pkg.body,
      resources: [{ path: 'scripts' }],
      definition: { format: 1 },
    }
    expect(judgeSkillPackage(rootScript)).toEqual({ ok: true })
    expect(skillScripts(rootScript)).toEqual([])
    const declarations = skillAttributeDeclarations(pkg)
    expect(declarations.map(d => d.item)).toEqual(['targetEnvironment'])
    expect(Object.isFrozen(declarations)).toBe(true)
    expect(Object.isFrozen(declarations[0]?.domain)).toBe(true)
    expect(declarations[0]).not.toBe(pkg.definition?.settings?.[0])
    expect(
      skillDependencies({
        ...pkg,
        definition: { format: 1, settings: pkg.definition?.settings ?? [] },
      }),
    ).toEqual([])
    expect(
      skillDependencies({ manifest: pkg.manifest, body: pkg.body, resources: pkg.resources }),
    ).toEqual([])
  })
  it('body port validates every supported definition and preserves name_mismatch', () => {
    const pkg = json(
      '{"manifest":{"name":"x","description":"d"},"body":"$ARGUMENTS","resources":[]}',
    )
    expect(skillBodyContract.category).toBe('skill')
    expect(skillBodyContract.judge(pkg)).toEqual({ ok: true })
    expect(skillBodyContract.judge(pkg, { capabilityName: 'X' })).toEqual({
      rejected: 'name_mismatch',
    })
    expect(
      skillBodyContract.judge(pkg, { definition: 'SkillPackage', capabilityName: 'X' }),
    ).toEqual({ rejected: 'name_mismatch' })
    expect(skillBodyContract.judge('x', { definition: 'SkillName' })).toEqual({ ok: true })
    expect(() => skillBodyContract.judge(pkg, { definition: 'Missing' })).toThrow(TypeError)
    expect(skillBodyContract.deriveDeclarations(pkg)).toEqual({ declarations: [] })
    expect(skillBodyContract.references(pkg)).toEqual([])
    expect(() => skillBodyContract.deriveDeclarations({})).toThrow(TypeError)
    expect(Object.isFrozen(skillBodyContract.schema)).toBe(true)
    expect(isSkillPackage(pkg)).toBe(true)
  })
  it('ordinary JS non-JSON values are refused without getters or input repairs', () => {
    let invoked = false
    expect(
      judgeSkillPackage({
        get manifest() {
          invoked = true
          return {}
        },
        body: '',
        resources: [],
      }),
    ).toEqual({ rejected: 'malformed', malformed: 'M1' })
    expect(invoked).toBe(false)
    expect(judgeSkillPackage(null)).toEqual({ rejected: 'malformed', malformed: 'M1' })
    // @ts-expect-error invalid enum at the runtime public boundary
    expect(() => validate('Missing', {})).toThrow(TypeError)
  })
})

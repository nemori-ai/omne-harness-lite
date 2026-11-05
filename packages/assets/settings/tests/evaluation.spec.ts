import { describe, expect, it } from 'vitest'
import { evaluateSettings, defineSettings } from '../src/index.ts'

const definition = {
  providerId: 'example',
  definitionId: 'preferences',
  version: '1',
  groups: [
    { id: 'general', parentId: null, title: '通用', description: '服务的通用行为', order: 0 },
  ],
  items: [
    {
      id: 'enabled',
      groupId: 'general',
      category: 'preference',
      presentation: {
        title: '显示提示',
        description: '是否显示操作提示',
        impact: '后续操作读取时生效',
        clear: '恢复上层值',
        adoption: 'next-read',
      },
      valueSchema: { type: ['boolean', 'null'] },
      default: { kind: 'value', value: true },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
}
const source = (id: string, value: boolean | null, locked = false) => ({
  id,
  values: [{ itemId: 'enabled', value: { kind: 'value', value }, locked }],
})
function run(sources: unknown[], extra = {}) {
  return evaluateSettings({ definition, sources, ...extra })
}

describe('fixed settings evaluation', () => {
  it('distinguishes absence, false, null and clear', () => {
    expect(run([])).toMatchObject({
      kind: 'complete',
      entries: [{ value: { kind: 'value', value: true }, source: 'default' }],
    })
    expect(run([source('tenant', false)])).toMatchObject({
      kind: 'complete',
      entries: [{ value: { kind: 'value', value: false }, source: 'tenant' }],
    })
    expect(run([source('tenant', null)])).toMatchObject({
      kind: 'complete',
      entries: [{ value: { kind: 'value', value: null } }],
    })
    expect(
      run([
        { id: 'tenant', values: [{ itemId: 'enabled', value: { kind: 'absent' }, locked: false }] },
      ]),
    ).toMatchObject({ kind: 'complete', entries: [{ source: 'default' }] })
  })
  it('keeps outer locks and explains suppressed values', () => {
    expect(run([source('organization', false, true), source('tenant', true)])).toMatchObject({
      kind: 'complete',
      entries: [
        {
          value: { kind: 'value', value: false },
          lockedBy: 'organization',
          suppressed: ['tenant'],
        },
      ],
    })
  })
  it('rejects invalid values even when a lock masks them', () => {
    expect(
      run([
        source('organization', false, true),
        {
          id: 'tenant',
          values: [{ itemId: 'enabled', value: { kind: 'value', value: 'wrong' }, locked: false }],
        },
      ]),
    ).toMatchObject({ kind: 'incompatible', itemId: 'enabled' })
  })
  it('does not promote dependency failure to defaults', () => {
    expect(run([], { availability: 'unavailable' })).toEqual({ kind: 'unavailable' })
  })
  it('rejects duplicate sources, unknown items and malformed requests', () => {
    expect(run([source('tenant', true), source('tenant', false)])).toMatchObject({
      kind: 'invalid_input',
    })
    expect(
      run([
        {
          id: 'tenant',
          values: [{ itemId: 'missing', value: { kind: 'value', value: true }, locked: false }],
        },
      ]),
    ).toMatchObject({ kind: 'incompatible' })
    expect(evaluateSettings(null)).toMatchObject({ kind: 'invalid_input' })
  })
  it('uses disjunction only for the declared disabled rule', () => {
    const disabled = structuredClone(definition)
    disabled.items[0]!.merge = 'disabled'
    disabled.items[0]!.valueSchema = { type: ['boolean'] }
    disabled.items[0]!.default = { kind: 'value', value: false }
    expect(
      evaluateSettings({
        definition: disabled,
        sources: [source('organization', true), source('tenant', false)],
      }),
    ).toMatchObject({ kind: 'complete', entries: [{ value: { kind: 'value', value: true } }] })
    expect(run([source('organization', true), source('tenant', false)])).toMatchObject({
      kind: 'complete',
      entries: [{ value: { kind: 'value', value: false } }],
    })
  })
  it('rejects groups without semantics, cycles and schema references', () => {
    const bad = structuredClone(definition)
    bad.groups[0]!.description = ''
    expect(defineSettings(bad)).toMatchObject({ kind: 'invalid_input' })
    expect(
      defineSettings({ ...definition, groups: [{ ...definition.groups[0], parentId: 'general' }] }),
    ).toMatchObject({ kind: 'invalid_input' })
    expect(
      defineSettings({
        ...definition,
        items: [{ ...definition.items[0], valueSchema: { $ref: 'https://example.com/schema' } }],
      }),
    ).toMatchObject({ kind: 'invalid_input' })
  })
  it('requires units for numeric settings and labels for enum values', () => {
    expect(
      defineSettings({
        ...definition,
        items: [
          {
            ...definition.items[0],
            valueSchema: { type: 'number', minimum: 0, maximum: 100 },
            default: { kind: 'value', value: 3 },
          },
        ],
      }),
    ).toMatchObject({ kind: 'invalid_input' })
    expect(
      defineSettings({
        ...definition,
        items: [
          {
            ...definition.items[0],
            valueSchema: { type: 'string', enum: ['auto', 'manual'] },
            default: { kind: 'value', value: 'auto' },
          },
        ],
      }),
    ).toMatchObject({ kind: 'invalid_input' })
  })
  it('keeps captured results immutable and isolated from caller mutation', () => {
    const input = source('tenant', false)
    const result = run([input])
    input.values[0]!.value.value = true
    expect(result).toMatchObject({
      kind: 'complete',
      entries: [{ value: { kind: 'value', value: false } }],
    })
    expect(Object.isFrozen(result)).toBe(true)
    if (result.kind === 'complete') expect(Object.isFrozen(result.entries[0])).toBe(true)
  })
  it('does not return secret values through ordinary evaluation', () => {
    const secret = {
      ...definition,
      items: [
        {
          ...definition.items[0],
          sensitivity: 'secret',
          default: { kind: 'absent' },
          valueSchema: { type: 'string' },
        },
      ],
    }
    const result = evaluateSettings({
      definition: secret,
      sources: [
        {
          id: 'tenant',
          values: [
            { itemId: 'enabled', value: { kind: 'value', value: 'plaintext' }, locked: false },
          ],
        },
      ],
    })
    expect(result).toMatchObject({ kind: 'incompatible' })
    expect(JSON.stringify(result)).not.toContain('plaintext')
  })
})

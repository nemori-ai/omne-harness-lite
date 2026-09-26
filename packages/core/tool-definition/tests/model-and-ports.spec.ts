import { describe, expect, it } from 'vitest'
import frozen from './examples-fixtures.json' with { type: 'json' }
import {
  createParameterJudge,
  definitionNameOf,
  isToolDefinition,
  isToolReturn,
  judgeToolDefinition,
  judgeToolReturn,
  modelInput,
  modelName,
  toolResultOf,
  toolAttributeDeclarations,
  toolReferences,
  toolDependencies,
  toolBodyContract,
  validate,
} from '../src/index.ts'
import type { ToolDefinition } from '../src/index.ts'
import {
  readJsonStrict,
  writeJsonLossless,
  judgeContentBlock,
} from '@omne-harness-lite/content-blocks'

function requireDefinition(value: unknown): ToolDefinition {
  if (!isToolDefinition(value)) throw new Error('bad fixture')
  return value
}
const baseline = requireDefinition(frozen.definitions[0])
const multi = requireDefinition(frozen.definitions[2])
const rich = requireDefinition(frozen.definitions[4])
function id(value: string) {
  const result = judgeContentBlock({
    id: value,
    kind: 'text',
    text: '',
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in result) throw new Error('bad runtime id fixture')
  return result.ok.id
}
describe('model values, parameter authority, and body ports', () => {
  it('V2/V9 nine normative calls separately judge model shape and actual command parameters', () => {
    const cases = [
      [{ command: 'read', args: { id: 'n1' } }, true, true],
      [{ command: 'read', args: {} }, true, false],
      [{ command: 'read' }, true, false],
      [{ command: 'list' }, true, true],
      [{ command: 'list', args: { id: 'n1' } }, true, false],
      [{ command: 'delete', args: {} }, false, false],
      [{ command: 'read', args: { id: 'n1' }, note: 'x' }, false, false],
      [{ command: 'read', args: 5 }, false, false],
      ['read', false, false],
    ] as const
    const judge = createParameterJudge()
    const modeled = requireDefinition({ ...baseline, paradigm: 'single', input: modelInput(multi) })
    for (const [call, modelPass, actualPass] of cases) {
      expect('ok' in judge.judgeCallArguments(modeled, call)).toBe(modelPass)
      expect('ok' in judge.judgeCallArguments(multi, call)).toBe(actualPass)
    }
  })
  it('V2 different parameter completeness and absent AP leave model input identical', () => {
    if (multi.paradigm !== 'multi') throw new Error('fixture')
    for (const ap of [true, false, undefined]) {
      const changed = requireDefinition({
        ...multi,
        commands: Object.fromEntries(
          Object.entries(multi.commands).map(([name, command]) => [
            name,
            {
              ...command,
              input: {
                type: 'object',
                properties: {},
                ...(ap === undefined ? {} : { additionalProperties: ap }),
              },
            },
          ]),
        ),
      })
      expect(modelInput(changed)).toEqual(modelInput(multi))
      const judge = createParameterJudge()
      expect('ok' in judge.judgeCallArguments(changed, { command: 'read' })).toBe(true)
      expect(
        'ok' in judge.judgeCallArguments(changed, { command: 'read', args: { id: 'n1' } }),
      ).toBe(ap === true)
    }
  })
  it('S5 only root AP defaults false, nested object keeps Draft default', () => {
    const d = requireDefinition({
      ...baseline,
      input: { type: 'object', properties: { nested: { type: 'object', description: 'n' } } },
    })
    const judge = createParameterJudge()
    expect(judge.judgeCallArguments(d, { nested: { unknown: true } })).toHaveProperty('ok')
    expect(judge.judgeCallArguments(d, { unknown: true })).toHaveProperty('invalid')
    expect(modelInput(d)).toEqual(d.paradigm === 'single' ? d.input : undefined)
  })
  it('V2 command names use codepoint order including supplementary characters', () => {
    const d = requireDefinition({
      ...multi,
      commands: Object.fromEntries(
        ['😀', '\uE000', 'A'].map(name => [
          name,
          { description: name, input: { type: 'object', properties: {} } },
        ]),
      ),
    })
    const input = modelInput(d)
    expect(input).toMatchObject({
      properties: {
        command: { enum: ['A', '\uE000', '😀'], description: 'A — A\n\uE000 — \uE000\n😀 — 😀' },
      },
    })
  })
  it('S18 reserved three sequences and encoded length boundaries', () => {
    for (const name of ['a__b', 'a_:b', 'a:_b'])
      expect(judgeToolDefinition({ ...baseline, name })).toEqual({
        rejected: 'name_reserved_sequence',
      })
    for (const name of ['a'.repeat(128), ':'.repeat(64), 'a:b', 'a_b', 'a::b']) {
      const d = requireDefinition({ ...baseline, name })
      expect(definitionNameOf(modelName(d.name))).toBe(d.name)
    }
    for (const name of ['a'.repeat(129), ':'.repeat(65)])
      expect(judgeToolDefinition({ ...baseline, name })).toMatchObject({
        rejected: 'malformed',
        malformed: 'M25',
      })
  })
  it('V5 local bare text conversion takes runtime id, does not parse JSON, invent raw or outcome', () => {
    const value = '{"content":[],"outcome":"failed"}'
    expect(toolResultOf(value, id('runtime-id'))).toEqual({
      content: [
        {
          id: 'runtime-id',
          kind: 'text',
          visibility: { toHuman: true, toModel: true },
          text: value,
        },
      ],
    })
    expect(toolResultOf('', id('empty-text'))).toEqual({
      content: [
        { id: 'empty-text', kind: 'text', visibility: { toHuman: true, toModel: true }, text: '' },
      ],
    })
    const structured = {
      content: [],
      offload: { raw: { inline: 'eA==', mediaType: 'text/plain' } },
    }
    if (!isToolReturn(structured)) throw new Error('fixture')
    expect(toolResultOf(structured, id('unused'))).toEqual(structured)
    expect(toolResultOf(structured, id('unused'))).not.toBe(structured)
    expect(judgeToolReturn({ ...structured, outcome: 'failed' })).toEqual({
      rejected: 'malformed',
      malformed: 'M18',
    })
  })
  it('S31 all five declarations and skill references from explicit body only', () => {
    const declarations = toolAttributeDeclarations(rich)
    expect(declarations.map(value => value.item)).toEqual([
      'targetEnvironment',
      'backgroundThreshold',
      'timeout',
      'concurrency',
      'execute',
    ])
    expect(declarations.at(-1)).toEqual({
      item: 'execute',
      kind: 'permission',
      domain: { kind: 'enum', values: ['forbid', 'auto', 'ask'] },
      default: 'ask',
    })
    expect(declarations.some(value => ['disabled', 'usableBy'].includes(value.item))).toBe(false)
    expect(toolReferences(rich)).toEqual([{ category: 'skill', name: 'chart-style-guide' }])
    expect(toolAttributeDeclarations(requireDefinition(frozen.definitions[3]))).toEqual([])
  })
  it('public derived values are deeply immutable snapshots without freezing caller input', () => {
    const raw = structuredClone(frozen.definitions[4])
    if (raw === undefined) throw new Error('missing rich definition fixture')
    const d = requireDefinition(raw)
    const input = modelInput(d)
    const declarations = toolAttributeDeclarations(d)
    expect(Object.isFrozen(input)).toBe(true)
    expect(Object.isFrozen(input.properties)).toBe(true)
    expect(Object.isFrozen(raw.input)).toBe(false)
    const target = declarations.find(value => value.item === 'targetEnvironment')
    expect(Object.isFrozen(target?.domain)).toBe(true)
    expect(Object.isFrozen(target?.default)).toBe(true)
    expect(Object.isFrozen(toolBodyContract.schema)).toBe(true)
    expect(Object.isFrozen(raw.settings?.targetEnvironment?.default.facilities)).toBe(false)
    expect(() => Reflect.set(input, 'type', 'array')).not.toThrow()
    expect(Reflect.set(input, 'type', 'array')).toBe(false)
    expect(modelInput(d)).toEqual(raw.input)
  })
  it('AM tool port uses real valid body, actual category context, and fixed definition domains', () => {
    expect(toolBodyContract.judge(rich, { capabilityName: rich.name })).toEqual({ ok: true })
    expect(toolBodyContract.judge(rich, { capabilityName: 'other' })).toEqual({
      rejected: 'malformed',
    })
    expect(toolBodyContract.judge(frozen.definitions[3])).toEqual({ rejected: 'malformed' })
    expect(toolBodyContract.judge('PT1M', { definition: 'Duration' })).toEqual({ ok: true })
    expect(toolBodyContract.judge('P1D', { definition: 'Duration' })).toEqual({
      rejected: 'malformed',
    })
    const json = readJsonStrict(writeJsonLossless(rich))
    if ('failed' in json) throw new Error('fixture')
    expect(toolBodyContract.deriveDeclarations(json.ok)).toEqual({
      declarations: toolAttributeDeclarations(rich),
    })
    expect(toolBodyContract.references(json.ok)).toEqual(toolReferences(rich))
  })
  it('S19 explicit effective environment, presence agreement, no default or composition dependency', () => {
    const effective = { bindingLayer: 'host_machine' as const, facilities: ['shell'] }
    expect(toolDependencies(rich, effective)).toEqual([
      { kind: 'external_service', name: 'chart-render-service' },
      { kind: 'attachment_storage', name: 'artifact-store', readerRequired: true },
      { kind: 'input_modality', modality: 'image' },
      { kind: 'output_modality', modality: 'image' },
      { kind: 'target_environment', value: effective },
    ])
    expect(rich.settings?.targetEnvironment?.default.bindingLayer).toBe('session_sandbox')
    expect(toolDependencies(baseline, undefined)).toEqual([])
    const named = requireDefinition({ ...rich, name: 'looks-like-service:artifact-store' })
    expect(toolDependencies(named, effective)).toEqual(toolDependencies(rich, effective))
    expect(() => toolDependencies(rich, undefined)).toThrow(TypeError)
    expect(() => toolDependencies(baseline, effective)).toThrow(TypeError)
  })
  it('return block rejection precedes lawful call-in-result and malformed surrounding values', () => {
    const complete = {
      id: 'c',
      kind: 'tool_call',
      visibility: { toHuman: true, toModel: true },
      callId: 'x',
      tool: 't',
      arguments: {},
      complete: true,
    }
    expect(
      judgeToolReturn({ content: [complete, { kind: 'bogus' }], outcome: 'failed' }),
    ).toHaveProperty('rejected', 'kind_unknown')
    expect(judgeToolReturn({ content: [complete], outcome: 'failed' })).toEqual({
      rejected: 'result_call_in_content',
    })
    expect(validate('ToolReturn', { content: [complete] }).valid).toBe(false)
  })
})

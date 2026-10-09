import { expect, test } from 'vitest'
import {
  checkManifestAppendInput,
  readEvaluationProjection,
  type ManifestRecord,
} from '@omne-harness-lite/assembly-manifest'
import { judgeEffectiveAssembly, type EffectiveValue } from '@omne-harness-lite/asset-evaluation'
import { copyJsonValue, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { judgeDefinition, type Power } from '@omne-harness-lite/loop-extension'
import { readRunnerChain } from '../src/index.ts'
import {
  chainScenario,
  manifestRecord,
  session,
  tenant,
  versionFor,
} from './runner-chain-support.ts'

interface EvaluationCase {
  readonly power?: JsonValue
  readonly position?: JsonValue
  readonly dimensions?: readonly JsonValue[]
  readonly body?: JsonObject
  readonly remove?: 'power' | 'position'
}

function evaluatedScenario(change: EvaluationCase = {}) {
  const record = manifestRecord()
  const original = readEvaluationProjection(record.content)
  if ('failure' in original) throw new Error('original projection rejected')
  const target = original.ok.evaluation.assets.find(asset => asset.capability.name === 'example:a')
  if (target === undefined) throw new Error('target asset missing')
  const values: EffectiveValue[] = original.ok.evaluation.values
    .filter(value => value.capability.name !== 'example:a' || value.item !== change.remove)
    .map(value => {
      if (value.capability.name !== 'example:a') return value
      if (value.item === 'power' && change.power !== undefined)
        return { ...value, value: change.power }
      if (value.item === 'position' && change.position !== undefined)
        return { ...value, value: change.position }
      return value
    })
  for (const dimension of change.dimensions ?? []) {
    values.push({
      capability: target.capability,
      item: 'dimension',
      value: dimension,
      from: 'factory',
    })
  }
  const evaluation = { ...original.ok.evaluation, values }
  expect(judgeEffectiveAssembly(evaluation)).toBe(true)
  const copied = copyJsonValue({
    evaluation,
    compositionOrder: original.ok.compositionOrder,
    filledBy: { kind: 'assembly' },
  })
  if ('failed' in copied) throw new Error('projection is not JSON')
  const projected = readEvaluationProjection(copied.ok)
  if ('failure' in projected) throw new Error('changed projection rejected')
  const checked = checkManifestAppendInput(session, 0, {
    evaluation: record.evaluation,
    tables: record.tables,
    content: copied.ok,
  })
  if ('failure' in checked) throw new Error('changed manifest rejected')
  const changed: ManifestRecord = { ...record, ...checked.ok.record }
  const body = judgeDefinition({
    name: 'example:a',
    position: 'before_model_call',
    power: 'veto',
    onError: 'record',
    needs: ['example:dependency'],
    implementation: { kind: 'builtin', builtinName: 'original-implementation' },
    ...change.body,
  })
  if ('rejected' in body) throw new Error(`original definition rejected: ${body.rejected}`)
  return chainScenario({
    head: { head: 1, latest: { loop_extension: changed } },
    async history(request) {
      const version = versionFor(request)
      if ('failure' in version) throw new Error('version fixture rejected')
      const copiedRequest = copyJsonValue(request)
      if ('failed' in copiedRequest) throw new Error('history request is not JSON')
      expect(copiedRequest.ok).toMatchObject({
        session,
        tenant,
        category: 'loop_extension',
        filledAt: 1791487231754,
        version: 1,
      })
      if (version.version.content.category !== 'loop_extension')
        throw new Error('version category changed')
      const definition = judgeDefinition(version.version.content.extension)
      if ('rejected' in definition) throw new Error('history definition rejected')
      if (definition.ok.name !== 'example:a') return version
      expect(copiedRequest.ok).toMatchObject({
        capability: { category: 'loop_extension', name: 'example:a' },
        asset: 'ast_a',
      })
      return {
        version: {
          ...version.version,
          content: { category: 'loop_extension', extension: body.ok },
        },
      }
    },
  })
}

test.each([
  { allowed: ['veto', 'observe', 'rewrite'], expected: 'veto' },
  { allowed: ['rewrite', 'veto', 'observe'], expected: 'veto' },
  { allowed: ['rewrite', 'observe'], expected: 'rewrite' },
  { allowed: ['observe'], expected: 'observe' },
] satisfies { allowed: string[]; expected: Power }[])(
  'selects the strongest evaluated power from $allowed and retains the declared definition',
  async ({ allowed, expected }) => {
    const { input, trace } = evaluatedScenario({ power: { allowed } })
    const result = await readRunnerChain(input)
    expect(result).toEqual([
      {
        definition: {
          name: 'example:b',
          position: 'before_model_call',
          power: 'observe',
          implementation: { kind: 'builtin', builtinName: 'example:b' },
        },
        power: 'observe',
      },
      {
        definition: {
          name: 'example:a',
          position: 'before_model_call',
          power: 'veto',
          onError: 'record',
          needs: ['example:dependency'],
          implementation: { kind: 'builtin', builtinName: 'original-implementation' },
        },
        power: expected,
        onError: 'record',
      },
    ])
    expect(trace.filter(item => Array.isArray(item) && item[0] === 'version')).toHaveLength(2)
    expect(Object.isFrozen(result)).toBe(true)
  },
)

test.each([
  null,
  [],
  {},
  { allowed: [] },
  { allowed: 'observe' },
  { allowed: ['observe', 'observe'] },
  { allowed: ['rewrite', 'unknown'] },
  { allowed: ['observe'], extra: true },
  { allowed: [1] },
] satisfies JsonValue[])(
  'denies an invalid allowed-power value without returning the first piece %#',
  async power => {
    const { input, trace } = evaluatedScenario({ power })
    expect(await readRunnerChain(input)).toEqual({ failure: 'unavailable' })
    expect(trace.filter(item => Array.isArray(item) && item[0] === 'version')).toHaveLength(2)
  },
)

test('rejects an evaluated power above the exact version declaration', async () => {
  const { input } = evaluatedScenario({
    power: { allowed: ['observe', 'veto'] },
    body: { power: 'rewrite' },
  })
  expect(await readRunnerChain(input)).toEqual({ failure: 'unavailable' })
})

test.each([
  {
    position: 'after_model_call',
    original: { ending: 'complete_reply' },
    effective: { ending: 'failure' },
  },
  { position: 'after_action', original: { scope: 'each' }, effective: { scope: 'batch' } },
] satisfies { position: string; original: JsonValue; effective: JsonValue }[])(
  'uses the evaluated dimension within the original $position domain',
  async ({ position, original, effective }) => {
    const { input } = evaluatedScenario({
      position,
      dimensions: [effective],
      body: { position, dimension: original },
    })
    const result = await readRunnerChain(input)
    if ('failure' in result) throw new Error('dimensional chain rejected')
    expect(result[1]).toEqual({
      definition: {
        name: 'example:a',
        position,
        dimension: effective,
        power: 'veto',
        onError: 'record',
        needs: ['example:dependency'],
        implementation: { kind: 'builtin', builtinName: 'original-implementation' },
      },
      power: 'observe',
      onError: 'record',
    })
  },
)

test.each([
  'attempt_started',
  'before_persist_message',
  'after_persist_message',
  'before_compaction',
  'after_compaction',
  'before_model_call',
  'before_action',
  'before_terminal',
  'after_terminal',
])('uses evaluated non-dimensional position %s without adding a dimension', async position => {
  const { input } = evaluatedScenario({ position })
  const result = await readRunnerChain(input)
  if ('failure' in result) throw new Error('non-dimensional chain rejected')
  expect(result[1]).toEqual({
    definition: {
      name: 'example:a',
      position,
      power: 'veto',
      onError: 'record',
      needs: ['example:dependency'],
      implementation: { kind: 'builtin', builtinName: 'original-implementation' },
    },
    power: 'observe',
    onError: 'record',
  })
})

test.each([
  { position: 'after_model_call', dimensions: [] },
  { position: 'after_action', dimensions: [{ scope: 'each' }] },
  { position: 'before_model_call', dimensions: [] },
  { position: 'after_model_call', dimensions: [{ scope: 'each' }] },
  { position: 'after_model_call', dimensions: [{ ending: 'future' }] },
] satisfies EvaluationCase[])(
  'denies incompatible evaluated dimensions for a model-call definition %#',
  async change => {
    const { input, trace } = evaluatedScenario({
      ...change,
      body: { position: 'after_model_call', dimension: { ending: 'failure' } },
    })
    expect(await readRunnerChain(input)).toEqual({ failure: 'unavailable' })
    expect(trace.filter(item => Array.isArray(item) && item[0] === 'version')).toHaveLength(2)
  },
)

test.each([
  { position: 'after_model_call', dimensions: [{ ending: 'failure' }] },
  { position: 'after_action', dimensions: [{ scope: 'each' }] },
  { position: 'before_model_call', dimensions: [{ ending: 'failure' }] },
  { position: 'future_position' },
  { position: null },
  { remove: 'position' },
  { remove: 'power' },
  { body: { name: 'example:wrong' } },
] satisfies EvaluationCase[])(
  'denies a mismatched or incomplete evaluated non-dimensional definition %#',
  async change => {
    const { input, trace } = evaluatedScenario(change)
    expect(await readRunnerChain(input)).toEqual({ failure: 'unavailable' })
    expect(trace.filter(item => Array.isArray(item) && item[0] === 'version')).toHaveLength(2)
  },
)

test('rejects duplicate evaluation dimensions at the public projection boundary', async () => {
  const record = manifestRecord()
  const original = readEvaluationProjection(record.content)
  if ('failure' in original) throw new Error('projection fixture rejected')
  const target = original.ok.evaluation.assets.find(asset => asset.capability.name === 'example:a')
  if (target === undefined) throw new Error('target asset missing')
  const dimension: EffectiveValue = {
    capability: target.capability,
    item: 'dimension',
    value: { ending: 'failure' },
    from: 'factory',
  }
  const evaluation = {
    ...original.ok.evaluation,
    values: [...original.ok.evaluation.values, dimension, dimension],
  }
  expect(judgeEffectiveAssembly(evaluation)).toBe(false)
  const copied = copyJsonValue({
    evaluation,
    compositionOrder: original.ok.compositionOrder,
    filledBy: { kind: 'assembly' },
  })
  if ('failed' in copied) throw new Error('projection is not JSON')
  expect(readEvaluationProjection(copied.ok)).toEqual({
    failure: 'unavailable',
    reason: 'invalid_evaluation_content',
  })
  const { input, trace } = chainScenario({
    head: { head: 1, latest: { loop_extension: { ...record, content: copied.ok } } },
  })
  expect(await readRunnerChain(input)).toEqual({ failure: 'unavailable' })
  expect(trace.filter(item => Array.isArray(item) && item[0] === 'version')).toEqual([])
})

import { assertLoopSchemaTransition } from './schema-transition.ts'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  judgeConclusion,
  judgeInput,
  judgeValue,
  SCHEMA_DEF_NAMES,
  validate,
} from '../src/index.ts'
import schema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import retainedV3 from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import retainedV2 from '@omne-harness-lite/loop-extension/schema/v2' with { type: 'json' }
import { at, dispatch, inputAt, profile, variants } from './helpers.ts'

const failure = variants.find(
  item => item.position === 'after_model_call' && item.dimension?.ending === 'failure',
)
if (failure === undefined) throw new Error('missing failure fixture')
const input = inputAt(failure)
function accepted(value: unknown) {
  const result = judgeInput(value)
  if ('rejected' in result) throw new Error(`fixture rejected: ${result.rejected}`)
  return result.ok
}
function retry(modelCallId = 'mc_01') {
  return {
    extension: 'default-retry',
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    modelCallId,
    power: 'rewrite',
    output: { kind: 'retry', plan: { provider: 'provider-b', after: 'PT2S' } },
    at,
  }
}
it('LC6 public Schema changes only AR-2; all 43 definitions compile; retained resources keep own ids', () => {
  const source = readFileSync(
    new URL(
      '../../../../.meta_harness/design/spec/data/loop-extension/v6/loop-extension.schema.json',
      import.meta.url,
    ),
  )
  assertLoopSchemaTransition(
    readFileSync(new URL('../schema/loop-extension.schema.json', import.meta.url)),
    source,
  )
  expect(SCHEMA_DEF_NAMES).toHaveLength(43)
  expect([...SCHEMA_DEF_NAMES].sort()).toEqual(Object.keys(schema.$defs).sort())
  for (const name of SCHEMA_DEF_NAMES) expect(() => validate(name, {})).not.toThrow()
  expect(retainedV3.$id).toContain('/loop-extension/v3/')
  expect(retainedV2.$id).toContain('/loop-extension/v2/')
})
it('the retired v3 executable path is not a public import', () => {
  expect(() => import.meta.resolve('@omne-harness-lite/loop-extension/v3')).toThrow()
})
it('LC6 failure history is explicit and bound to one dispatched model call', () => {
  expect(judgeInput(input)).toHaveProperty('ok')
  const subject = input.subject as Record<string, unknown>
  expect(judgeInput({ ...input, subject: { ...subject, retryConclusions: undefined } })).toEqual({
    rejected: 'malformed',
  })
  expect(
    judgeInput({ ...input, subject: { ...subject, retryConclusions: [retry('mc_other')] } }),
  ).toEqual({ rejected: 'malformed' })
  expect(
    judgeInput({
      ...input,
      subject: { ...subject, dispatches: [dispatch, { ...dispatch, call: 'mc_other' }] },
    }),
  ).toEqual({ rejected: 'malformed' })
  const repeats = { ...input, subject: { ...subject, retryConclusions: [retry(), retry()] } }
  const admitted = accepted(repeats)
  if (!('retryConclusions' in admitted.subject)) throw new Error('failure subject missing history')
  expect(admitted.subject.retryConclusions).toHaveLength(2)
  expect(admitted.subject.retryConclusions[0]).toEqual(admitted.subject.retryConclusions[1])
  expect(admitted.subject.retryConclusions[0]).not.toBe(admitted.subject.retryConclusions[1])
})
it('LC6 validates protocol slots and leaves opaque configuration keys alone', () => {
  const subject = input.subject as Record<string, unknown>
  const adaptation = profile.adaptation as Record<string, unknown>
  const configuration = adaptation.configuration as Record<string, unknown>
  const updated = {
    ...adaptation,
    configuration: {
      ...configuration,
      values: { retryConclusions: [{ modelCallId: 'mc_other' }], dispatches: ['opaque'] },
    },
  }
  const snapshot = { ...profile, adaptation: updated }
  const emitted = { ...dispatch, adaptation: updated, profileSnapshot: snapshot }
  const value = { ...input, subject: { ...subject, profile: snapshot, dispatches: [emitted] } }
  expect(judgeValue('ExtensionInput', value)).toHaveProperty('ok')
})
it('LC6 failure conclusion requires correct modelCallId across all record shapes', () => {
  const admitted = accepted(input)
  const base = {
    extension: 'default-retry',
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    modelCallId: 'mc_01',
    power: 'rewrite',
    at,
  }
  const retryRecord = { ...base, output: { kind: 'retry', plan: { provider: 'provider-b' } } }
  expect(
    judgeConclusion(retryRecord, { input: admitted, extensionName: 'default-retry' }),
  ).toHaveProperty('ok')
  expect(
    judgeConclusion(
      { ...retryRecord, modelCallId: 'mc_other' },
      { input: admitted, extensionName: 'default-retry' },
    ),
  ).toEqual({ rejected: 'malformed' })
  expect(
    judgeConclusion(
      { ...retryRecord, modelCallId: undefined },
      { input: admitted, extensionName: 'default-retry' },
    ),
  ).toEqual({ rejected: 'malformed' })
  for (const record of [
    { ...base, power: 'observe', output: { kind: 'observed' } },
    { ...base, skipped: 'unavailable', unavailability: 'skip' },
    { ...base, skipped: 'errored', error: 'failed', output: { kind: 'observed' } },
  ]) {
    expect(
      judgeConclusion(record, { input: admitted, extensionName: 'default-retry' }),
    ).toHaveProperty('ok')
    expect(
      judgeConclusion(
        { ...record, modelCallId: 'mc_other' },
        { input: admitted, extensionName: 'default-retry' },
      ),
    ).toEqual({ rejected: 'malformed' })
  }
})
it('LC6 copies exact numeric configuration and retry history independently', () => {
  const parsed = readJsonStrict('9007199254740993')
  if ('failed' in parsed) throw new Error('bad exact number')
  const baseAdaptation = profile.adaptation as Record<string, unknown>
  const configuration = baseAdaptation.configuration as Record<string, unknown>
  const adaptation = {
    ...baseAdaptation,
    configuration: { ...configuration, values: { count: parsed.ok } },
  }
  const exactProfile = { ...profile, adaptation }
  const exactDispatch = { ...dispatch, adaptation, profileSnapshot: exactProfile }
  const history = [retry(), retry()]
  const source = {
    ...input,
    subject: {
      ...(input.subject as Record<string, unknown>),
      profile: exactProfile,
      dispatches: [exactDispatch],
      retryConclusions: history,
    },
  }
  const first = accepted(source)
  const second = accepted(source)
  expect(writeJsonLossless(first)).toBe(writeJsonLossless(second))
  expect(writeJsonLossless(first)).toContain('9007199254740993')
  expect(first).not.toBe(second)
  history[0] = retry('mc_other')
  expect(writeJsonLossless(first)).toBe(writeJsonLossless(second))
  const changed = {
    ...source,
    subject: { ...(source.subject as Record<string, unknown>), retryConclusions: [] },
  }
  expect(accepted(changed).subject).not.toEqual(first.subject)
})

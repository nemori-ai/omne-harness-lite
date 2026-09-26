import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import schema from '@omne-harness-lite/model-response/schema' with { type: 'json' }
import { judgeModelResponse, SCHEMA_DEF_NAMES, validate } from '@omne-harness-lite/model-response'
import { complete, failed, normative, object, openedFailure, r30 } from './fixtures.ts'

describe('V-1 normative roots: accepted frozen examples are the oracle', () => {
  it('has thirteen accepted and twenty-nine rejected complete JSON blocks', () => {
    expect(normative).toHaveLength(42)
    expect(normative.filter(item => item.rejection === undefined)).toHaveLength(13)
  })
  for (const item of normative)
    it(item.id + String(item.value.id), () => {
      expect(judgeModelResponse(item.value)).toEqual(
        item.rejection === undefined ? { ok: true } : { rejected: item.rejection },
      )
      expect(validate('ModelResponse', item.value)).toEqual({ valid: item.rejection === undefined })
    })
  it('R-30 is a normative fragment, checked standalone and in E-5', () => {
    expect(validate('Failure', r30)).toEqual({ valid: false })
    expect(judgeModelResponse({ ...openedFailure, failure: r30 })).toEqual({
      rejected: 'malformed',
    })
  })
  it('public resource is the exact frozen Schema bytes', () => {
    const copied = readFileSync(new URL('../schema/model-response.schema.json', import.meta.url))
    const original = readFileSync(
      new URL(
        '../../../../.meta_harness/design/spec/data/model-response/v1/model-response.schema.json',
        import.meta.url,
      ),
    )
    expect(copied.equals(original)).toBe(true)
    expect(createHash('sha256').update(copied).digest('hex')).toBe(
      'e07f54aa752dd59dd2a0ea6ef45d32b8738eb9b2ece3a9eeca07c05071b460a6',
    )
  })
})
const route = object(complete.route)
const positives = {
  ResponseId: complete.id,
  RunId: object(complete.call).runId,
  AttemptId: complete.attemptId,
  ModelCallId: object(complete.call).callId,
  ReplyDisposition: complete.replyDisposition,
  ModelCallRef: complete.call,
  SelectedBy: route.selectedBy,
  CredentialScope: route.credentialScope,
  Route: route,
  ParameterAdjustment: { name: 'extra', requested: null, sent: { nested: true } },
  ResponseOutcome: complete.outcome,
  UpstreamError: { raw: null },
  Failure: failed.failure,
  Timing: complete.timing,
  RawResponse: { headers: {} },
  ModelResponse: complete,
}
describe('all sixteen public fixed definitions', () => {
  it('enumerates exactly the frozen definition names', () => {
    expect(SCHEMA_DEF_NAMES).toEqual(Object.keys(schema.$defs))
    expect(Object.isFrozen(SCHEMA_DEF_NAMES)).toBe(true)
  })
  for (const name of SCHEMA_DEF_NAMES) {
    it(`${name} accepts its independently sourced shape`, () =>
      expect(validate(name, positives[name])).toEqual({ valid: true }))
    it(`${name} rejects null`, () => expect(validate(name, null)).toEqual({ valid: false }))
  }
  it('unknown definition names fail as caller errors', () => {
    expect(() => Reflect.apply(validate, undefined, ['Invented', complete])).toThrow(TypeError)
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import {
  createModelCallSemanticDigest,
  judgeModelCallSemanticDigest,
} from '@omne-harness-lite/messages'
import { judgePendingModelResponse, validate } from '@omne-harness-lite/model-response'

function object(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    LosslessNumber.is(value)
  )
    throw new Error('object fixture required')
  return Object.fromEntries(Object.entries(value))
}
const read = readJsonStrict(
  readFileSync(
    new URL(
      '../../../../.meta_harness/design/spec/data/model-response/v11/ack-examples.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
if ('failed' in read || !Array.isArray(read.ok)) throw new Error('missing MR11 ACK examples')
const rows = read.ok.map(object)

describe('MR11 S49 complete saved Pending remains a value', () => {
  it('keeps both normative ACK examples at the complete Pending boundary', () => {
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      if (row.definition !== 'PendingModelResponse' || typeof row.schemaValid !== 'boolean')
        throw new Error('invalid ACK row')
      expect(validate('PendingModelResponse', row.value).valid).toBe(row.schemaValid)
      expect('ok' in judgePendingModelResponse(row.value)).toBe(row.schemaValid)
    }
  })
  it('compares complete original value, including route, raw and input calibration', () => {
    const pending = object(rows[0]?.value)
    const original = writeJsonLossless(pending)
    expect(judgePendingModelResponse(pending)).toEqual({ ok: true })
    const role = 'model-call-retained-result-semantic-sha256/v1'
    const digest = createModelCallSemanticDigest(role, pending)
    if ('rejected' in digest) throw new Error('complete pending rejected by digest')
    expect(judgeModelCallSemanticDigest(role, pending, digest.ok)).toEqual(digest)
    for (const key of ['route', 'raw', 'inputCalibration']) {
      const changed = { ...pending }
      delete changed[key]
      expect(judgeModelCallSemanticDigest(role, changed, digest.ok)).toEqual({
        rejected: 'malformed',
      })
    }
    expect(writeJsonLossless(pending)).toBe(original)
  })
})

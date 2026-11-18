import { describe, expect, it } from 'vitest'
import {
  decodeCandidateRef,
  decodeFixedRequestRecord,
  encodeFixedRequestRecord,
  type FixedRequestRecord,
} from '@omne-harness/request-context-contract'
import { assemble, fixture, must, target } from './fixtures.js'

async function recordOf(): Promise<FixedRequestRecord> {
  const f = fixture()
  const result = await assemble(f.input, f.ports, f.policies)
  if (result.kind !== 'candidate-before-extension') throw new Error('Fixture did not assemble')
  return {
    schema: 'request-context/fixed-request/1',
    target,
    candidate: must(decodeCandidateRef('candidate:1')),
    coverage: result.candidate.coverage,
    continuation: null,
  }
}
const refused = (field: string) => ({ failure: { field, reason: 'unsupported-format' } })
function stored(value: FixedRequestRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify(encodeFixedRequestRecord(value))) as Record<string, unknown>
}

describe('FixedRequestRecord format', () => {
  it('round-trips through JSON text to an equal record', async () => {
    const value = await recordOf()
    expect(decodeFixedRequestRecord(stored(value))).toEqual({ ok: value })
  })

  it('refuses an extra key at the top level and in the target', async () => {
    const value = stored(await recordOf())
    expect(decodeFixedRequestRecord({ ...value, extra: 1 })).toEqual(refused('record'))
    expect(
      decodeFixedRequestRecord({ ...value, target: { ...(value.target as object), extra: 1 } }),
    ).toEqual(refused('target'))
  })

  it('refuses a missing key, another format name and a value that is not a record', async () => {
    const { candidate: _omitted, ...rest } = stored(await recordOf())
    expect(decodeFixedRequestRecord(rest)).toEqual(refused('record'))
    expect(decodeFixedRequestRecord({ ...stored(await recordOf()), schema: 'other/1' })).toEqual(
      refused('schema'),
    )
    expect(decodeFixedRequestRecord(null)).toEqual(refused('record'))
    expect(decodeFixedRequestRecord([])).toEqual(refused('record'))
  })

  it('refuses a coverage of the wrong shape, a bad candidate and a bad target', async () => {
    const value = stored(await recordOf())
    expect(decodeFixedRequestRecord({ ...value, coverage: { history: {} } })).toEqual(
      refused('coverage'),
    )
    expect(decodeFixedRequestRecord({ ...value, coverage: null })).toEqual(refused('coverage'))
    expect(decodeFixedRequestRecord({ ...value, candidate: '' })).toEqual(refused('candidate'))
    expect(
      decodeFixedRequestRecord({
        ...value,
        target: { tenant: 'not-a-tenant', scope: { ref: 's' } },
      }),
    ).toEqual(refused('target'))
  })

  it('keeps the digest of the last history row exactly when the history has an upper row', async () => {
    const value = stored(await recordOf())
    const coverage = value['coverage'] as Record<string, unknown>
    const history = coverage['history'] as Record<string, unknown>
    expect(history['upper']).toMatchObject({ kind: 'entry' })
    const withHistory = (changes: Record<string, unknown>) => ({
      ...value,
      coverage: { ...coverage, history: { ...history, ...changes } },
    })
    expect(decodeFixedRequestRecord(withHistory({ prefixDigest: null }))).toEqual(
      refused('coverage'),
    )
    expect(decodeFixedRequestRecord(withHistory({ upper: { kind: 'empty' } }))).toEqual(
      refused('coverage'),
    )
    const empty = decodeFixedRequestRecord(
      withHistory({ upper: { kind: 'empty' }, prefixDigest: null }),
    )
    expect('ok' in empty).toBe(true)
  })

  it('refuses a stored continuation until the basis has a stored form', async () => {
    const value = stored(await recordOf())
    expect(decodeFixedRequestRecord({ ...value, continuation: {} })).toEqual(
      refused('continuation'),
    )
  })

  it('does not alias the coverage of its input', async () => {
    const json = stored(await recordOf())
    const decoded = decodeFixedRequestRecord(json)
    if (!('ok' in decoded)) throw new Error('Record refused')
    expect(decoded.ok.coverage).not.toBe(json.coverage)
  })
})

import { describe, expect, it } from 'vitest'
import { collaborationJson } from '../src/delivery/collaboration-json.ts'
import { parseCollaborationRecord, parseRequestInput } from '../src/delivery/collaboration-parse.ts'
import {
  commentDigest,
  decodeRecordComment,
  encodeRecordComment,
} from '../src/delivery/collaboration-comments.ts'
import type { CollaborationRecord } from '../src/delivery/collaboration-records.ts'
import {
  assignment,
  context,
  delta,
  evidence,
  FINAL,
  NEXT_UUID,
  release,
  request,
  requestInput,
  state,
  task,
  TIME,
  UUID,
  writer,
} from './fixtures/collaboration.ts'

describe('collaboration record boundary', () => {
  it('round trips every record family through the same versioned comment codec', () => {
    const records: CollaborationRecord[] = [
      request(),
      state(),
      delta(),
      release(),
      {
        schemaVersion: 1,
        kind: 'assignment',
        operationId: UUID,
        writer,
        assignment: assignment(),
        recordedAt: TIME,
      },
      {
        schemaVersion: 1,
        kind: 'consumption',
        context,
        lineParent: 10,
        operationId: UUID,
        revision: 1,
        previousRecordId: null,
        writer: 'line-owner',
        consumedDelta: {
          issue: 10,
          commentId: 24,
          sha256: commentDigest(encodeRecordComment(delta())),
        },
        consumedRevision: 1,
        recordedAt: TIME,
      },
    ]
    for (const record of records)
      expect(decodeRecordComment(encodeRecordComment(record))).toEqual(record)
  })

  it('records consumption for an idle line without a fabricated task', () => {
    const idle = delta()
    idle.continuation = { kind: 'idle', next: assignment().context, reason: 'No work this wave' }
    const value = {
      schemaVersion: 1,
      kind: 'consumption',
      context,
      lineParent: 10,
      operationId: UUID,
      revision: 1,
      previousRecordId: null,
      writer: 'line-owner',
      consumedDelta: { issue: 10, commentId: 24, sha256: commentDigest(encodeRecordComment(idle)) },
      consumedRevision: 1,
      recordedAt: TIME,
    }
    expect(parseCollaborationRecord(value)).toEqual(value)
    expect(() => parseCollaborationRecord({ ...value, task })).toThrow()
  })

  it.each(['blocked', 'failed'] as const)(
    'permits zero-diff %s handoff without a fake PR',
    outcome => {
      const value = {
        ...requestInput(),
        outcome,
        pull: null,
        reason: 'Missing cross-line decision',
        remaining: ['Define shared contract'],
        verification: [],
      }
      expect(parseRequestInput(value)).toEqual(value)
    },
  )

  it.each([
    { pull: null },
    { remaining: ['still broken'] },
    { reason: 'blocked' },
    { verification: [] },
    { stopped: { writers: ['running'], evidence, confirmed: false } },
  ])('rejects incomplete ready handoff %#', fields => {
    expect(() => parseRequestInput({ ...requestInput(), ...fields })).toThrow()
  })

  it('rejects a receipt whose input changed after the workflow digest was fixed', () => {
    const value = request()
    value.input.report.description = 'changed after dispatch'
    expect(() => parseCollaborationRecord(value)).toThrow('input digest mismatch')
  })

  it.each([
    { schemaVersion: 2 },
    { schemaVersion: undefined },
    { kind: 'future' },
    { extra: true },
    { operationId: 'not-a-uuid' },
    { finalHead: 'abc' },
    { revision: 0 },
    { previousRecordId: 25 },
    { recordedAt: '2026-02-31T00:00:00Z' },
  ])('rejects unsupported or malformed delta %#', fields => {
    expect(() => parseCollaborationRecord({ ...delta(), ...fields })).toThrow()
  })

  it('requires a predecessor for later revisions', () => {
    expect(() => parseCollaborationRecord({ ...delta(), revision: 2 })).toThrow('record-chain')
  })

  it('keeps same-wave redispatch distinct from ordinary next-wave release', () => {
    const current = { ...assignment(), context: { ...context, planRevision: 2 } }
    const value = {
      ...delta(),
      purpose: 'redispatch',
      newRequestId: NEXT_UUID,
      continuation: { kind: 'active', assignment: current },
    }
    expect(parseCollaborationRecord(value)).toEqual(value)
    expect(() =>
      parseCollaborationRecord({ ...value, purpose: 'release', newRequestId: null }),
    ).toThrow('direct successor')
    expect(() => parseCollaborationRecord({ ...value, newRequestId: null })).toThrow('newRequestId')
  })

  it('supports persistent idle continuation but never infers terminal from absent next', () => {
    const value = delta(),
      next = release().next
    expect(
      parseCollaborationRecord({
        ...value,
        continuation: { kind: 'idle', next, reason: 'No work this wave' },
      }),
    ).toMatchObject({ continuation: { kind: 'idle' } })
    expect(() =>
      parseCollaborationRecord({
        ...value,
        continuation: { kind: 'idle', next: null, reason: 'Unknown' },
      }),
    ).toThrow()
    expect(() => parseCollaborationRecord({ ...release(), next: null })).toThrow(
      'successor mismatch',
    )
  })

  it('permits explicit terminal only with authorization and no global successor', () => {
    const terminal = {
      kind: 'terminal',
      reason: 'Milestone complete',
      authorization: evidence,
    } as const
    const value = release()
    const lines = value.lines.map(line => ({ ...line, continuation: terminal }))
    expect(parseCollaborationRecord({ ...value, lines, next: null })).toMatchObject({ next: null })
    expect(() => parseCollaborationRecord({ ...value, lines })).toThrow('terminal and successor')
    expect(() =>
      parseCollaborationRecord({ ...delta(), continuation: { kind: 'terminal', reason: 'Done' } }),
    ).toThrow()
  })

  it('rejects skipped reduce nodes and a next assignment with the wrong final baseline', () => {
    const value = delta()
    expect(() =>
      parseCollaborationRecord({
        ...value,
        continuation: {
          kind: 'active',
          assignment: { ...assignment(), context: { ...assignment().context, wave: 4 } },
        },
      }),
    ).toThrow('direct successor')
    expect(() =>
      parseCollaborationRecord({
        ...value,
        continuation: {
          kind: 'active',
          assignment: { ...assignment(), finalHead: 'f'.repeat(40) },
        },
      }),
    ).toThrow('baseline mismatch')
  })

  it('refuses duplicate participants, missing results and references on the wrong card', () => {
    const value = release()
    expect(() =>
      parseCollaborationRecord({ ...value, lines: [...value.lines, ...value.lines] }),
    ).toThrow('duplicate line')
    expect(() => parseCollaborationRecord({ ...value, results: [] })).toThrow('incomplete result')
    expect(() =>
      parseCollaborationRecord({
        ...value,
        lines: value.lines.map(line => ({ ...line, delta: { ...line.delta, issue: 999 } })),
      }),
    ).toThrow('line parent')
  })

  it('retains null request head when reduce integrates work taken over from a zero-diff failure', () => {
    expect(parseCollaborationRecord({ ...state(), requestHead: null })).toMatchObject({
      requestHead: null,
      candidateHead: FINAL,
    })
    expect(() => parseCollaborationRecord({ ...state(), mergeCommit: null })).toThrow(
      'merge and verification',
    )
  })

  it('does not interpret an ordinary comment as a machine record', () => {
    expect(decodeRecordComment('Please merge this PR')).toBeUndefined()
    expect(decodeRecordComment('Text\n<!-- line-delta -->')).toBeUndefined()
  })

  it('rejects mismatched markers, duplicate blocks and unsupported fences', () => {
    const body = encodeRecordComment(delta())
    expect(() =>
      decodeRecordComment(body.replace('<!-- line-delta -->', '<!-- reduce-release -->')),
    ).toThrow('marker-kind')
    expect(() => decodeRecordComment(body + body)).toThrow('fence-invalid')
    expect(() =>
      decodeRecordComment(body.replace('omne-collaboration:v1', 'omne-collaboration:v2')),
    ).toThrow('fence-invalid')
    expect(commentDigest(body + 'edited')).not.toBe(commentDigest(body))
  })
})

describe('strict collaboration JSON', () => {
  it.each(['{"a":1,"a":2}', '{"a":{"b":1,"b":2}}', '{"a":1,"\\u0061":2}'])(
    'rejects duplicate keys in %s',
    value => {
      expect(() => collaborationJson(value)).toThrow('duplicate-key')
    },
  )
  it('accepts nested strings, escaped keys, arrays and JSON primitives without executing data', () => {
    const value = { 'key"': ['$(echo never-executed)', true, null, 1.2e-5, { a: 2 }], b: '\\u0061' }
    expect(collaborationJson(JSON.stringify(value))).toEqual(value)
    for (const primitive of ['null', 'false', '42', '"string"'])
      expect(collaborationJson(primitive)).toEqual(JSON.parse(primitive))
  })
  it.each(['{', '{"a":}', '[1,]', '{"a":1} extra'])('rejects malformed JSON %s', value => {
    expect(() => collaborationJson(value)).toThrow('json-invalid')
  })
  it('bounds nested and oversized input', () => {
    expect(() => collaborationJson('['.repeat(130) + '0' + ']'.repeat(130))).toThrow('too-deep')
    expect(() => collaborationJson('"' + 'x'.repeat(1024 * 1024) + '"')).toThrow('too-large')
  })
})

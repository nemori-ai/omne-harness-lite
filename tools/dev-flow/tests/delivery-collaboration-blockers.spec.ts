import { describe, expect, it } from 'vitest'
import { commentDigest, encodeRecordComment } from '../src/delivery/collaboration-comments.ts'
import { parseCollaborationRecord } from '../src/delivery/collaboration-parse.ts'
import {
  blockedRequest,
  redispatchScenario,
  rescopeState,
  takeoverState,
} from './fixtures/collaboration-blockers.ts'

describe('hard blocker handoff fixtures', () => {
  it('keeps a zero-diff handoff non-successful and leaves integration unclaimed', () => {
    expect(parseCollaborationRecord(blockedRequest())).toMatchObject({
      input: { outcome: 'blocked', pull: null, verification: [] },
    })
    expect(parseCollaborationRecord(takeoverState())).toMatchObject({
      state: 'blocked',
      mergeCommit: null,
      disposition: { action: 'takeover', waitReduceIssue: 100 },
    })
    expect(parseCollaborationRecord(rescopeState())).toMatchObject({
      state: 'superseded',
      mergeCommit: null,
      disposition: { action: 'rescope', continuation: { kind: 'terminal' } },
    })
  })

  it('links an explicit same-wave redispatch to new input and a new request identity', () => {
    const scenario = redispatchScenario()
    for (const record of Object.values(scenario))
      expect(parseCollaborationRecord(record)).toEqual(record)
    const disposition = scenario.disposition.disposition
    if (disposition?.action !== 'redispatch') throw new Error('redispatch fixture required')
    expect(disposition.newRequestId).toBe(scenario.retry.input.requestId)
    expect(scenario.retry.input.previousRequestId).toBe(scenario.original.input.requestId)
    expect(scenario.retry.input.context.wave).toBe(scenario.original.input.context.wave)
    expect(scenario.retry.input.tasks).toEqual(disposition.assignment.tasks)
    expect(scenario.retry.input.tasks[0].attempt).not.toBe(scenario.original.input.tasks[0].attempt)
    expect(disposition.delta.sha256).toBe(commentDigest(encodeRecordComment(scenario.delta)))
  })

  it('refuses redispatch with old identity, missing stop evidence or a different reduce', () => {
    const { disposition } = redispatchScenario()
    const action = disposition.disposition
    if (action?.action !== 'redispatch') throw new Error('redispatch fixture required')
    for (const patch of [
      { newRequestId: disposition.requestId },
      { oldWritersStopped: null },
      { reduceWriteReleased: null },
      {
        assignment: {
          ...action.assignment,
          context: { ...action.assignment.context, reduceIssue: 200 },
        },
      },
    ])
      expect(() =>
        parseCollaborationRecord({ ...disposition, disposition: { ...action, ...patch } }),
      ).toThrow()
  })
})

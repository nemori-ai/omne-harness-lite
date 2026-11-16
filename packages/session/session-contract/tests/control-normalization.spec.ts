import { describe, expect, it } from 'vitest'
import {
  decideControlConsequences,
  deriveDriveOperation,
  type AttemptId,
  type ControlProgress,
  type RunId,
  type SessionAttemptRecord,
  type SessionControlDecisionInput,
  type SessionOperationId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'

const EXECUTION = 'execution-a'
const RUN = 'run-1' as RunId
const OPERATION = 'sop_cancel' as SessionOperationId
const ATTEMPT = 'attempt-1' as AttemptId
const WAIT = { consumption: 'consumption-1', position: 'position-1' }

type Material = Readonly<{
  attemptOf: string
  advance: 'held' | 'released'
  waits: boolean
}>

function decide(material: Material) {
  const progress: ControlProgress = {
    operation: OPERATION,
    target: { kind: 'run', run: RUN },
    intent: { kind: 'control', value: { kind: 'cancel-run', run: RUN, urgency: 'force' } },
    state: 'propagating',
    pending: [],
    pendingUnassociatedWaiting: material.waits ? [WAIT as never] : [],
  }
  const attempt: SessionAttemptRecord = {
    run: RUN,
    attempt: ATTEMPT,
    execution: material.attemptOf,
    ordinal: '1',
    started: evidence('attempt-started'),
  }
  const snapshot = {
    controls: [progress],
    run:
      material.advance === 'held'
        ? {
            kind: 'active',
            run: RUN,
            execution: { execution: EXECUTION },
            advance: { attempt: ATTEMPT },
          }
        : { kind: 'none' },
    workEntryIndex: {
      controls: [{ operation: OPERATION, selected: material.waits ? [WAIT] : [] }],
    },
    callRegistrations: material.waits
      ? [
          {
            consumption: WAIT.consumption,
            registration: {
              kind: 'tool-intent',
              action: 'action-1',
              request: evidence('request'),
              initiatingAttempt: ATTEMPT,
              purpose: 'action',
            },
          },
        ]
      : [],
  } as unknown as WorkSnapshot
  const input: SessionControlDecisionInput = {
    snapshot,
    execution: EXECUTION,
    run: RUN,
    attempts: [attempt],
    origins: [{ operation: OPERATION, execution: EXECUTION }],
    evidence: {
      through: '5',
      records: [
        {
          operation: deriveDriveOperation({
            kind: 'control',
            execution: EXECUTION,
            control: OPERATION,
          }),
          command: 'cancel',
          references: [],
          invocation: null,
          reached: ['intent-established', 'qualification-revoked', 'duty-released'],
          accepted: '1',
        },
      ],
      settled: [],
      urgent: [],
    },
  }
  return decideControlConsequences(input)
}

const reconciled = {
  ok: [
    {
      kind: 'control',
      progress: expect.objectContaining({
        state: 'reconciled',
        pending: [],
        pendingUnassociatedWaiting: [],
      }) as unknown,
    },
  ],
}
const unchanged = { ok: [{ kind: 'observed' }] }

describe('a cancel reconciles its control only on the original execution and once the advance is released', () => {
  it.each([
    {
      name: 'the attempt of the waiting responsibility is an attempt of this execution',
      material: { attemptOf: EXECUTION, advance: 'released', waits: true },
      answer: reconciled,
    },
    {
      name: 'the attempt of the waiting responsibility belongs to another execution: the cancel does not cover it',
      material: { attemptOf: 'execution-b', advance: 'released', waits: true },
      answer: unchanged,
    },
    {
      name: 'every attempt of the execution released the advance',
      material: { attemptOf: EXECUTION, advance: 'released', waits: false },
      answer: reconciled,
    },
    {
      name: 'the Run still holds the advance of the execution: qualification is not revoked',
      material: { attemptOf: EXECUTION, advance: 'held', waits: false },
      answer: unchanged,
    },
    {
      name: 'the execution has no attempt of its own: nothing released the advance',
      material: { attemptOf: 'execution-b', advance: 'released', waits: false },
      answer: unchanged,
    },
  ] as const satisfies readonly { name: string; material: Material; answer: unknown }[])(
    '$name',
    ({ material, answer }) => {
      expect(decide(material)).toEqual(answer)
    },
  )
})

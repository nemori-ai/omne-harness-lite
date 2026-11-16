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

describe('an urgent input reconciles its control once the Agent released each foreground call', () => {
  const INTERRUPT = 'sop_interrupt' as SessionOperationId
  const TOOL = { kind: 'tool', call: 'tool-ref-1' } as const
  const MODEL = { kind: 'model', call: 'model-ref-1' } as const
  const ITEM = { consumption: 'consumption-1', position: 'position-1' }
  const URGENT = {
    kind: 'ordinary',
    input: 'input-urgent',
    message: { role: 'user', blocks: [{ kind: 'text', text: 'now' }] },
    origin: evidence('urgent-origin'),
  } as const

  function decideInterrupt(
    material: Readonly<{
      submitted: boolean
      command: string | null
      reached: readonly string[]
      settled?: 'background' | 'result'
      settledAt?: string
      settledBy?: string
      model?: true
    }>,
  ) {
    const PRODUCER = material.model ? MODEL : TOOL
    const progress = {
      operation: INTERRUPT,
      target: { kind: 'run', run: RUN },
      intent: { kind: 'interrupt', run: RUN, urgent: URGENT, decision: evidence('decision') },
      state: 'propagating',
      pending: [PRODUCER],
      pendingUnassociatedWaiting: [],
    } as unknown as ControlProgress
    const snapshot = {
      controls: [progress],
      run: {
        kind: 'active',
        run: RUN,
        execution: { execution: EXECUTION },
        advance: { attempt: ATTEMPT },
      },
      workEntryIndex: { controls: [{ operation: INTERRUPT, selected: [ITEM] }] },
      callRegistrations: [
        {
          consumption: ITEM.consumption,
          registration: {
            kind: 'associated',
            binding: { producer: PRODUCER, initiatingAttempt: ATTEMPT },
          },
        },
      ],
    } as unknown as WorkSnapshot
    return decideControlConsequences({
      snapshot,
      execution: EXECUTION,
      run: RUN,
      attempts: [
        {
          run: RUN,
          attempt: ATTEMPT,
          execution: EXECUTION,
          ordinal: '1',
          started: evidence('attempt-started'),
        },
      ],
      origins: [{ operation: INTERRUPT, execution: EXECUTION }],
      evidence: {
        through: '5',
        records:
          material.command === null
            ? []
            : [
                {
                  operation: 'aop_release',
                  command: material.command as never,
                  references: [PRODUCER.call],
                  invocation: PRODUCER.call,
                  reached: material.reached as never,
                  accepted: '3',
                },
              ],
        settled:
          material.settled === undefined
            ? []
            : [
                {
                  kind: material.settled,
                  binding: {
                    producer: { ...PRODUCER, call: material.settledBy ?? PRODUCER.call },
                    initiatingAttempt: ATTEMPT,
                  } as never,
                  revision: material.settledAt ?? '4',
                },
              ],
        urgent: material.submitted
          ? [
              {
                input: URGENT.input as never,
                message: URGENT.message as never,
                origin: URGENT.origin,
              },
            ]
          : [],
      },
    })
  }

  const released = ['intent-established', 'producer-confirmed', 'duty-released'] as const

  const cases: readonly Readonly<{
    name: string
    material: Parameters<typeof decideInterrupt>[0]
    answer: unknown
  }>[] = [
    {
      name: 'the urgent input was submitted and Tool answered the release of the call',
      material: { submitted: true, command: 'release-tool', reached: released },
      answer: reconciled,
    },
    {
      name: 'a release that Tool reports as physically stopped also releases the call',
      material: {
        submitted: true,
        command: 'release-tool',
        reached: ['physically-stopped', 'duty-released'],
      },
      answer: reconciled,
    },
    {
      name: 'the interrupt of a foreground Model call releases it once the Model confirms',
      material: {
        submitted: true,
        command: 'interrupt-model',
        reached: ['intent-established', 'producer-confirmed', 'duty-released'],
        model: true,
      },
      answer: reconciled,
    },
    {
      name: 'an interrupt of a Model call does not release a Tool call',
      material: { submitted: true, command: 'interrupt-model', reached: ['producer-confirmed'] },
      answer: unchanged,
    },
    {
      name: 'the release of the call is still unanswered',
      material: { submitted: true, command: 'release-tool', reached: ['intent-established'] },
      answer: unchanged,
    },
    {
      name: 'the urgent input is not submitted yet: the call is released, the control still propagates',
      material: { submitted: false, command: 'release-tool', reached: released },
      answer: {
        ok: [
          {
            kind: 'control',
            progress: expect.objectContaining({ state: 'propagating', pending: [] }) as unknown,
          },
        ],
      },
    },
    {
      name: 'the call settled with its result before the Agent wrote any release: no wait is left',
      material: { submitted: true, command: null, reached: [], settled: 'result' },
      answer: reconciled,
    },
    {
      name: 'the call moved to the background before the Agent wrote any release: no wait is left',
      material: { submitted: true, command: null, reached: [], settled: 'background' },
      answer: reconciled,
    },
    {
      name: 'a result committed at the revision the evidence was read through still ends the wait',
      material: { submitted: true, command: null, reached: [], settled: 'result', settledAt: '5' },
      answer: reconciled,
    },
    {
      name: 'a result committed after the evidence was read does not count',
      material: { submitted: true, command: null, reached: [], settled: 'result', settledAt: '6' },
      answer: unchanged,
    },
    {
      name: 'a result of another call does not end the wait of this one',
      material: {
        submitted: true,
        command: null,
        reached: [],
        settled: 'result',
        settledBy: 'tool-ref-2',
      },
      answer: unchanged,
    },
    {
      name: 'a background request that Tool refused does not release the call',
      material: { submitted: true, command: 'background-tool', reached: released },
      answer: unchanged,
    },
  ]

  it.each(cases)('$name', ({ material, answer }) => {
    expect(decideInterrupt(material)).toEqual(answer)
  })
})

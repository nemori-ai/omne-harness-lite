import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import {
  judgeHandoffPrepare,
  judgeInputOrigin,
  type HandoffPrepare,
  type InputOrigin,
  type StructureFailure,
} from '@omne-harness/agent-contract'

const ADOPTION = { owner: 'agent', name: 'definition', revision: '3', digest: 'sha256:aa' }
const EVIDENCE = { owner: 'agent', record: 'record-1', revision: '4', digest: 'sha256:bb' }
const AUTHORITY = {
  execution: 'exec-1',
  executionAttachment: 'exec-1/attachment/1',
  instance: 'inst-1',
  generation: '1',
  source: EVIDENCE,
}
const judgedMessage = judgeMessage({
  id: `msg_${'a'.repeat(24)}`,
  role: 'user',
  blocks: [
    { kind: 'text', id: 'blk_01', visibility: { toHuman: true, toModel: true }, text: 'hello' },
  ],
})
if (!('ok' in judgedMessage)) throw new Error('the test message is invalid')
const MESSAGE = judgedMessage.ok

const PENDING = {
  kind: 'execution',
  reference: { kind: 'execution', execution: 'exec-1', operation: 'H/model-reply/step-1/I3@1' },
  predecessor: '1',
  position: { step: 'step-1', node: 'I3', slot: null },
  source: {
    kind: 'model-reply',
    step: 'step-1',
    action: 'step-1/main',
    call: 'mcall_1',
    result: { producer: { kind: 'model', call: 'mcall_1' }, version: 'v1', delivery: null, source: EVIDENCE },
  },
  candidate: MESSAGE,
  originalAdvance: AUTHORITY,
  predecessorHandoff: null,
}
const ENTRY = {
  kind: 'invoke',
  operation: 'invoke-1',
  execution: 'exec-1',
  initial: { id: 'input-1', content: MESSAGE, source: null, priority: 'ordinary' },
  checkpoint: { position: 'E3' },
}
const INPUT = {
  kind: 'input',
  reference: { kind: 'input', execution: 'exec-1', entry: 'invoke-1', input: 'input-1' },
  entry: ENTRY,
  source: { kind: 'external-input', input: 'input-1' },
}
const RUNTIME = { instance: 'inst-1', scope: EVIDENCE, definition: ADOPTION, grant: null }
const EXECUTION_PREPARE = { kind: 'execution', request: PENDING, advance: AUTHORITY }
const INVOKE_PREPARE = { kind: 'invoke', request: INPUT, runtime: RUNTIME }
const SUBMIT_PREPARE = {
  kind: 'submit',
  request: {
    ...INPUT,
    reference: { ...INPUT.reference, entry: 'submit-1' },
    entry: {
      kind: 'submit',
      operation: 'submit-1',
      execution: 'exec-1',
      value: ENTRY.initial,
    },
  },
}

const failureOf = (judged: unknown): StructureFailure => {
  expect(judged).toHaveProperty('failure')
  return (judged as { failure: StructureFailure }).failure
}
const okOf = <T>(judged: unknown): T => {
  expect(judged).toHaveProperty('ok')
  return (judged as { ok: T }).ok
}

describe('judgeHandoffPrepare', () => {
  it('accepts the three branches and returns a frozen value that does not share the input', () => {
    for (const input of [EXECUTION_PREPARE, INVOKE_PREPARE, SUBMIT_PREPARE]) {
      const judged = okOf<HandoffPrepare>(judgeHandoffPrepare(structuredClone(input)))
      expect(judged).toEqual(input)
      expect(Object.isFrozen(judged)).toBe(true)
      expect(Object.isFrozen(judged.request)).toBe(true)
      expect(judged.request).not.toBe(input.request)
    }
  })

  it('refuses a value that is not a plain object with the structure name', () => {
    expect(failureOf(judgeHandoffPrepare(5))).toEqual({ field: 'HandoffPrepare', reason: 'type' })
    expect(failureOf(judgeHandoffPrepare([]))).toEqual({ field: 'HandoffPrepare', reason: 'type' })
  })

  it('refuses a missing or unknown kind before reading any other member', () => {
    const { kind: _kind, ...withoutKind } = EXECUTION_PREPARE
    expect(failureOf(judgeHandoffPrepare(withoutKind))).toEqual({ field: 'kind', reason: 'missing' })
    expect(failureOf(judgeHandoffPrepare({ ...EXECUTION_PREPARE, kind: 'accept' }))).toEqual({
      field: 'kind',
      reason: 'type',
    })
  })

  it('refuses a member of another branch instead of guessing the branch', () => {
    expect(failureOf(judgeHandoffPrepare({ ...SUBMIT_PREPARE, advance: AUTHORITY }))).toEqual({
      field: 'advance',
      reason: 'unknown-field',
    })
    expect(failureOf(judgeHandoffPrepare({ ...SUBMIT_PREPARE, runtime: RUNTIME }))).toEqual({
      field: 'runtime',
      reason: 'unknown-field',
    })
    expect(failureOf(judgeHandoffPrepare({ ...INVOKE_PREPARE, advance: AUTHORITY }))).toEqual({
      field: 'advance',
      reason: 'unknown-field',
    })
    expect(failureOf(judgeHandoffPrepare({ ...EXECUTION_PREPARE, runtime: RUNTIME }))).toEqual({
      field: 'runtime',
      reason: 'unknown-field',
    })
    // An execution branch with an external request is not reinterpreted as an invoke branch.
    expect(failureOf(judgeHandoffPrepare({ ...EXECUTION_PREPARE, request: INPUT }))).toEqual({
      field: 'request.kind',
      reason: 'type',
    })
  })

  it('names the path of a nested member that is missing, not an identity or not a structure', () => {
    const { advance: _advance, ...withoutAdvance } = EXECUTION_PREPARE
    expect(failureOf(judgeHandoffPrepare(withoutAdvance))).toEqual({
      field: 'advance',
      reason: 'missing',
    })
    expect(
      failureOf(
        judgeHandoffPrepare({
          ...EXECUTION_PREPARE,
          request: { ...PENDING, reference: { ...PENDING.reference, operation: 'a b' } },
        }),
      ),
    ).toEqual({ field: 'request.reference.operation', reason: 'identity' })
    expect(
      failureOf(
        judgeHandoffPrepare({ ...EXECUTION_PREPARE, request: { ...PENDING, candidate: 'x' } }),
      ),
    ).toEqual({ field: 'request.candidate', reason: 'type' })
    expect(
      failureOf(
        judgeHandoffPrepare({
          ...EXECUTION_PREPARE,
          request: { ...PENDING, position: { ...PENDING.position, slot: '' } },
        }),
      ),
    ).toEqual({ field: 'request.position.slot', reason: 'empty' })
    expect(
      failureOf(
        judgeHandoffPrepare({
          ...EXECUTION_PREPARE,
          advance: { ...AUTHORITY, source: { ...EVIDENCE, record: '' } },
        }),
      ),
    ).toEqual({ field: 'advance.source.record', reason: 'empty' })
    expect(
      failureOf(judgeHandoffPrepare({ ...INVOKE_PREPARE, runtime: { ...RUNTIME, extra: 1 } })),
    ).toEqual({ field: 'runtime.extra', reason: 'unknown-field' })
  })

  it('cross-checks the reference, the entry and the source of an external request', () => {
    const mismatched = (request: unknown) =>
      failureOf(judgeHandoffPrepare({ ...INVOKE_PREPARE, request }))
    expect(
      mismatched({ ...INPUT, reference: { ...INPUT.reference, entry: 'invoke-2' } }),
    ).toEqual({ field: 'request.reference.entry', reason: 'identity' })
    expect(
      mismatched({ ...INPUT, reference: { ...INPUT.reference, execution: 'exec-2' } }),
    ).toEqual({ field: 'request.reference.execution', reason: 'identity' })
    expect(
      mismatched({ ...INPUT, reference: { ...INPUT.reference, input: 'input-2' } }),
    ).toEqual({ field: 'request.reference.input', reason: 'identity' })
    expect(mismatched({ ...INPUT, source: { kind: 'external-input', input: 'input-2' } })).toEqual({
      field: 'request.source.input',
      reason: 'identity',
    })
    // A submit entry has no checkpoint; an invoke entry needs one.
    expect(
      mismatched({ ...INPUT, entry: { ...ENTRY, kind: 'submit', value: ENTRY.initial } }),
    ).toEqual({ field: 'request.entry.initial', reason: 'unknown-field' })
    const { checkpoint: _checkpoint, ...withoutCheckpoint } = ENTRY
    expect(mismatched({ ...INPUT, entry: withoutCheckpoint })).toEqual({
      field: 'request.entry.checkpoint',
      reason: 'missing',
    })
  })

  it('refuses an accessor without running it', () => {
    let read = false
    const trap = { ...EXECUTION_PREPARE }
    Object.defineProperty(trap, 'advance', {
      enumerable: true,
      get() {
        read = true
        return AUTHORITY
      },
    })
    expect(failureOf(judgeHandoffPrepare(trap))).toEqual({
      field: 'HandoffPrepare',
      reason: 'type',
    })
    expect(read).toBe(false)
  })
})

describe('judgeInputOrigin', () => {
  const INVOKE: InputOrigin = {
    kind: 'invoke',
    instance: RUNTIME.instance as InputOrigin extends { instance: infer I } ? I : never,
    scope: EVIDENCE,
    definition: ADOPTION,
    grant: EVIDENCE,
  } as InputOrigin
  const SUBMIT = {
    kind: 'submit',
    executionBinding: EVIDENCE,
    delivery: { kind: 'runtime-view', instance: 'inst-1' },
  }

  it('accepts both branches and returns frozen values', () => {
    for (const input of [INVOKE, SUBMIT, { ...SUBMIT, delivery: { kind: 'durable-view' } }]) {
      const judged = okOf<InputOrigin>(judgeInputOrigin(structuredClone(input)))
      expect(judged).toEqual(input)
      expect(Object.isFrozen(judged)).toBe(true)
    }
  })

  it('refuses the members of the other branch and a bad delivery', () => {
    expect(failureOf(judgeInputOrigin({ ...INVOKE, delivery: SUBMIT.delivery }))).toEqual({
      field: 'delivery',
      reason: 'unknown-field',
    })
    expect(failureOf(judgeInputOrigin({ ...SUBMIT, grant: null }))).toEqual({
      field: 'grant',
      reason: 'unknown-field',
    })
    expect(
      failureOf(judgeInputOrigin({ ...SUBMIT, delivery: { kind: 'durable-view', instance: 'i' } })),
    ).toEqual({ field: 'delivery.instance', reason: 'unknown-field' })
    expect(
      failureOf(judgeInputOrigin({ ...SUBMIT, delivery: { kind: 'runtime-view' } })),
    ).toEqual({ field: 'delivery.instance', reason: 'missing' })
    expect(failureOf(judgeInputOrigin({ ...SUBMIT, executionBinding: 'x' }))).toEqual({
      field: 'executionBinding',
      reason: 'type',
    })
    expect(failureOf(judgeInputOrigin({ kind: 'runtime' }))).toEqual({
      field: 'kind',
      reason: 'type',
    })
    expect(failureOf(judgeInputOrigin(null))).toEqual({ field: 'InputOrigin', reason: 'type' })
  })
})

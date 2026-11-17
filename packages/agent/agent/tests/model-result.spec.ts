import { describe, expect, it } from 'vitest'
import { decodeStepId } from '@omne-harness/agent-contract'
import {
  decodeModelOperationId,
  decodeOutputCursor,
  decodeResultVersion,
  type ModelFaultCause,
  type ResultPart,
  type Settlement,
  type Termination,
} from '@omne-harness/model-contract'
import { consumeModelResult, noReplyReason } from '../src/loop/model-result.ts'
import { acceptedInput, evidence, execution, ok, producedResult } from './journal-support.ts'

const step = ok(decodeStepId('step-1'))
const text: ResultPart = {
  kind: 'sealed',
  trims: [],
  block: {
    kind: 'text',
    id: acceptedInput('reply').content.blocks[0].id,
    visibility: { toHuman: true, toModel: true },
    text: 'the answer',
  },
}
const half: ResultPart = { kind: 'partial', content: 'text', value: 'half', trims: [] }
const completed: Termination = { kind: 'completed', reason: 'stop' }
const failed = (cause: ModelFaultCause): Termination =>
  ({
    kind: 'failed',
    fault: { cause, diagnostic: 'response-body-lost', upstreamStatus: null },
  }) as Termination
const interrupted: Termination = {
  kind: 'interrupted',
  control: ok(decodeModelOperationId('mop_control')),
}

function settlement(termination: Termination): Settlement {
  return {
    version: ok(decodeResultVersion('mrver_1')),
    termination,
    cursor: ok(decodeOutputCursor('1')),
    source: evidence('settled'),
  }
}

function consumed(termination: Termination, parts: readonly ResultPart[]) {
  return ok(
    consumeModelResult([execution(), step], {
      produced: producedResult('call-1'),
      settlement: settlement(termination),
      parts,
    }),
  )
}

describe('consumeModelResult sorts a settled main call into reply, interrupted or unusable', () => {
  it('a completed call with a sealed block and no partial part is a reply', () => {
    expect(consumed(completed, [text])).toMatchObject({ kind: 'reply' })
  })

  it.each([
    ['without content', []],
    ['with a partial part only', [half]],
  ])('an interrupted call %s is interrupted, not a failure', (_name, parts) => {
    expect(consumed(interrupted, parts)).toMatchObject({ kind: 'interrupted' })
  })

  it.each([
    ['stream-lost with part of a text', failed('stream-lost'), [half]],
    ['upstream-unavailable without content', failed('upstream-unavailable'), []],
    ['a refused credential', failed('credential'), []],
    ['stream-lost after a whole sealed text', failed('stream-lost'), [text]],
  ])('a failed call is unusable, whatever its cause: %s', (_name, termination, parts) => {
    const result = consumed(termination, parts)
    expect(result.kind).toBe('unusable')
    expect(Object.hasOwn(result, 'nature')).toBe(false)
  })

  it('a completed call that holds a partial part was cut short: unusable', () => {
    const result = consumed(completed, [text, half])
    expect(result).toMatchObject({ kind: 'unusable' })
    expect(noReplyReason(result)).toBe('model-truncated')
  })

  it('a completed call without content is unusable', () => {
    const result = consumed(completed, [])
    expect(result).toMatchObject({ kind: 'unusable' })
    expect(noReplyReason(result)).toBe('no-reply')
  })
})

describe('noReplyReason', () => {
  it('names the fault of a failed call, whether it delivered content or not', () => {
    expect(noReplyReason(consumed(failed('stream-lost'), [half]))).toBe(
      'model-failed/stream-lost/response-body-lost',
    )
    expect(noReplyReason(consumed(failed('credential'), []))).toBe(
      'model-failed/credential/response-body-lost',
    )
  })
})

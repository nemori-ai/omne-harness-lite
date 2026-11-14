import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type { LoopFacts, PendingCall } from '@omne-harness/agent-contract'
import { consumption, evidence, ok } from './journal-support.ts'
import { conditions, inputBatch, loopFacts, pendingCall, responsibility } from './loop-support.ts'

const toolIntent: PendingCall = {
  kind: 'tool',
  purpose: 'action',
  association: 'intent',
  action: pendingCall.action,
  consumption: consumption('step-1/tool/0/result'),
  position: { owner: 'agent', work: 'exec-1', position: 'step-1/tool/0', purpose: 'action' },
  fixed: evidence('fixed-tool'),
}

const open: readonly (readonly [string, PendingCall])[] = [
  ['a main Model call', pendingCall],
  ['a Tool call', toolIntent],
]

const grounds: readonly (readonly [string, Partial<LoopFacts>])[] = [
  ['nothing else to do', { consumption: [responsibility('processed')] }],
  ['an input within the watermark', { batch: inputBatch(1) }],
  ['a continue directive', { conditions: conditions('continue') }],
]

describe('a terminal is never requested while the checkpoint holds an open call', () => {
  it.each(
    open.flatMap(([call, pending]) =>
      grounds.map(([ground, facts]) => [call, ground, pending, facts] as const),
    ),
  )(
    'I8 with %s and %s waits for the call: no completion, no new step, no step limit',
    (_call, _ground, pending, facts) => {
      const base = loopFacts('I8', facts)
      const next = ok(
        agentEvaluator.next({ ...base, checkpoint: { ...base.checkpoint, calls: [pending] } }),
      )
      expect(next).toEqual({ kind: 'wait', waiting: [{ kind: 'producer', pending }] })
    },
  )

  it('I8 with a retry state and an open call waits for the call', () => {
    const base = loopFacts('I8')
    const checkpoint = {
      ...base.checkpoint,
      calls: [pendingCall],
      modelRetry: { failures: 1, since: '1970-01-01T00:00:00Z', notBefore: '1970-01-01T00:00:01Z' },
    }
    expect(ok(agentEvaluator.next({ ...base, checkpoint }))).toEqual({
      kind: 'wait',
      waiting: [{ kind: 'producer', pending: pendingCall }],
    })
  })
})

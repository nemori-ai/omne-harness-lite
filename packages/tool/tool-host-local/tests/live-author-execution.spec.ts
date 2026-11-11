// The live execution of one author start: the fact stream it keeps, the end of that stream, and the
// state of a control that was accepted before the end.
import { describe, expect, it } from 'vitest'
import type { ToolExecutionFact } from '@omne-harness/tool-contract/provider'
import { completedFinal } from '@omne-harness/tool-contract/testing'
import { createLiveAuthorExecution } from '../src/live-author-execution.ts'
import { unbox } from './author-values.ts'
import { adoption, evidence, operationId, startOf } from './coordinator-values.ts'

const final = completedFinal() as ToolExecutionFact
const continued = {
  kind: 'continued',
  wait: 'w',
  response: 'r',
  timing: evidence('timing'),
} as unknown as ToolExecutionFact
const suspended = {
  kind: 'wait',
  value: { kind: 'ask', wait: 'w' },
} as unknown as ToolExecutionFact

async function batchesOf(execution: ReturnType<typeof createLiveAuthorExecution>) {
  const batches = []
  const signal = AbortSignal.timeout(2_000)
  for await (const batch of execution.live.facts({ after: null, signal })) batches.push(batch)
  return batches
}

describe('the live execution of an author start', () => {
  it('numbers its batches from one and chains each to the one before', async () => {
    const start = startOf('numbers')
    const execution = createLiveAuthorExecution({ start, release() {} })
    execution.publish(continued)
    execution.publish(final)
    const batches = await batchesOf(execution)
    expect(batches.map(batch => [batch.batch, batch.cursor, batch.after])).toEqual([
      ['1', '1', null],
      ['2', '2', '1'],
    ])
  })

  it('takes no fact after its stream ended, at a final or at a wait', () => {
    for (const last of [final, suspended]) {
      const execution = createLiveAuthorExecution({
        start: startOf('ended'),
        release() {},
      })
      execution.publish(last)
      expect(() => execution.publish(continued)).toThrow('the author execution ended')
    }
  })

  it('moves a control it accepted before the end to stopped, and answers one after the end as already ended', async () => {
    const start = startOf('control')
    const execution = createLiveAuthorExecution({ start, release() {} })
    const control = (name: string) => ({
      tenant: start.execution.tenant,
      call: start.execution.call,
      operation: operationId(name),
      adoption: adoption('stop'),
      inputDigest: `sha256:${name}`,
      start,
      intent: { kind: 'stop' as const },
      source: evidence(name),
    })
    expect(unbox(await execution.live.stop(control('before'))).kind).toBe('accepted')
    execution.publish(final)
    expect(unbox(await execution.live.inspectControl(control('before'))).kind).toBe('stopped')
    expect(unbox(await execution.live.stop(control('after'))).kind).toBe('already-ended')
    expect(unbox(await execution.live.inspectControl(control('after'))).kind).toBe('already-ended')
  })
})

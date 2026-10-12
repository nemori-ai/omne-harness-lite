import { expect, it } from 'vitest'
import { createAnchoredModelInvocation } from '@omne-harness-lite/session-runtime-local'
import { createModelExecutionPool } from '../src/execution-pool.ts'
import type {
  ModelExecutionRequest,
  PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
import { harness } from './anchored-invocation-fixture.ts'

it('uses the selected execution capability after the original dispatch admission', async () => {
  await harness(async h => {
    let executions = 0
    const pool = createModelExecutionPool()
    const execute = <P extends PlannedSemantics, R>(request: ModelExecutionRequest<P, R>) => {
      executions++
      expect(h.writes.some(write => write.entries.length > 0)).toBe(true)
      return pool.execute(request)
    }
    const handle = createAnchoredModelInvocation({ ...h.input, execute })
    try {
      expect(await handle.outcome).toHaveProperty('replyPending')
      expect(executions).toBe(1)
    } finally {
      expect(await handle.close()).toEqual({ released: true })
      expect(await pool.close()).toEqual({ released: true })
    }
  })
})

it('rejects a missing execution capability before writing or sending', async () => {
  await harness(async h => {
    const { execute: _execute, ...missing } = h.input
    const handle = Reflect.apply(createAnchoredModelInvocation, undefined, [missing])
    try {
      expect(await handle.outcome).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
      expect(h.writes).toHaveLength(0)
    } finally {
      expect(await handle.close()).toEqual({ released: true })
    }
  })
})

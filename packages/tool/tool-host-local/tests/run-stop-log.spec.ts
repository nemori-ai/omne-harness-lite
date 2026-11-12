// The executor's log of a call that a run left failed or blocked: one line when the reason changes.
import { describe, expect, it } from 'vitest'
import type { ToolCallId } from '@omne-harness/tool-contract'
import { createRunStopLog, troubleOf } from '../src/run-stop-log.ts'

const call = 'call-1' as ToolCallId
const unavailable = {
  kind: 'failed',
  failure: {
    kind: 'unavailable',
    dependency: 'execution-environment-adapter',
    diagnostic: 'placement unknown: authority',
  },
} as const

function logged() {
  const lines: string[] = []
  const log = createRunStopLog({
    warn: message => lines.push(`warn ${message}`),
    info: message => lines.push(`info ${message}`),
  })
  return { lines, log }
}

describe('the log of the runs that stop on trouble', () => {
  it('writes one warn while a call keeps stopping for the same reason, and one more when it changes', () => {
    const { lines, log } = logged()
    log.stopped('k', call, unavailable)
    log.stopped('k', call, unavailable)
    log.stopped('k', call, { kind: 'blocked', diagnostic: 'the preparation was excluded' })
    expect(lines).toEqual([
      'warn Tool call call-1 stopped on failed: unavailable dependency="execution-environment-adapter" diagnostic="placement unknown: authority"; the driver runs it again when it can',
      'warn Tool call call-1 stopped on blocked: the preparation was excluded; the driver runs it again when it can',
    ])
  })

  it('writes an info when the call goes on, and nothing for runs that never stopped on trouble', () => {
    const { lines, log } = logged()
    log.stopped('k', call, { kind: 'idle' })
    log.stopped('k', call, unavailable)
    log.stopped('k', call, { kind: 'yielded', progressed: true })
    log.stopped('k', call, { kind: 'waiting', key: 'q' })
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe(
      'info Tool call call-1 goes on; it had stopped on failed: unavailable dependency="execution-environment-adapter" diagnostic="placement unknown: authority"',
    )
  })

  it('keeps each call apart, and forgets a call that retired', () => {
    const { lines, log } = logged()
    log.stopped('a', call, unavailable)
    log.stopped('b', 'call-2' as ToolCallId, unavailable)
    log.forget('a')
    log.stopped('a', call, unavailable)
    expect(lines).toHaveLength(3)
  })

  it('names no trouble for a stop that is not a failure or a block', () => {
    for (const stop of [
      { kind: 'idle' },
      { kind: 'waiting', key: 'q' },
      { kind: 'yielded', progressed: false },
    ] as const)
      expect(troubleOf(stop)).toBeNull()
  })
})

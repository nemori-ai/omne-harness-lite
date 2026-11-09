// The port answers the coordinator treats as a dependency wait (Agent SPEC 依赖不可用时的等待):
// only failures a port answered are noted. Production ports are frozen objects, so the noting
// wrapper must work over them too.
import { describe, expect, it } from 'vitest'
import type { Failure } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { answeredByPort, notingPorts } from '../src/loop/port-answers.ts'

const down: Failure = { kind: 'unavailable', owner: 'port', diagnostic: 'down' }

describe('notingPorts', () => {
  it('notes a failure a frozen port answers, through nested objects, and keeps its keys', async () => {
    const port = Object.freeze({
      calls: Object.freeze({ admit: () => Promise.resolve(fail(down)) }),
      read: () => succeed(1),
    })
    const noted = notingPorts(port)
    const answer = await noted.calls.admit()
    expect(answer).toEqual(fail(down))
    expect('failure' in answer && answeredByPort(answer.failure)).toBe(true)
    expect(noted.read()).toEqual(succeed(1))
    expect(Object.keys({ ...noted })).toEqual(['calls', 'read'])
  })

  it('does not note a failure that no port answered', () => {
    expect(answeredByPort({ kind: 'unavailable', owner: 'evaluator', diagnostic: 'stop' })).toBe(
      false,
    )
  })
})

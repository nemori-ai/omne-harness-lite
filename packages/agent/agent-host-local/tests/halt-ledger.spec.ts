import { decodeAgentExecutionId, decodeStepId } from '@omne-harness/agent-contract'
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createHaltLedger, haltBounded } from '../src/halt-ledger.ts'
import type { RuntimeFactory } from '../src/host.ts'
import { ok } from './host-support.ts'

const execution = (name: string) => ok(decodeAgentExecutionId(name))
const step = (ordinal: number) => ok(decodeStepId(`step-${String(ordinal)}`))
const halt = (at: number, node = 'F3') => ({ step: step(at), node, failure: 'invalid' as const })

describe('the halts of an execution at one step', () => {
  it('refuses the resume once the execution halted the limit of times at one step', () => {
    const ledger = createHaltLedger({ limit: 3, capacity: 8 })
    ledger.record(execution('a'), halt(2))
    ledger.record(execution('a'), halt(2))
    expect(ledger.refusal(execution('a'))).toBeNull()
    ledger.record(execution('a'), halt(2))
    expect(ledger.refusal(execution('a'))).toEqual({
      kind: 'invalid',
      field: 'execution',
      reason: 'halted 3 times at step-2, last at F3 on invalid',
    })
  })

  it('counts a halt at whichever node of the step, and starts again when the step moves', () => {
    const ledger = createHaltLedger({ limit: 2, capacity: 8 })
    ledger.record(execution('a'), halt(1, 'F2'))
    ledger.record(execution('a'), halt(2, 'F3'))
    expect(ledger.refusal(execution('a'))).toBeNull()
    ledger.record(execution('a'), halt(2, 'F1'))
    expect(ledger.refusal(execution('a'))?.kind).toBe('invalid')
  })

  it('counts a halt before the first step as its own step', () => {
    const ledger = createHaltLedger({ limit: 2, capacity: 8 })
    ledger.record(execution('a'), { step: null, node: null, failure: 'unavailable' })
    ledger.record(execution('a'), { step: null, node: null, failure: 'unavailable' })
    expect(ledger.refusal(execution('a'))).toMatchObject({
      reason: 'halted 2 times before the first step, last at no node on unavailable',
    })
  })

  it('keeps each execution apart and forgets one that is named', () => {
    const ledger = createHaltLedger({ limit: 1, capacity: 8 })
    ledger.record(execution('a'), halt(1))
    expect(ledger.refusal(execution('b'))).toBeNull()
    ledger.forget(execution('a'))
    expect(ledger.refusal(execution('a'))).toBeNull()
  })

  it('drops the execution left alone the longest when it is full; that one counts from zero', () => {
    const ledger = createHaltLedger({ limit: 2, capacity: 2 })
    ledger.record(execution('a'), halt(1))
    ledger.record(execution('b'), halt(1))
    ledger.record(execution('a'), halt(1))
    ledger.record(execution('c'), halt(1))
    expect(ledger.refusal(execution('a'))?.kind).toBe('invalid')
    ledger.record(execution('b'), halt(1))
    expect(ledger.refusal(execution('b'))).toBeNull()
  })

  it('refuses exactly when the last halts at one step reach the limit', () => {
    const sequences = (length: number): number[][] =>
      length === 0
        ? [[]]
        : sequences(length - 1).flatMap(head => [0, 1, 2].map(at => [...head, at]))
    for (const limit of [1, 2, 3, 4])
      for (const steps of [1, 2, 3, 4, 5, 6].flatMap(sequences)) {
        const ledger = createHaltLedger({ limit, capacity: 8 })
        for (const at of steps) ledger.record(execution('a'), halt(at))
        const last = steps.at(-1)
        const run = steps.length - 1 - steps.findLastIndex(at => at !== last)
        expect(
          ledger.refusal(execution('a')) !== null,
          `${String(limit)}: ${steps.join(',')}`,
        ).toBe(run >= limit)
      }
  })
})

describe('a runtime factory whose resumes are bounded by the halts', () => {
  type Extras = Parameters<RuntimeFactory>[2]

  function world(created: 'runtime' | 'failure' = 'runtime') {
    const told: string[] = []
    const resumed: string[] = []
    const warnings: string[] = []
    let extras: Extras | undefined
    const factory: RuntimeFactory = (_dependencies, _options, received) => {
      extras = received
      if (created === 'failure')
        return Promise.resolve(fail({ kind: 'invalid', field: 'options', reason: 'refused' }))
      return Promise.resolve(
        succeed({
          runtime: {
            resume: (input: { execution: string }) => {
              resumed.push(input.execution)
              return Promise.resolve(succeed('resumed'))
            },
          },
        } as never),
      )
    }
    const bounded = haltBounded(factory, createHaltLedger({ limit: 2, capacity: 8 }), text =>
      warnings.push(text),
    )
    const made = bounded({} as never, { configuration: {} } as never, {
      failed: event => told.push(`failed ${event.execution}`),
      endedFailed: event => told.push(`ended ${event.execution}`),
      waiting: () => {},
    })
    const halted = (name: string) =>
      extras?.failed({ execution: execution(name), ...halt(1), failure: REFUSED } as never)
    const ended = (name: string) => extras?.endedFailed({ execution: execution(name) } as never)
    return { made, told, resumed, warnings, halted, ended }
  }

  const REFUSED = { kind: 'invalid', field: 'storage', reason: 'command_limit' } as const
  const resume = async (made: ReturnType<typeof world>['made'], name: string) =>
    ok(await made).runtime.resume({ execution: execution(name) } as never)

  it('answers the failure of the factory as it is', async () => {
    expect(await world('failure').made).toEqual({
      failure: { kind: 'invalid', field: 'options', reason: 'refused' },
    })
  })

  it('passes each report on, and an execution that ended is resumed again', async () => {
    const { made, told, resumed, warnings, halted, ended } = world()
    await made
    halted('a')
    halted('a')
    expect(await resume(made, 'a')).toMatchObject({ failure: { kind: 'invalid' } })
    expect(warnings).toHaveLength(1)
    ended('a')
    expect(await resume(made, 'a')).toEqual({ ok: 'resumed' })
    expect(resumed).toEqual(['a'])
    expect(told).toEqual(['failed a', 'failed a', 'ended a'])
  })
})

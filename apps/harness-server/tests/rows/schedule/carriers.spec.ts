import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { ScheduleJobExecutor, SchedulePurpose } from '@omne-harness/schedule-contract'
import { createCarriers, executorOf, missingCarriers } from '../../../src/rows/schedule/carriers.ts'

const purpose = {
  kind: 'execution',
  work: { kind: 'program', programRef: 'probe', input: {} },
  scope: { kind: 'fleet' },
  catchUp: { kind: 'none' },
  overlap: 'parallel',
  misfire: null,
  notifications: [
    { event: 'failed', content: { title: null, body: 'x' }, target: { kind: 'owner' } },
  ],
} as SchedulePurpose

const executor = {} as ScheduleJobExecutor
const program = { name: 'probe', run: async () => ({ result: true }) }

describe('the carriers of the schedule row', () => {
  it('a schedule that sends a notice while no notification carrier is registered names it as missing; registered, nothing is missing', () => {
    const carriers = createCarriers(new Context())
    carriers.executors.register('program', executor)
    carriers.programs.register(program)
    expect(missingCarriers(carriers, purpose)).toEqual(['notification'])
    carriers.results.register({ kind: 'notification', ref: null })
    expect(missingCarriers(carriers, purpose)).toEqual([])
    expect(executorOf(carriers, purpose.kind === 'execution' ? purpose.work : never())).toBe(
      executor,
    )
  })

  it('every missing carrier is named; withdrawing takes back only the registration it made', () => {
    const carriers = createCarriers(new Context())
    expect(missingCarriers(carriers, purpose)).toEqual([
      'executor:program',
      'program:probe',
      'notification',
    ])
    const withdraw = carriers.programs.register(program)
    expect(() => carriers.programs.register(program)).toThrow('already registered')
    const other = { ...program }
    withdraw()
    const again = carriers.programs.register(other)
    withdraw()
    expect(carriers.programs.get('probe')).toBe(other)
    again()
    expect(carriers.programs.get('probe')).toBeUndefined()
  })
})

function never(): never {
  throw new Error('execution expected')
}

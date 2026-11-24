import { describe, expect, it } from 'vitest'
import type {
  ScheduleExecutorInspection,
  ScheduleExecutorStart,
  ScheduleExecutorStop,
  ScheduleInstant,
  ScheduleJobExecutor,
} from '@omne-harness/schedule-contract'
import { coordinateJob } from '../../src/dispatch/coordinate.ts'
import type { JobFacts, JobState } from '../../src/dispatch/job.ts'
import type { DispatchCommand, DispatchJob } from '../../src/dispatch/types.ts'

const at = '2027-01-01T00:00:00.000Z' as ScheduleInstant
const owner = { kind: 'tenant', tenantId: 't', ownerId: 'o' } as const
const work = { kind: 'program', programRef: 'probe', input: {} } as const

function open(state: JobState, change: Partial<JobFacts> & { quietBefore?: boolean } = {}) {
  const { quietBefore = true, ...facts } = change
  return {
    jobId: 'job-1',
    scheduleId: null,
    slotAt: null,
    acceptedAt: at,
    work,
    facts: { state, stopState: 'none', executionRef: null, outcome: null, reason: null, ...facts },
    revision: 3,
    quietBefore,
  } as DispatchJob
}

type Answers = Partial<{
  start: ScheduleExecutorStart
  inspect: ScheduleExecutorInspection
  stop: ScheduleExecutorStop
}>

/** An executor and a store that log, in order, every call and every committed event. */
function world(answers: Answers = {}, commits: (command: DispatchCommand) => boolean = () => true) {
  const log: string[] = []
  const executor: ScheduleJobExecutor = {
    check: async () => ({ kind: 'ready' }),
    start: async job => {
      log.push(`start:${job.executionRef}`)
      return answers.start ?? { kind: 'started', executionRef: 'run-1', running: true }
    },
    inspect: async job => {
      log.push(`inspect:${job.executionRef}`)
      return answers.inspect ?? { kind: 'running', executionRef: 'run-1' }
    },
    requestStop: async (_job, urgency) => {
      log.push(`stop:${urgency}`)
      return answers.stop ?? { kind: 'sent' }
    },
  }
  const ports = {
    owner,
    executor: () => executor,
    commit: async (command: DispatchCommand) => {
      if (command.kind !== 'step') throw new Error('step expected')
      const ok = commits(command)
      const to = `${command.next.state}${command.next.executionRef === null ? '' : `/${command.next.executionRef}`}`
      log.push(`${ok ? 'commit' : 'refused'}:${command.event.kind}@${command.revision}->${to}`)
      return ok
    },
  }
  return { log, ports }
}

describe('one round of one open Job', () => {
  it('the start intent is committed before the executor is asked to start; what it answers is the next commit', async () => {
    const w = world()
    expect(await coordinateJob(w.ports, open('accepted'), at)).toBe(2)
    expect(w.log).toEqual([
      'commit:startIntent@3->startPending',
      'start:null',
      'commit:taken@4->running/run-1',
    ])
  })

  it('a refused intent never reaches the executor', async () => {
    const w = world({}, () => false)
    expect(await coordinateJob(w.ports, open('accepted'), at)).toBe(0)
    expect(w.log).toEqual(['refused:startIntent@3->startPending'])
  })

  it('an unknown answer to the start commits nothing after the intent', async () => {
    const w = world({ start: { kind: 'unknown', reason: 'timeout' } })
    expect(await coordinateJob(w.ports, open('accepted'), at)).toBe(1)
    expect(w.log).toEqual(['commit:startIntent@3->startPending', 'start:null'])
  })

  it('a recoverable refusal to start is committed; a blocked Job is started again next round', async () => {
    const refused = world({ start: { kind: 'notStarted', recoverable: true, reason: 'busy' } })
    await coordinateJob(refused.ports, open('accepted'), at)
    expect(refused.log).toEqual([
      'commit:startIntent@3->startPending',
      'start:null',
      'commit:notStarted@4->blocked',
    ])
    const again = world()
    expect(await coordinateJob(again.ports, open('blocked'), at)).toBe(2)
    expect(again.log).toEqual([
      'commit:startIntent@3->startPending',
      'start:null',
      'commit:taken@4->running/run-1',
    ])
  })

  it('a waiting Job moves only once its predecessors are quiet, and then starts in the same round', async () => {
    const loud = world()
    expect(await coordinateJob(loud.ports, open('waiting', { quietBefore: false }), at)).toBe(0)
    expect(loud.log).toEqual([])
    const quiet = world()
    expect(await coordinateJob(quiet.ports, open('waiting'), at)).toBe(3)
    expect(quiet.log).toEqual([
      'commit:predecessorsQuiet@3->accepted',
      'commit:startIntent@4->startPending',
      'start:null',
      'commit:taken@5->running/run-1',
    ])
  })

  it('without an executor for the work, or without work, nothing is asked and nothing committed', async () => {
    const w = world()
    const none = { ...w.ports, executor: () => undefined }
    expect(await coordinateJob(none, open('accepted'), at)).toBe(0)
    expect(await coordinateJob(w.ports, { ...open('accepted'), work: null }, at)).toBe(0)
    expect(w.log).toEqual([])
  })

  it('a started Job is inspected with its execution; ended is committed, unknown is not', async () => {
    const ended = world({
      inspect: { kind: 'ended', report: 'succeeded', result: true, reason: 'done' },
    })
    expect(await coordinateJob(ended.ports, open('running', { executionRef: 'run-1' }), at)).toBe(1)
    expect(ended.log).toEqual(['inspect:run-1', 'commit:ended@3->concluded/run-1'])
    const unknown = world({ inspect: { kind: 'unknown', reason: 'gone' } })
    expect(await coordinateJob(unknown.ports, open('startPending'), at)).toBe(0)
    expect(unknown.log).toEqual(['inspect:null'])
  })

  it('a pending start learns from the inspection: taken records the execution, running moves on, not started blocks', async () => {
    const w = world({ inspect: { kind: 'taken', executionRef: 'run-9' } })
    expect(await coordinateJob(w.ports, open('startPending'), at)).toBe(1)
    expect(w.log).toEqual(['inspect:null', 'commit:taken@3->startPending/run-9'])
    const running = world()
    await coordinateJob(running.ports, open('startPending'), at)
    expect(running.log).toEqual(['inspect:null', 'commit:taken@3->running/run-1'])
    const never = world({ inspect: { kind: 'notStarted', recoverable: true, reason: 'busy' } })
    await coordinateJob(never.ports, open('startPending'), at)
    expect(never.log).toEqual(['inspect:null', 'commit:notStarted@3->blocked'])
  })

  it('a requested stop is sent gracefully before the inspection; each answer is its own commit', async () => {
    const requested = open('running', { executionRef: 'run-1', stopState: 'requested' })
    const sent = world({
      inspect: { kind: 'ended', report: 'stopped', result: false, reason: 'x' },
    })
    expect(await coordinateJob(sent.ports, requested, at)).toBe(2)
    expect(sent.log).toEqual([
      'stop:graceful',
      'commit:stopSent@3->running/run-1',
      'inspect:run-1',
      'commit:ended@4->concluded/run-1',
    ])
    const confirmed = world({ stop: { kind: 'confirmed' } })
    await coordinateJob(confirmed.ports, requested, at)
    expect(confirmed.log.slice(0, 2)).toEqual([
      'stop:graceful',
      'commit:stopConfirmed@3->running/run-1',
    ])
    const unknown = world({ stop: { kind: 'unknown', reason: 'gone' } })
    await coordinateJob(unknown.ports, requested, at)
    expect(unknown.log.slice(0, 2)).toEqual([
      'stop:graceful',
      'commit:stopUnknown@3->running/run-1',
    ])
  })

  it('a stop is not sent before the start took an execution, and a concluded Job is left alone', async () => {
    const pending = world()
    await coordinateJob(pending.ports, open('startPending', { stopState: 'requested' }), at)
    expect(pending.log[0]).toBe('inspect:null')
    const concluded = world()
    expect(await coordinateJob(concluded.ports, open('concluded', { outcome: 'failed' }), at)).toBe(
      0,
    )
    expect(concluded.log).toEqual([])
  })
})

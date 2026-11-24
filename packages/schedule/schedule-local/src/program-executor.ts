import { randomUUID } from 'node:crypto'
import type {
  ScheduleExecutorInspection,
  ScheduleExecutorJob,
  ScheduleJobExecutor,
  ScheduleJsonValue,
  ScheduleProgram,
} from '@omne-harness/schedule-contract'

type Run = {
  readonly ref: string
  readonly controller: AbortController
  ended: Extract<ScheduleExecutorInspection, { kind: 'ended' }> | null
}

const PREFIX = 'program:'

/** The executor of program work. An execution of an earlier generation of this process ended with it: interrupted. */
export function createProgramExecutor(
  programs: (name: string) => ScheduleProgram | undefined,
  generation: string = randomUUID(),
) {
  const runs = new Map<string, Run>()
  const own = (ref: string | null) => ref !== null && ref.startsWith(`${PREFIX}${generation}:`)

  function begin(
    job: ScheduleExecutorJob,
    program: ScheduleProgram,
    input: ScheduleJsonValue,
  ): Run {
    const run: Run = {
      ref: `${PREFIX}${generation}:${job.jobId}`,
      controller: new AbortController(),
      ended: null,
    }
    runs.set(job.jobId, run)
    void program.run(input, { signal: run.controller.signal, jobId: job.jobId }).then(
      ({ result }) => {
        run.ended = run.controller.signal.aborted
          ? { kind: 'ended', report: 'stopped', result, reason: 'stopped' }
          : { kind: 'ended', report: 'succeeded', result, reason: 'done' }
      },
      (error: unknown) => {
        run.ended = run.controller.signal.aborted
          ? { kind: 'ended', report: 'stopped', result: false, reason: 'stopped' }
          : {
              kind: 'ended',
              report: 'failed',
              result: false,
              reason: String(error instanceof Error ? error.message : error),
            }
      },
    )
    return run
  }

  const executor: ScheduleJobExecutor = {
    async check(job) {
      if (job.work.kind !== 'program') return { kind: 'unsupported', reason: 'not-program-work' }
      return programs(job.work.programRef) === undefined
        ? { kind: 'unavailable', reason: `program-missing:${job.work.programRef}` }
        : { kind: 'ready' }
    },
    async start(job) {
      const known = runs.get(job.jobId)
      if (known !== undefined)
        return { kind: 'started', executionRef: known.ref, running: known.ended === null }
      if (job.executionRef !== null)
        return { kind: 'started', executionRef: job.executionRef, running: false }
      if (job.work.kind !== 'program')
        return { kind: 'notStarted', recoverable: false, reason: 'not-program-work' }
      const program = programs(job.work.programRef)
      if (program === undefined)
        return {
          kind: 'notStarted',
          recoverable: true,
          reason: `program-missing:${job.work.programRef}`,
        }
      return {
        kind: 'started',
        executionRef: begin(job, program, job.work.input).ref,
        running: true,
      }
    },
    async inspect(job) {
      const known = runs.get(job.jobId)
      if (known !== undefined) return known.ended ?? { kind: 'running', executionRef: known.ref }
      if (job.executionRef !== null && !own(job.executionRef))
        return { kind: 'ended', report: 'failed', result: false, reason: 'interrupted' }
      return { kind: 'notStarted', recoverable: true, reason: 'never-started' }
    },
    async requestStop(job) {
      const known = runs.get(job.jobId)
      if (known === undefined) return { kind: 'confirmed' }
      if (known.ended !== null) return { kind: 'confirmed' }
      known.controller.abort()
      return { kind: 'sent' }
    },
  }
  return executor
}

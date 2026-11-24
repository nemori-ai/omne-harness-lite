import type { Context } from '@deepseek-ai/cordis'
import type { ScheduleProgram } from '@omne-harness/schedule-contract'
import {
  scheduleProgramsKey,
  type ScheduleProgramsService,
} from '@omne-harness/schedule-cordis-contract/cordis'
import { runTimeOf } from '../entry/time.ts'
import { defineRow } from '../row.ts'

export const LAB_PROGRAMS_ROW = { id: 'lab-programs', plugin: 'labPrograms', config: {} } as const

function inputOf(input: unknown): Readonly<{ seconds: number; result: boolean }> {
  const value = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >
  const seconds =
    typeof value['seconds'] === 'number' && value['seconds'] >= 0 ? value['seconds'] : 0
  return { seconds, result: value['result'] !== false }
}

/** Sleeps the given seconds on the run's time, then says whether it left a result; a stop ends it at once. */
function sleepProgram(ctx: Context): ScheduleProgram {
  return {
    name: 'lab.sleep',
    run: (input, { signal }) =>
      new Promise((resolve, reject) => {
        const { seconds, result } = inputOf(input)
        const cancel = runTimeOf(ctx).after(seconds * 1000, () => resolve({ result }))
        signal.addEventListener('abort', () => {
          cancel()
          reject(new Error('stopped'))
        })
      }),
  }
}

/** Only in the lab assembly: a program the schedules made there can run. The release registers none. */
export const labProgramsRow = defineRow({
  row: LAB_PROGRAMS_ROW.id,
  implementation: 'contract-double',
  manifest: { provides: [], injects: [scheduleProgramsKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    inject: [scheduleProgramsKey],
    apply(ctx: Context) {
      const programs = ctx.get(scheduleProgramsKey) as ScheduleProgramsService
      ctx.effect(() => programs.register(sleepProgram(ctx)))
    },
  },
})

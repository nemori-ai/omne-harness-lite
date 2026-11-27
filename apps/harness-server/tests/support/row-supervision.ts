import { RowSupervisor } from '@omne-harness/assembly-cordis/cordis'
import { monotonicClock, type RowSupervision, type ShutdownClock } from '../../src/shutdown.ts'
import type { LifecycleHandle, ShutdownReport } from '../../src/types.ts'

/** The supervision of rows a test builds by hand, as `run.ts` builds it for a process. */
export function rowSupervision(
  options: Readonly<{ clock?: ShutdownClock; withdrawalDeadlineMs?: number }> = {},
): RowSupervision {
  return new RowSupervisor<LifecycleHandle, ShutdownReport>({
    clock: options.clock ?? monotonicClock,
    ...(options.withdrawalDeadlineMs === undefined
      ? {}
      : { withdrawalDeadlineMs: options.withdrawalDeadlineMs }),
  })
}

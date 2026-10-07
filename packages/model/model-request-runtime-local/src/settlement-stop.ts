import type { SettlementTask } from '@omne-harness-lite/model-request-runtime'

/**
 * Settlement completion and actual stop are independent (settlement-types SettlementTask); some
 * owners stop only on request. An owner that is done with a task therefore asks for the stop
 * before it waits for the actual stopped proof, or it may wait on itself forever.
 */
export function requestStopAndWait(task: SettlementTask<unknown>): Promise<void> {
  try {
    task.requestStop()
  } catch {
    // A failed request cannot certify anything; the actual stopped promise stays authoritative.
  }
  return task.stopped
}

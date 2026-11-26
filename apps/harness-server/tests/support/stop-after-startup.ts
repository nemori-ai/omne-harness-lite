import type { S0Record } from '../../src/run.ts'

/**
 * Starts a serve run and stops it at once: the stop is asked when the run writes its startup result. A stop asked
 * before that turns the run to shutdown while it still loads.
 */
export function stopAfterStartup(write: (record: S0Record) => void = () => {}): {
  stop: AbortSignal
  write: (record: S0Record) => void
} {
  const controller = new AbortController()
  return {
    stop: controller.signal,
    write(record) {
      write(record)
      if (record.kind === 'startup-result') controller.abort('test: stop')
    },
  }
}

// The log exporter of the release (R2-D253). Cordis 4.0.4 numbers the levels ERROR 0, INFO 1, WARN 2,
// DEBUG 3, and an exporter with no `levels` exports up to INFO, so `warn` reaches no sink on its own.
// `serve` registers this exporter on its root: every message up to WARN becomes one `log` record on
// stdout; DEBUG stays out. Rows keep their own rule of what a message may carry (no secret, no body).
import { Logger, type Context, type Exporter, type Message } from '@deepseek-ai/cordis'

/** The highest level the release exports: WARN. DEBUG (3) is not exported. */
export const RELEASE_LOG_LEVEL = 2

/** One `log` record of stdout. */
export type LogRecord = Readonly<{
  kind: 'log'
  level: Message['type']
  name: string
  text: string
}>

/** Text of a message that does not format; the original arguments are not echoed. */
export const UNFORMATTABLE = '<the log message did not format>'

/** The exporter: one `log` record per message up to WARN. Neither formatting nor writing throws into the caller. */
export function releaseLogExporter(write: (record: LogRecord) => void): Exporter {
  const exporter: Exporter = {
    colors: false,
    levels: { default: RELEASE_LOG_LEVEL },
    export(message) {
      let text: string
      try {
        text = Logger.format(exporter, message)
      } catch {
        text = UNFORMATTABLE
      }
      try {
        write({ kind: 'log', level: message.type, name: message.name, text })
      } catch {
        // A log line that cannot be written is lost; the call that logged it goes on.
      }
    },
  }
  return exporter
}

/** Registers the release exporter on `root`; it goes away with the root fiber. */
export function exportReleaseLogs(root: Context, write: (record: LogRecord) => void): void {
  root.logger.exporter(releaseLogExporter(write))
}

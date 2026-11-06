import pino from 'pino'
import type { TelemetryOutlet } from './options.ts'
import type { TelemetryRecord } from './record.ts'

export type TransportResult = 'closed' | 'failed' | 'unconfirmed'

/** The runtime's handle on one outlet. No member throws. */
export type Outlet = Readonly<{
  /** Hands one record to the local sink. True when the sink returned without a failure. */
  write(record: TelemetryRecord): boolean
  /** Ends the transport and waits at most `waitMs` for the sink to confirm it. */
  close(waitMs: number): Promise<TransportResult>
  /** Ends the transport without waiting: the deadline has passed. */
  abandon(): void
}>

function writerOutlet(write: (record: TelemetryRecord) => void): Outlet {
  return Object.freeze({
    write(record: TelemetryRecord): boolean {
      try {
        write(record)
        return true
      } catch {
        return false
      }
    },
    // The application owns the stream behind its write function; the runtime only stops calling it.
    close: () => Promise.resolve<TransportResult>('closed'),
    abandon: () => undefined,
  })
}

function openFile(path: string): ReturnType<typeof pino.destination> {
  try {
    // Synchronous mode: every write is an fs.writeSync before it returns, and an open failure throws.
    return pino.destination({ dest: path, sync: true, minLength: 0, append: true })
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown'
    throw new Error(`telemetry file outlet: cannot open ${path} (${code})`, { cause: error })
  }
}

function fileOutlet(path: string): Outlet {
  const destination = openFile(path)
  let failed = false
  // In synchronous mode a failed write emits `error` before `write` returns.
  destination.on('error', () => {
    failed = true
  })

  function end(): void {
    try {
      destination.end()
    } catch {
      // The destination was already destroyed.
    }
  }

  return Object.freeze({
    write(record: TelemetryRecord): boolean {
      failed = false
      try {
        destination.write(`${JSON.stringify(record)}\n`)
      } catch {
        return false
      }
      return !failed
    },
    close(waitMs: number): Promise<TransportResult> {
      return new Promise<TransportResult>(resolve => {
        const timer = setTimeout(() => settle('unconfirmed'), waitMs)
        function settle(result: TransportResult): void {
          clearTimeout(timer)
          resolve(result)
        }
        destination.once('close', () => settle('closed'))
        destination.once('error', () => settle('failed'))
        end()
      })
    },
    abandon: end,
  })
}

/** Opens the outlet. Throws for a file that cannot be opened: telemetry does not degrade silently. */
export function openOutlet(outlet: TelemetryOutlet): Outlet {
  return outlet.kind === 'writer' ? writerOutlet(outlet.write) : fileOutlet(outlet.path)
}

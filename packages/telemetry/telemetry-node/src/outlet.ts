import pino from 'pino'
import type { TelemetryOutlet } from './options.ts'
import type { TelemetryRecord } from './record.ts'

export type TransportResult = 'closed' | 'failed' | 'unconfirmed'

export type Outlet = Readonly<{
  write(record: TelemetryRecord): boolean
  close(waitMs: number): Promise<TransportResult>
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
    } catch {}
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

export function openOutlet(outlet: TelemetryOutlet): Outlet {
  return outlet.kind === 'writer' ? writerOutlet(outlet.write) : fileOutlet(outlet.path)
}

import { redactLogUrls } from './log-url.ts'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(data: Record<string, unknown>, msg: string): void
  info(data: Record<string, unknown>, msg: string): void
  warn(data: Record<string, unknown>, msg: string): void
  error(data: Record<string, unknown>, msg: string): void
}

const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']

export type LineStream = Readonly<{
  write(line: string | Uint8Array): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
}>

/** Drops every later line once the stream fails: a reader that went away must not loop the logger. */
export function streamSink(stream: LineStream): (line: string | Uint8Array) => void {
  let failed = false
  stream.on('error', () => {
    failed = true
  })
  return line => {
    if (failed) return
    try {
      stream.write(line)
    } catch {
      failed = true
    }
  }
}

// One error listener per process stream, shared by every logger and every utility instance.
let stdoutSink: ReturnType<typeof streamSink> | undefined
let stderrSink: ReturnType<typeof streamSink> | undefined

export const writeStdout = (chunk: string | Uint8Array): void =>
  (stdoutSink ??= streamSink(process.stdout))(chunk)

export const writeStderr = (chunk: string | Uint8Array): void =>
  (stderrSink ??= streamSink(process.stderr))(chunk)

export function createLogger(
  minimum: LogLevel = 'info',
  output: (line: string) => void = writeStdout,
): Logger {
  const threshold = levels.indexOf(minimum)
  const write = (level: LogLevel, data: Record<string, unknown>, msg: string) => {
    if (levels.indexOf(level) < threshold) return
    const line = JSON.stringify({
      level,
      time: /* wall-clock: observation-time -- the time a log line was written */ new Date().toISOString(),
      process: 'main',
      ...serializable(data),
      msg,
    })
    output(line + '\n')
  }
  return {
    debug: (data, msg) => write('debug', data, msg),
    info: (data, msg) => write('info', data, msg),
    warn: (data, msg) => write('warn', data, msg),
    error: (data, msg) => write('error', data, msg),
  }
}

function serializable(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    out[key] =
      value instanceof Error
        ? {
            name: value.name,
            message: redactLogUrls(value.message),
            stack: value.stack && redactLogUrls(value.stack),
          }
        : value
  }
  return out
}

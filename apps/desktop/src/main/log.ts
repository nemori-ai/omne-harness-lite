import { redactLogUrls } from './log-url.ts'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(data: Record<string, unknown>, msg: string): void
  info(data: Record<string, unknown>, msg: string): void
  warn(data: Record<string, unknown>, msg: string): void
  error(data: Record<string, unknown>, msg: string): void
}

const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']

export function createLogger(minimum: LogLevel = 'info'): Logger {
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
    process.stdout.write(line + '\n')
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

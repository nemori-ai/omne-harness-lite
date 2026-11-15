import type { DriverStop } from '@omne-harness/tool'
import type { ToolCallId } from '@omne-harness/tool-contract'

export type RunStopLog = Readonly<{
  stopped(key: string, call: ToolCallId, stop: DriverStop): void
  forget(key: string): void
}>

export function troubleOf(stop: DriverStop): string | null {
  if (stop.kind === 'blocked') return `blocked: ${stop.diagnostic}`
  if (stop.kind !== 'failed') return null
  const { kind, ...fields } = stop.failure
  const details = Object.entries(fields).map(([name, value]) => `${name}=${JSON.stringify(value)}`)
  return `failed: ${[kind, ...details].join(' ')}`
}

export function createRunStopLog(
  log: Readonly<{ warn(message: string): void; info(message: string): void }>,
): RunStopLog {
  const troubles = new Map<string, string>()
  return Object.freeze({
    stopped(key, call, stop) {
      const before = troubles.get(key) ?? null
      const now = troubleOf(stop)
      if (now === before) return
      if (now === null) {
        troubles.delete(key)
        log.info(`Tool call ${call} goes on; it had stopped on ${before}`)
        return
      }
      troubles.set(key, now)
      log.warn(`Tool call ${call} stopped on ${now}; the driver runs it again when it can`)
    },
    forget(key) {
      troubles.delete(key)
    },
  })
}

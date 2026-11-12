// 调用的一次运行停在失败或阻塞上时写日志。驱动按重试间隔反复推进卡住的调用，所以同一调用只在停止原因
// 变化时写一条 warn，原因消失、调用接着前进时写一条 info。日志只带调用身份与失败的字段，不带租户。
import type { DriverStop } from '@omne-harness/tool'
import type { ToolCallId } from '@omne-harness/tool-contract'

export type RunStopLog = Readonly<{
  /** Notes where a run of `call` stopped. */
  stopped(key: string, call: ToolCallId, stop: DriverStop): void
  /** Forgets a call that retired. */
  forget(key: string): void
}>

/** What a stop says when it is trouble: the failure or the block reason; `null` otherwise. */
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

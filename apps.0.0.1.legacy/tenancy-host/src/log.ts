// 日志汇（design「入口层与运维面的装配」日志汇一条；D-026 本地日志 JSONL）：Cordis `ctx.logger` 的全部记录
// 以每条一行 JSON 写到一个汇（缺省进程标准错误流），落文件、轮转与保留归运维的进程管理器。
// 本节点自己的记录（启动里程碑、启动失败、撤除）是结构化对象，原样展开成字段；其余插件的记录按 Cordis 的格式化规则成一行消息。
// 时间戳由 Cordis 在写日志时取（本节点不自己读墙钟）。秘密不进输出由各写入方负责——本节点只写变量名与插件名。
import { type Context, type Exporter, Logger, type Message } from '@deepseek-ai/cordis'

/** 一行一条的写出目标。 */
export interface LogSink {
  write(line: string): void
}

export const stderrSink: LogSink = { write: line => void process.stderr.write(line) }

/**
 * exporter 的阈值：Cordis 的级别序是 ERROR 0 < INFO 1 < WARN 2 < DEBUG 3，缺省只导出到 INFO——warn 默认看不见
 * （basis `logger-level-order-error-lowest`）。本节点导出到 WARN；debug 不导出。
 */
export const EXPORT_LEVEL_WARN = 2

/** 本节点自己那个 logger 的名字。 */
export const HOST_LOGGER = 'tenancy-host'

/** 本节点的一条结构化记录：`event` 必有，其余字段按事件而定，值只含名字、阶段、计数与标识。 */
export interface HostRecord {
  readonly event: string
  readonly [field: string]: unknown
}

/** 一行 JSONL 的形状。 */
export interface LogLine {
  readonly ts: number
  readonly level: Message['type']
  readonly name: string
  readonly message?: string
  readonly [field: string]: unknown
}

function isHostRecord(value: unknown): value is HostRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype &&
    typeof (value as { event?: unknown }).event === 'string'
  )
}

function lineOf(exporter: Exporter, message: Message): LogLine {
  const [first] = message.args
  if (message.name === HOST_LOGGER && message.args.length === 1 && isHostRecord(first)) {
    return { ts: message.ts, level: message.type, name: message.name, ...first }
  }
  return {
    ts: message.ts,
    level: message.type,
    name: message.name,
    message: Logger.format(exporter, message),
  }
}

/** 在根 Context 上登记 JSONL exporter（随根 fiber 存续），返回本节点自己的 logger。 */
export function attachLog(context: Context, sink: LogSink): Logger {
  const exporter: Exporter = {
    colors: false,
    levels: { default: EXPORT_LEVEL_WARN },
    export(message) {
      // exporter 在写日志的那一方的调用栈里跑：这里抛出会让写日志的代码失败，所以格式化不了只降级、不抛
      let line: string
      try {
        line = JSON.stringify(lineOf(exporter, message))
      } catch {
        line = JSON.stringify({
          ts: message.ts,
          level: message.type,
          name: message.name,
          message: '(log message could not be formatted)',
        })
      }
      sink.write(`${line}\n`)
    },
  }
  context.logger.exporter(exporter)
  return context.logger(HOST_LOGGER)
}

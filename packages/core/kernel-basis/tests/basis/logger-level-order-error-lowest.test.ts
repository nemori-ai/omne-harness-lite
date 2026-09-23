// basis `logger-level-order-error-lowest`（W1-B 2026-09-23 核实）：Cordis logger 的级别序是
// ERROR 0 < INFO 1 < WARN 2 < DEBUG 3；exporter 没给阈值时默认只导出到 INFO——warn 与 debug 默认看不见。
// 装配要看到 warn 级诊断，必须给 exporter 配 `levels`（或 logger 的 `level`）。
// `LoggerLevel` 是 `const enum`，运行期不存在，所以这里用数值；数值本身就是被核实的事实。
import { Context, type Message } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

function collect(ctx: Context, levels?: Record<string, number>) {
  const messages: Message[] = []
  ctx.logger.exporter({ levels, export: message => void messages.push(message) })
  return messages
}

describe('logger-level-order-error-lowest', () => {
  it('消息上的 level 数值：error 0、info 1、warn 2、debug 3', () => {
    const ctx = new Context()
    const messages = collect(ctx, { default: 3 })
    const logger = ctx.logger('probe')
    logger.error('e')
    logger.info('i')
    logger.warn('w')
    logger.debug('d')
    expect(messages.map(m => [m.type, m.level])).toEqual([
      ['error', 0],
      ['info', 1],
      ['warn', 2],
      ['debug', 3],
    ])
  })

  it('exporter 无阈值 ⇒ 只到 INFO：warn 与 debug 被丢', () => {
    const ctx = new Context()
    const messages = collect(ctx)
    const logger = ctx.logger('probe')
    logger.error('e')
    logger.info('i')
    logger.warn('w')
    logger.debug('d')
    expect(messages.map(m => m.type)).toEqual(['error', 'info'])
  })

  it('exporter 给 levels.default = 2 ⇒ warn 可见，debug 仍不可见', () => {
    const ctx = new Context()
    const messages = collect(ctx, { default: 2 })
    const logger = ctx.logger('probe')
    logger.warn('w')
    logger.debug('d')
    expect(messages.map(m => m.type)).toEqual(['warn'])
  })
})

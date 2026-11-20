import { Context, type Message } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

function collect(ctx: Context, levels?: Record<string, number>) {
  const messages: Message[] = []
  ctx.logger.exporter({
    ...(levels ? { levels } : {}),
    export: message => void messages.push(message),
  })
  return messages
}

describe('logger-level-order-error-lowest', () => {
  it('消息上的 level 数值：error 0、warn 1、info 2、debug 3', () => {
    const ctx = new Context()
    const messages = collect(ctx, { default: 3 })
    const logger = ctx.logger('probe')
    logger.error('e')
    logger.info('i')
    logger.warn('w')
    logger.debug('d')
    expect(messages.map(m => [m.type, m.level])).toEqual([
      ['error', 0],
      ['info', 2],
      ['warn', 1],
      ['debug', 3],
    ])
  })

  it('exporter 无阈值 ⇒ 到 INFO：error、warn、info 可见，debug 被丢', () => {
    const ctx = new Context()
    const messages = collect(ctx)
    const logger = ctx.logger('probe')
    logger.error('e')
    logger.info('i')
    logger.warn('w')
    logger.debug('d')
    expect(messages.map(m => m.type)).toEqual(['error', 'info', 'warn'])
  })

  it('exporter 给 levels.default = 1 ⇒ 只到 WARN：info 与 debug 被丢', () => {
    const ctx = new Context()
    const messages = collect(ctx, { default: 1 })
    const logger = ctx.logger('probe')
    logger.error('e')
    logger.info('i')
    logger.warn('w')
    logger.debug('d')
    expect(messages.map(m => m.type)).toEqual(['error', 'warn'])
  })

  it('exporter 给 levels.default = 2 ⇒ 与无阈值相同', () => {
    const ctx = new Context()
    const messages = collect(ctx, { default: 2 })
    const logger = ctx.logger('probe')
    logger.info('i')
    logger.warn('w')
    logger.debug('d')
    expect(messages.map(m => m.type)).toEqual(['info', 'warn'])
  })
})

// basis `service-subclass-provides-its-key`：抽象 Service 子类作为插件加载 ⇒ 在 super(ctx, key) 给出的键上 provide；
// 消费者按键取到的是那个子类的实例（因而也是抽象定义的实例）；所属 fiber 撤除 ⇒ 键上没有服务。
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './support.ts'

abstract class GreeterDefinition extends Service {
  constructor(ctx: Context) {
    super(ctx, 'probeGreeter')
  }
  abstract greet(name: string): string
}

class PoliteGreeter extends GreeterDefinition {
  greet(name: string): string {
    return `hello, ${name}`
  }
}

describe('service-subclass-provides-its-key', () => {
  it('加载子类 ⇒ 键上可取到定义的实例；撤除 ⇒ 键上为空', async () => {
    const ctx = new Context()
    const provider = await ctx.plugin(PoliteGreeter)
    const found = ctx.get('probeGreeter') as GreeterDefinition | undefined
    expect(found).toBeInstanceOf(GreeterDefinition)
    expect(found?.greet('omne')).toBe('hello, omne')

    await provider.dispose()
    expect(ctx.get('probeGreeter')).toBeUndefined()
  })

  it('消费者 inject 这个键 ⇒ 提供者加载后才启动', async () => {
    const ctx = new Context()
    let started = 0
    await ctx.plugin(plugin('consumer', () => void started++, ['probeGreeter']))
    expect(started).toBe(0)
    await ctx.plugin(PoliteGreeter)
    expect(started).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { sleep } from '../src/index.ts'
import { simulatedTime } from '../src/simulated.ts'

describe('scaled pace', () => {
  it('follows the host clock times the speed, and never fires a wait before its position', async () => {
    const time = simulatedTime()
    time.run({ speed: 1_000 })
    const order: string[] = []
    const reached: number[] = []
    const mark = (name: string, position: number) => async (): Promise<void> => {
      await sleep(time.source, position)
      order.push(name)
      reached.push(time.source.elapsed() - position)
    }
    await Promise.all([mark('later', 20_000)(), mark('sooner', 5_000)()])
    expect(order).toEqual(['sooner', 'later'])
    expect(reached.every(late => late >= 0)).toBe(true)
  })

  it('stops following when the pace goes back to manual', async () => {
    const time = simulatedTime()
    time.run({ speed: 1_000 })
    await sleep(time.source, 1_000)
    time.run('manual')
    const stopped = time.source.elapsed()
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(time.source.elapsed()).toBe(stopped)
  })

  it('refuses a speed that is not a positive finite number', () => {
    const time = simulatedTime()
    for (const speed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => time.run({ speed })).toThrow(TypeError)
  })
})

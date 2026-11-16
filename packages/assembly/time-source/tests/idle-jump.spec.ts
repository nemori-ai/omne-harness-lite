import { describe, expect, it } from 'vitest'
import { sleep } from '../src/index.ts'
import { simulatedTime } from '../src/simulated.ts'

const hostTurns = async (turns: number): Promise<void> => {
  for (let turn = 0; turn < turns; turn += 1) await new Promise(resolve => setImmediate(resolve))
}

const DAY = 86_400_000

describe('idle jump (TS-5)', () => {
  it('runs a chain of sleeps to the end with no driver step, in deadline order', async () => {
    const time = simulatedTime()
    time.run('idle-jump')
    const order: string[] = []
    const one = async (): Promise<void> => {
      await sleep(time.source, 30 * DAY)
      order.push('thirty days')
    }
    const two = async (): Promise<void> => {
      await sleep(time.source, 10_000)
      order.push('ten seconds')
      await sleep(time.source, DAY)
      order.push('a day later')
    }
    await Promise.all([one(), two()])
    expect(order).toEqual(['ten seconds', 'a day later', 'thirty days'])
    expect(time.source.elapsed()).toBe(30 * DAY)
  })

  it('does not move while work is held, and jumps once the last hold is released', async () => {
    const time = simulatedTime()
    time.run('idle-jump')
    const first = time.hold()
    const second = time.hold()
    const slept = sleep(time.source, 1_000)
    first()
    first()
    await hostTurns(5)
    expect([time.source.elapsed(), time.pending()]).toEqual([0, 1])
    second()
    expect(await slept).toBe('elapsed')
    expect(time.source.elapsed()).toBe(1_000)
  })

  it('work that starts in a callback holds the clock until it is done', async () => {
    const time = simulatedTime()
    time.run('idle-jump')
    const seen: number[] = []
    const work = async (): Promise<void> => {
      await sleep(time.source, 100)
      const release = time.hold()
      void sleep(time.source, 50).then(() => seen.push(-1))
      await hostTurns(5)
      seen.push(time.source.elapsed())
      release()
    }
    await work()
    await sleep(time.source, 1_000)
    expect(seen).toEqual([100, -1])
  })

  it('asks the host for one turn however many waits are pending, and for none when nothing waits', async () => {
    const turnsAsked = (): number =>
      process.getActiveResourcesInfo().filter(kind => kind === 'Immediate').length
    const before = turnsAsked()
    const time = simulatedTime()
    time.run('idle-jump')
    expect(turnsAsked()).toBe(before)
    const fired: number[] = []
    for (const delay of [3, 1, 2]) time.source.after(delay, () => fired.push(delay))
    expect(turnsAsked()).toBe(before + 1)
    await hostTurns(4)
    expect([fired, turnsAsked()]).toEqual([[1, 2, 3], before])
  })

  it('does not jump on a turn it asked for before the pace went back to manual', async () => {
    const time = simulatedTime()
    time.run('idle-jump')
    time.source.after(500, () => undefined)
    time.run('manual')
    await hostTurns(3)
    expect([time.source.elapsed(), time.pending()]).toEqual([0, 1])
  })

  it('stops jumping when the pace goes back to manual', async () => {
    const time = simulatedTime()
    time.run('idle-jump')
    const release = time.hold()
    time.source.after(500, () => undefined)
    time.run('manual')
    release()
    await hostTurns(5)
    expect([time.source.elapsed(), time.pending()]).toEqual([0, 1])
    time.advance(500)
    expect(time.pending()).toBe(0)
  })
})

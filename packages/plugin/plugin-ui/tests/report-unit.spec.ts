import { describe, expect, it } from 'vitest'
import { createReporter, reportsOf, type Reported } from '../src/report.ts'

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
const tree = { points: [], parts: [] }
const of = (...names: string[]): Reported => ({
  ...tree,
  plugins: names.map(name => ({ name, version: 'v1', state: 'loaded', reason: null })),
})

describe('how the plugins stand, as it is told', () => {
  it('is each plugin that has an outcome, by name: one that is still being loaded is left out', () => {
    expect(
      reportsOf(
        new Map([
          ['zebra', { kind: 'loaded', version: 'v1' }],
          ['mole', { kind: 'held', version: 'v4' }],
          ['aunt', { kind: 'failed', version: 'v2', reason: 'it broke' }],
          ['still', { kind: 'loading', version: 'v3', next: 'keep' }],
        ]),
        [],
      ),
    ).toEqual([
      { name: 'aunt', version: 'v2', state: 'failed', reason: 'it broke' },
      { name: 'mole', version: 'v4', state: 'held', reason: null },
      { name: 'zebra', version: 'v1', state: 'loaded', reason: null },
    ])
  })

  it('says of a loaded plugin where it does not count and with whom, naming every other one', () => {
    const conflicts = [
      {
        point: 'shell.tokens',
        key: 'shell.app',
        by: ['plugin:a@v1', 'plugin:b@v1', 'plugin:c@v1'],
      },
    ]
    const told = reportsOf(
      new Map([
        ['a', { kind: 'loaded', version: 'v1' }],
        ['d', { kind: 'loaded', version: 'v1' }],
      ]),
      conflicts,
    )
    expect(told.map(each => each.reason)).toEqual([
      'shell.tokens shell.app is put as well by plugin:b@v1, plugin:c@v1: neither counts',
      null,
    ])
  })
})

describe('the telling', () => {
  function world() {
    let now = of()
    const sent: Reported[] = []
    const waiting: ((took: boolean) => void)[] = []
    const reporter = createReporter(
      () => now,
      reported =>
        new Promise(resolve => {
          sent.push(reported)
          waiting.push(resolve)
        }),
    )
    const answer = async (took: boolean | 'broke'): Promise<void> => {
      const resolve = waiting.shift()
      if (took === 'broke') resolve?.(Promise.reject(new Error('broke')) as never)
      else resolve?.(took)
      await tick()
    }
    return {
      reporter,
      sent,
      waiting,
      answer,
      set(next: Reported) {
        now = next
      },
    }
  }

  it('tells what there is when it is touched, and not again while that is what the server took', async () => {
    const t = world()
    t.reporter.touch()
    expect(t.sent).toEqual([of()])
    await t.answer(true)
    t.reporter.touch()
    expect(t.sent).toHaveLength(1)
    t.set(of('a'))
    t.reporter.touch()
    expect(t.sent).toEqual([of(), of('a')])
  })

  it.each([false, 'broke'] as const)(
    'tells the same again at the next touch when the server did not take it (%s), and not before',
    async took => {
      const t = world()
      t.reporter.touch()
      await t.answer(took)
      expect(t.sent).toHaveLength(1)
      t.reporter.touch()
      expect(t.sent).toEqual([of(), of()])
    },
  )

  it('tells one at a time: what changed while a telling was on its way is told right after that one was taken', async () => {
    const t = world()
    t.reporter.touch()
    t.set(of('a'))
    t.reporter.touch()
    t.set(of('a', 'b'))
    t.reporter.touch()
    expect(t.sent).toHaveLength(1)
    expect(t.waiting).toHaveLength(1)
    await t.answer(true)
    expect(t.sent).toEqual([of(), of('a', 'b')])
    await t.answer(true)
    expect(t.sent).toHaveLength(2)
  })

  it('tells nothing once it is stopped, not even what waited behind a telling on its way', async () => {
    const t = world()
    t.reporter.touch()
    t.set(of('a'))
    t.reporter.stop()
    await t.answer(true)
    t.reporter.touch()
    expect(t.sent).toHaveLength(1)
  })
})

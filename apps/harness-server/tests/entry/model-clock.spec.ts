// `modelClock`（AA 运行时对象表「时钟」、model-contract `ModelClock`）：`model-host` 行静态 inject 的入口对象，
// 在根上 provide。`now()` 同步给出可解析的 UTC 时刻；`waitUntil` 到点答 `elapsed`、中止答 `cancelled`，
// 不能接受的时刻文本抛出而不是永远等。
import { describe, expect, it } from 'vitest'
import { ModelClockService, modelClockKey } from '@omne-harness/model-cordis-contract/cordis'
import { parseInstant } from '@omne-harness/utc-instant'
import { modelClock } from '../../src/entry/model-clock.ts'
import { fixtureEnv, got } from './support.ts'

const soon = (ms: number): string =>
  new Date(
    /* wall-clock: operation-timing -- the test picks a target a little ahead of now. */ Date.now() +
      ms,
  ).toISOString()

async function installedClock() {
  const fixture = fixtureEnv([])
  await fixture.install(modelClock)
  return { fixture, clock: got(fixture.root.get(modelClockKey), 'modelClock') }
}

describe('modelClock (ModelClock shape)', () => {
  it('is the model-cordis-contract definition on the root and reads a parseable UTC instant', async () => {
    const { clock } = await installedClock()
    expect(clock).toBeInstanceOf(ModelClockService)
    expect(modelClock).toMatchObject({ name: 'modelClock', implementation: 'real' })
    const first = clock.now()
    expect(parseInstant(first).ok).toBe(true)
    const second = clock.now()
    expect(second >= first).toBe(true)
  })

  it('a consuming plugin that injects modelClock runs and reads a working clock of the definition', async () => {
    const { fixture } = await installedClock()
    const seen: ModelClockService[] = []
    await fixture.root.plugin({
      name: 'probe-model-clock',
      inject: [modelClockKey],
      apply(ctx) {
        seen.push(ctx.modelClock)
      },
    })
    // Cordis 按调用方上下文代理服务，所以不比引用；比定义与行为。
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBeInstanceOf(ModelClockService)
    expect(parseInstant(seen[0]?.now() ?? '').ok).toBe(true)
  })

  it('waits until a near instant elapses, answers elapsed at once for the past, and cancelled on abort', async () => {
    const { clock } = await installedClock()
    await expect(clock.waitUntil(soon(-1000), new AbortController().signal)).resolves.toBe(
      'elapsed',
    )
    await expect(clock.waitUntil(soon(20), new AbortController().signal)).resolves.toBe('elapsed')
    const controller = new AbortController()
    const pending = clock.waitUntil(soon(60_000), controller.signal)
    controller.abort()
    await expect(pending).resolves.toBe('cancelled')
    const aborted = new AbortController()
    aborted.abort()
    await expect(clock.waitUntil(soon(-1), aborted.signal)).resolves.toBe('cancelled')
  })

  it('refuses an instant text that utc-instant does not accept instead of waiting for ever', async () => {
    const { clock } = await installedClock()
    await expect(clock.waitUntil('yesterday', new AbortController().signal)).rejects.toThrow(
      TypeError,
    )
    await expect(
      clock.waitUntil('2026-01-01T00:00:00+08:00', new AbortController().signal),
    ).rejects.toThrow(TypeError)
  })
})

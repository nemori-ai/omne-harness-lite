import { Context } from '@deepseek-ai/cordis'
import { TelemetryService, telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'
import { createDisabledTelemetryPlugin, createTelemetryNodePlugin } from '../src/cordis.ts'
import { createDisabledTelemetry, type TelemetryRuntime } from '../src/index.ts'
import { harness, loginFailed, nextTurn, systemBinding } from './support.ts'

const FIELDS = { code: 'identity.fault', retried: false, attempts: 1, request: 'req-1' } as const

/** Loads a consumer that injects `telemetry` and emits one event through it. */
async function emitThroughService(ctx: Context): Promise<unknown[]> {
  const answers: unknown[] = []
  await ctx.plugin({
    inject: [telemetryKey],
    apply(c) {
      answers.push(c.telemetry.bind(systemBinding()).event(loginFailed, FIELDS))
    },
  })
  return answers
}

describe('createTelemetryNodePlugin', () => {
  it('provides the telemetry service over the runtime port', async () => {
    const { runtime, written } = harness()
    const ctx = new Context()
    await ctx.plugin(createTelemetryNodePlugin({ runtime }))

    expect(ctx.get(telemetryKey)).toBeInstanceOf(TelemetryService)
    expect(await emitThroughService(ctx)).toEqual([{ kind: 'admitted' }])
    await nextTurn()
    expect(written).toHaveLength(1)
  })

  it('closes the runtime as a fallback when the plugin is disposed without an explicit close', async () => {
    const { runtime } = harness()
    const ctx = new Context()
    const fiber = await ctx.plugin(createTelemetryNodePlugin({ runtime }))

    await fiber.dispose()

    expect(ctx.get(telemetryKey)).toBeUndefined()
    expect(runtime.port.bind(systemBinding()).event(loginFailed, FIELDS)).toEqual({
      kind: 'dropped',
      reason: 'closed',
    })
  })

  it('does nothing in the fallback when the application closed first', async () => {
    const { runtime, written } = harness()
    const ctx = new Context()
    const fiber = await ctx.plugin(createTelemetryNodePlugin({ runtime }))
    await emitThroughService(ctx)
    const explicit = runtime.close(1000)
    const report = await explicit

    await fiber.dispose()

    expect(runtime.close(0)).toBe(explicit)
    expect(await runtime.close(0)).toBe(report)
    expect(report.flush).toBe('completed-to-boundary')
    expect(written).toHaveLength(1)
  })

  it('creates no resource of its own: the runtime stays the application object', async () => {
    const closes: number[] = []
    const { runtime } = harness()
    const counted: TelemetryRuntime = {
      port: runtime.port,
      ingestLog: runtime.ingestLog,
      close: deadline => {
        closes.push(deadline)
        return runtime.close(deadline)
      },
    }
    const ctx = new Context()
    await ctx.plugin(createTelemetryNodePlugin({ runtime: counted }))

    expect(closes).toEqual([])
  })
})

describe('createDisabledTelemetryPlugin', () => {
  it('provides the telemetry service that answers dropped(disabled)', async () => {
    const disabled = createDisabledTelemetry()
    const ctx = new Context()
    await ctx.plugin(createDisabledTelemetryPlugin({ runtime: disabled }))

    expect(ctx.get(telemetryKey)).toBeInstanceOf(TelemetryService)
    expect(await emitThroughService(ctx)).toEqual([{ kind: 'dropped', reason: 'disabled' }])
    expect((await disabled.close(0)).droppedBy).toEqual({ disabled: 1 })
  })

  it('names the disabled implementation in the plugin class', () => {
    expect(createDisabledTelemetryPlugin({ runtime: createDisabledTelemetry() }).name).toBe(
      'DisabledTelemetryPlugin',
    )
    expect(createTelemetryNodePlugin({ runtime: createDisabledTelemetry() }).name).toBe(
      'TelemetryNodePlugin',
    )
  })
})

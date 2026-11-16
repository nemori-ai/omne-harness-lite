import { randomBytes } from 'node:crypto'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import {
  createDisabledTelemetry,
  createTelemetryRuntime,
  type TelemetryClock,
  type TelemetryOutlet,
  type TelemetryRecord,
  type TelemetryRuntime,
} from '@omne-harness/telemetry-node'
import {
  createCordisLogBridge,
  createDisabledTelemetryPlugin,
  createTelemetryNodePlugin,
  type CordisLogBridge,
} from '@omne-harness/telemetry-node/cordis'
import { ConfigError } from '../../config-schema.ts'
import { defineRow } from '../../row.ts'
import type { TelemetryShutdownReport, TreeRow } from '../../types.ts'
import {
  telemetryRowConfig,
  type NodeTelemetryRowConfig,
  type TelemetryRowConfig,
} from './config.ts'
import { processInstance } from './instance.ts'

export { processInstance } from './instance.ts'

export const TELEMETRY_BOOTSTRAP_RECORDS = 256
export const TELEMETRY_BOOTSTRAP_TEXT_CHARS = 4096

export const TELEMETRY_GENERATION = '1'

export const telemetryFactoryBindings: Readonly<Record<string, string>> = {
  telemetry: 'telemetry',
}

export type TelemetryBindingOptions = Readonly<{
  write: (record: TelemetryRecord) => void
  stderr: (line: string) => void
  summary?: (line: string) => void
}>

export type TelemetryBinding = Readonly<{
  plugin: Plugin.Object
  parseConfig(value: unknown): TelemetryRowConfig
  describe(row: TreeRow): Readonly<Record<string, unknown>>
  /** Register `bridge.exporter` on the root logger before any row loads. */
  bridge: CordisLogBridge
  close(deadlineMs: number): Promise<TelemetryShutdownReport>
}>

const clock: TelemetryClock = {
  now: () =>
    /* wall-clock: clock-source -- the time of a telemetry record; engineering telemetry is not domain time. */ new Date(),
  monotonicMs: () =>
    /* wall-clock: operation-timing -- durations, deadlines and the summary interval of the telemetry runtime. */ performance.now(),
}

function outletOf(
  config: NodeTelemetryRowConfig,
  options: TelemetryBindingOptions,
): TelemetryOutlet {
  const { outlet } = config
  switch (outlet.kind) {
    case 'stdout':
      return { kind: 'writer', write: options.write }
    case 'stderr':
      return { kind: 'writer', write: record => options.stderr(JSON.stringify(record)) }
    case 'file':
      return { kind: 'file', path: outlet.path }
  }
}

function openRuntime(
  config: TelemetryRowConfig,
  options: TelemetryBindingOptions,
): TelemetryRuntime {
  if (config.implementation === 'disabled') return createDisabledTelemetry()
  return createTelemetryRuntime({
    generation: TELEMETRY_GENERATION,
    instance: processInstance,
    clock,
    randomBytes: size => new Uint8Array(randomBytes(size)),
    outlet: outletOf(config, options),
    budgets: config.budgets,
    summary: options.summary ?? options.stderr,
  })
}

export function createTelemetryBinding(options: TelemetryBindingOptions): TelemetryBinding {
  const bridge = createCordisLogBridge({
    bootstrapCapacity: TELEMETRY_BOOTSTRAP_RECORDS,
    write: options.write,
    clock,
    maxTextLength: TELEMETRY_BOOTSTRAP_TEXT_CHARS,
  })
  let configured: TelemetryRowConfig | undefined
  let runtime: TelemetryRuntime | undefined

  function parseConfig(value: unknown): TelemetryRowConfig {
    const parsed = telemetryRowConfig.safeParse(value)
    if (!parsed.success) throw new ConfigError('invalid-config', 'invalid telemetry configuration')
    configured = parsed.data
    return parsed.data
  }

  const plugin = defineRow({
    row: 'telemetry',
    implementation: 'real',
    lifecycle: { kind: 'none' },
    manifest: { provides: [telemetryKey], injects: [], sameProviderGroup: null },
    plugin: {
      name: 'telemetry',
      apply(ctx: Context, value: unknown) {
        const config = telemetryRowConfig.parse(value)
        const opened = openRuntime(config, options)
        const Provider =
          config.implementation === 'disabled'
            ? createDisabledTelemetryPlugin({ runtime: opened })
            : createTelemetryNodePlugin({ runtime: opened })
        new Provider(ctx)
        runtime = opened
        if (config.implementation === 'node')
          bridge.attach(opened, { replayBootstrap: config.outlet.kind !== 'stdout' })
        else bridge.direct()
      },
    },
  })

  return Object.freeze({
    plugin,
    parseConfig,
    bridge,
    describe: row =>
      row.plugin !== 'telemetry' || configured === undefined
        ? {}
        : {
            telemetry: {
              implementation: configured.implementation,
              ...(configured.outlet === undefined ? {} : { outlet: configured.outlet.kind }),
            },
          },
    async close(deadlineMs) {
      bridge.detach()
      if (runtime === undefined) return { kind: 'not-registered', ...bridge.counts() }
      const report = await runtime.close(deadlineMs)
      return { kind: 'closed', ...report, ...bridge.counts() }
    },
  })
}

// The `telemetry` row: a factory row like `execution-host`. The configuration is parsed before
// loading, the runtime is created by this binding inside the row fiber, and the plugin is bound to
// this one run. The binding also owns the Cordis log bridge: it is registered on the root before
// any row loads, attached to the runtime when the row is active, and detached by the shutdown step.
// stdout keeps one writer: the `stdout` outlet is the record writer the entry hands in.
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
import { telemetryRowConfig, type TelemetryRowConfig } from './config.ts'
import { processInstance } from './instance.ts'

export { processInstance } from './instance.ts'

/**
 * Release constants of the log bridge. They exist before the row configuration is read, so they
 * are not configuration. Initial values, not measured: the order of magnitude of the messages that
 * the checks before loading and a failed row write.
 */
export const TELEMETRY_BOOTSTRAP_RECORDS = 256
export const TELEMETRY_BOOTSTRAP_TEXT_CHARS = 4096

/** Slice 1 has one output generation per process; generations change with slice 3. */
export const TELEMETRY_GENERATION = '1'

/** The factory export may only stand on this row id, and the operator cannot insert it. */
export const telemetryFactoryBindings: Readonly<Record<string, string>> = {
  telemetry: 'telemetry',
}

export type TelemetryBindingOptions = Readonly<{
  /** The one stdout record writer of the run (`bin.ts`). The `stdout` outlet and the bridge use it. */
  write: (record: TelemetryRecord) => void
  /** The stderr line writer of the run: the `stderr` outlet writes one JSON record per line through it. */
  stderr: (line: string) => void
  /** The rate-limited summary line for a person, with the application's prefix. Default: `stderr`, bare. */
  summary?: (line: string) => void
}>

export type TelemetryBinding = Readonly<{
  plugin: Plugin.Object
  /** Parses the row configuration at the boundary. Throws `ConfigError('invalid-config')`. */
  parseConfig(value: unknown): TelemetryRowConfig
  /** The extra members of the row's `tree` record: the implementation and the outlet kind. */
  describe(row: TreeRow): Readonly<Record<string, unknown>>
  /** Register `bridge.exporter` on the root logger before any row loads. */
  bridge: CordisLogBridge
  /** The shutdown step after the storage phase: detaches the bridge, then closes the runtime. */
  close(deadlineMs: number): Promise<TelemetryShutdownReport>
}>

const clock: TelemetryClock = {
  now: () =>
    /* wall-clock: clock-source -- the time of a telemetry record; engineering telemetry is not domain time. */ new Date(),
  monotonicMs: () =>
    /* wall-clock: operation-timing -- durations, deadlines and the summary interval of the telemetry runtime. */ performance.now(),
}

function outletOf(config: TelemetryRowConfig, options: TelemetryBindingOptions): TelemetryOutlet {
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

/** Creates the runtime of one run. A file outlet that cannot open throws, and the row fails. */
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

/** Binds the telemetry row once per run, before any row can load. */
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
        // Same value the boundary parsed; parsing again only narrows the type.
        const config = telemetryRowConfig.parse(value)
        const opened = openRuntime(config, options)
        const Provider =
          config.implementation === 'disabled'
            ? createDisabledTelemetryPlugin({ runtime: opened })
            : createTelemetryNodePlugin({ runtime: opened })
        // The Service constructor registers `telemetry` on this fiber (Cordis 4.0.4).
        new Provider(ctx)
        runtime = opened
        // The disabled implementation drops every log; Cordis messages keep the direct path, so a
        // deployment without telemetry still sees its WARN messages and the drops count only events.
        if (config.implementation === 'node')
          bridge.attach(opened, { replayBootstrap: config.outlet.kind !== 'stdout' })
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
              outlet: configured.outlet.kind,
            },
          },
    async close(deadlineMs) {
      // Detach before the runtime stops admitting: a message logged while the runtime closes, or
      // by a disposer after the coordinator gave up on this step at its deadline, takes the direct
      // path and counts as `afterClose` instead of vanishing as `dropped(closed)`.
      bridge.detach()
      if (runtime === undefined) return { kind: 'not-registered', ...bridge.counts() }
      const report = await runtime.close(deadlineMs)
      return { kind: 'closed', ...report, ...bridge.counts() }
    },
  })
}

import type { Context } from '@deepseek-ai/cordis'
import type {
  Binding,
  DiscardReason,
  Emitter,
  TelemetryDefinition,
  TelemetryPort,
} from '@omne-harness/telemetry-contract'
import { TelemetryService } from '@omne-harness/telemetry-cordis-contract/cordis'
import type { TelemetryRuntime } from './runtime.ts'

export {
  createCordisLogBridge,
  type CordisLogBridge,
  type CordisLogBridgeCounts,
} from './log-bridge.ts'

export type TelemetryPluginClass = {
  new (ctx: Context): TelemetryService
}

/**
 * The fallback of one plugin life: when the fiber ends, the runtime is closed with no time to
 * drain. When the application closed the runtime first, `close` returns the earlier report and
 * this does nothing. It does not replace the explicit close of the application.
 */
function closeWithFiber(ctx: Context, runtime: TelemetryRuntime): void {
  ctx.effect(() => () => runtime.close(0).then(() => undefined), 'telemetry fallback close')
}

/**
 * The plugin of the Node provider. It provides `runtime.port` as the `telemetry` service and
 * creates no resource of its own: the application creates, holds and closes the runtime.
 */
export function createTelemetryNodePlugin(
  input: Readonly<{ runtime: TelemetryRuntime }>,
): TelemetryPluginClass {
  const { runtime } = input
  return class TelemetryNodePlugin extends TelemetryService {
    constructor(ctx: Context) {
      super(ctx)
      closeWithFiber(ctx, runtime)
    }

    bind(binding: Binding): Emitter {
      return runtime.port.bind(binding)
    }

    discard(
      definition: TelemetryDefinition,
      reason: DiscardReason,
    ): ReturnType<TelemetryPort['discard']> {
      return runtime.port.discard(definition, reason)
    }
  }
}

/**
 * The plugin of the disabled implementation, over a runtime from `createDisabledTelemetry`. The
 * application holds that runtime, so `droppedBy.disabled` reaches its close report. The class
 * name says `disabled` in the plugin tree.
 */
export function createDisabledTelemetryPlugin(
  input: Readonly<{ runtime: TelemetryRuntime }>,
): TelemetryPluginClass {
  const { runtime } = input
  return class DisabledTelemetryPlugin extends TelemetryService {
    constructor(ctx: Context) {
      super(ctx)
      closeWithFiber(ctx, runtime)
    }

    bind(binding: Binding): Emitter {
      return runtime.port.bind(binding)
    }

    discard(
      definition: TelemetryDefinition,
      reason: DiscardReason,
    ): ReturnType<TelemetryPort['discard']> {
      return runtime.port.discard(definition, reason)
    }
  }
}

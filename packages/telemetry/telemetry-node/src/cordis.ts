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

function closeWithFiber(ctx: Context, runtime: TelemetryRuntime): void {
  ctx.effect(() => () => runtime.close(0).then(() => undefined), 'telemetry fallback close')
}

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

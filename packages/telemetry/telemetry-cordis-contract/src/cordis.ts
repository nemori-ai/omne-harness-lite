import { Service, type Context as CordisContext } from '@deepseek-ai/cordis'
import type { Binding, Emitter, TelemetryPort } from '@omne-harness/telemetry-contract'

/**
 * The one Cordis service of telemetry. A provider extends it and implements `bind`; it does not
 * write the key again. Consumers inject `telemetryKey`. The service does not authorize anything:
 * the scope in a binding says whom a record belongs to, not what the caller may do.
 * @owner packages/telemetry/telemetry-cordis-contract
 */
export abstract class TelemetryService extends Service implements TelemetryPort {
  static readonly provide = 'telemetry'

  constructor(ctx: CordisContext) {
    super(ctx, TelemetryService.provide)
  }

  abstract bind(binding: Binding): Emitter
}
export const telemetryKey = TelemetryService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    telemetry: TelemetryService
  }
}

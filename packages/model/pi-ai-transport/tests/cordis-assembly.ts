import type { ImagePreparePolicy } from '../src/image-preparation/types.ts'
import type { Context } from '@deepseek-ai/cordis'
import {
  ModelTransportSupportService, ModelInputMetersService, MODEL_INPUT_METERS, MODEL_TRANSPORT_SUPPORT,
} from '@omne-harness-lite/model-request-runtime/cordis'
import type {
  InputMeter, ModelDefinition, RetirementPolicy, ModelTransportSupport, TransportPolicy,
  LoadedImageCodec,
} from '@omne-harness-lite/model-request-runtime'
import { modelContribution, piAiTransportPlugin } from '../src/cordis.ts'

export class Support extends ModelTransportSupportService {
  readonly retirementSchedule: ModelTransportSupport['retirementSchedule']
  readonly imageCodec: LoadedImageCodec | null
  readonly onDiagnostic: Exclude<ModelTransportSupport['onDiagnostic'], undefined>
  readonly registryDiagnostics: Exclude<ModelTransportSupport['registryDiagnostics'], undefined>
  constructor(ctx: Context, value: ModelTransportSupport) {
    super(ctx)
    this.retirementSchedule = value.retirementSchedule
    this.imageCodec = value.imageCodec ?? null
    this.onDiagnostic = value.onDiagnostic ?? (() => {})
    this.registryDiagnostics = value.registryDiagnostics ?? { record: () => ({ dropped: 'closed' }) }
  }
}
class Meters extends ModelInputMetersService {
  constructor(ctx: Context, private readonly meter: InputMeter) { super(ctx) }
  select() { return this.meter }
}

/** Tests own their live ports in the root fiber; the actual provider receives only data. */
export function loadModelContribution(ctx: Context, definition: ModelDefinition, meter: InputMeter, retirement: RetirementPolicy) {
  const scoped = ctx.isolate(MODEL_TRANSPORT_SUPPORT).isolate(MODEL_INPUT_METERS)
  new Support(scoped, { retirementSchedule: retirement.schedule })
  new Meters(scoped, meter)
  return scoped.plugin(modelContribution, {
    definition,
    meter: { modelId: meter.modelId, definitionRevision: meter.definitionRevision, implementation: meter.implementation, provider: meter.provider },
    retirement: { waitMilliseconds: retirement.waitMilliseconds, force: retirement.force },
  })
}
export interface TransportFixture {
  readonly policy: TransportPolicy
  readonly retirement: RetirementPolicy
  readonly imagePreparation?: { readonly policy: ImagePreparePolicy; readonly codec: LoadedImageCodec | null }
  readonly onDiagnostic?: ModelTransportSupport['onDiagnostic']
  readonly registryDiagnostics?: ModelTransportSupport['registryDiagnostics']
}
export function loadTransport(ctx: Context, input: TransportFixture) {
  const scoped = ctx.isolate(MODEL_TRANSPORT_SUPPORT)
  new Support(scoped, {
    retirementSchedule: input.retirement.schedule,
    ...(input.imagePreparation ? { imageCodec: input.imagePreparation.codec } : {}),
    ...(input.onDiagnostic ? { onDiagnostic: input.onDiagnostic } : {}),
    ...(input.registryDiagnostics ? { registryDiagnostics: input.registryDiagnostics } : {}),
  })
  return scoped.plugin(piAiTransportPlugin, {
    policy: input.policy,
    retirement: { waitMilliseconds: input.retirement.waitMilliseconds, force: input.retirement.force },
    ...(input.imagePreparation ? { imagePreparation: { policy: input.imagePreparation.policy } } : {}),
  })
}

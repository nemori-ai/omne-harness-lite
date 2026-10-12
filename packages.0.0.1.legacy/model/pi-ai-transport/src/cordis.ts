import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { z } from 'zod'
import {
  ModelTransportService,
  MODEL_TRANSPORT,
  MODEL_TRANSPORT_SUPPORT,
  MODEL_INPUT_METERS,
} from '@omne-harness-lite/model-request-runtime/cordis'
import type {
  ModelTransportService as Operations,
  ModelDefinition,
  MeterCoordinates,
  RetirementPolicy,
} from '@omne-harness-lite/model-request-runtime'
import { ownDefinitions, tryDefinition } from './definitions.ts'
import { createModelTransportService } from './registry.ts'
import { ownCredentialConfiguration } from './credential-policy.ts'
import { ownPolicy } from './image-preparation/validation.ts'
import { meterMatches } from './input-meter.ts'

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const retirementConfig = z
  .object({ waitMilliseconds: positive, force: z.boolean() })
  .strict()
export const transportConfig = z
  .object({
    policy: z
      .object({
        maxConnections: positive,
        idleConnectionTimeoutMs: positive,
        connectTimeoutMs: positive.nullable(),
        maxErrorBodyBytes: positive,
        maxSseEventBytes: positive,
        credentialRedaction: z
          .object({
            credential_fragment_min_length: positive,
            credential_header_names: z.array(z.string()).readonly(),
            credential_patterns: z
              .array(
                z.discriminatedUnion('kind', [
                  z
                    .object({
                      kind: z.literal('prefix-token'),
                      prefix: z.string(),
                      alphabet: z.enum(['key', 'auth']),
                    })
                    .strict(),
                  z
                    .object({
                      kind: z.literal('scheme-token'),
                      scheme: z.string(),
                      alphabet: z.enum(['key', 'auth']),
                    })
                    .strict(),
                ]),
              )
              .readonly(),
          })
          .strict()
          .refine(value => {
            try {
              ownCredentialConfiguration(value)
              return true
            } catch {
              return false
            }
          }),
      })
      .strict(),
    retirement: retirementConfig,
    imagePreparation: z
      .object({
        policy: z
          .object({
            sourceMaxBytes: positive,
            decodedMaxPixels: positive,
            decodedMaxDimension: positive,
            maxConcurrent: positive,
            maxInFlightBytes: positive,
            candidateMaxBytes: positive,
            maxAttemptsPerImage: positive,
            maxCacheBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            maxCacheEntries: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            minWidth: positive,
            minHeight: positive,
            maxWidth: positive,
            maxHeight: positive,
            qualitySteps: z.array(z.number().finite()).readonly(),
            sizeScaleSteps: z.array(z.number().finite()).readonly(),
            outputFormats: z.array(z.enum(['jpeg', 'png', 'webp'])).readonly(),
            alphaBackground: z
              .object({ r: z.number(), g: z.number(), b: z.number() })
              .strict()
              .nullable(),
          })
          .strict()
          .refine(value => {
            try {
              ownPolicy(value)
              return true
            } catch {
              return false
            }
          }),
      })
      .strict()
      .optional(),
  })
  .strict()

/** The assembly may lend an existing transport owner through this definition subclass. */
export class TransportProvider extends ModelTransportService {
  constructor(
    ctx: Context,
    private readonly operations: Operations,
  ) {
    super(ctx)
  }
  clearReuseScope(...args: Parameters<Operations['clearReuseScope']>) {
    return this.operations.clearReuseScope(...args)
  }
  diagnostics() {
    return this.operations.diagnostics()
  }
  registerAdaptation(...args: Parameters<Operations['registerAdaptation']>) {
    return this.operations.registerAdaptation(...args)
  }
  acquire(...args: Parameters<Operations['acquire']>) {
    return this.operations.acquire(...args)
  }
  retire(...args: Parameters<Operations['retire']>) {
    return this.operations.retire(...args)
  }
  close(...args: Parameters<Operations['close']>) {
    return this.operations.close(...args)
  }
  get closed() {
    return this.operations.closed
  }
  inspect() {
    return this.operations.inspect()
  }
}
export const piAiTransportPlugin = definePlugin({
  name: 'pi-ai-transport',
  inject: [MODEL_TRANSPORT_SUPPORT],
  Config: transportConfig,
  apply(ctx, config) {
    const support = ctx.modelTransportSupport
    const service = createModelTransportService({
      policy: config.policy,
      ...(config.imagePreparation
        ? {
            imagePreparation: {
              policy: config.imagePreparation.policy,
              codec: support.imageCodec ?? null,
            },
          }
        : {}),
      ...(support.onDiagnostic ? { onDiagnostic: support.onDiagnostic } : {}),
      ...(support.registryDiagnostics ? { registryDiagnostics: support.registryDiagnostics } : {}),
    })
    const policy = Object.freeze({ ...config.retirement, schedule: support.retirementSchedule })
    ctx.effect(() => async () => {
      const result = await service.close(policy)
      if (!('retired' in result))
        ctx.logger.error('model_transport.remaining_active', service.inspect())
      await service.closed
    })
    new TransportProvider(ctx, service)
  },
})
export const modelContribution = definePlugin({
  name: 'model-adaptation',
  inject: [MODEL_TRANSPORT, MODEL_INPUT_METERS, MODEL_TRANSPORT_SUPPORT],
  Config: z
    .object({
      definition: z.custom<ModelDefinition>(value => tryDefinition(value) !== undefined),
      meter: z
        .object({
          modelId: z.string().min(1),
          definitionRevision: z.string().min(1),
          implementation: z
            .object({ name: z.string().min(1), revision: z.string().min(1) })
            .strict(),
          provider: z.string().min(1),
        })
        .strict(),
      retirement: retirementConfig,
    })
    .strict(),
  apply(ctx, config) {
    const definition = ownDefinitions([config.definition])[0]
    if (!definition) throw new TypeError('model definition missing')
    const coordinates: MeterCoordinates = config.meter
    const meter = ctx.modelInputMeters.select(coordinates)
    if ('unavailable' in meter || !meterMatches(meter, definition, coordinates.provider))
      throw new Error('exact input meter unavailable')
    const policy: RetirementPolicy = Object.freeze({
      ...config.retirement,
      schedule: ctx.modelTransportSupport.retirementSchedule,
    })
    const service = ctx.modelTransport
    ctx.effect(() => {
      const result = service.registerAdaptation(definition, meter, Object.freeze({}), () => {})
      if ('rejected' in result) throw new Error('model contribution rejected')
      return async () => {
        let outcome = await service.retire(result.registered, policy)
        while ('remaining_active' in outcome) {
          ctx.logger.error('model_transport.remaining_active', service.inspect())
          outcome = await service.retire(result.registered, policy)
        }
        if ('cleanup_failed' in outcome || 'rejected' in outcome)
          throw new Error('model contribution cleanup failed')
      }
    })
  },
})

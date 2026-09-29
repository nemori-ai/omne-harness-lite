import type { Plugin } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { z } from 'zod'
import { ownDefinitions, type ModelDefinition } from './definitions.ts'
import {
  createModelTransportService,
  retirementPolicyValid,
  type ModelTransportService,
  type RetirementPolicy,
} from './registry.ts'
import { ownCredentialConfiguration } from './credential-policy.ts'
import type { Diagnostic } from './http.ts'
import type { DiagnosticEmitter } from '@omne-harness-lite/model-request-runtime'
import { inputMeterValid, type InputMeter } from './input-meter.ts'

export const MODEL_TRANSPORT_SERVICE = 'modelTransport'
function isService(value: unknown): value is ModelTransportService {
  // The injecting assembly owns trust; a package-private marker would prevent
  // consuming the same public factory through a separately provided service.
  return (
    !!value &&
    typeof value === 'object' &&
    'registerAdaptation' in value &&
    typeof value.registerAdaptation === 'function' &&
    'acquire' in value &&
    typeof value.acquire === 'function' &&
    'retire' in value &&
    typeof value.retire === 'function' &&
    'close' in value &&
    typeof value.close === 'function' &&
    'inspect' in value &&
    typeof value.inspect === 'function' &&
    'closed' in value &&
    value.closed instanceof Promise
  )
}
const retirement = z.custom<RetirementPolicy>(retirementPolicyValid)
const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const configuration = z
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
    retirement,
    onDiagnostic: z
      .custom<(event: Diagnostic) => void | Promise<void>>(value => typeof value === 'function')
      .optional(),
    registryDiagnostics: z
      .custom<Pick<DiagnosticEmitter, 'record'>>(
        value =>
          !!value &&
          typeof value === 'object' &&
          'record' in value &&
          typeof value.record === 'function',
      )
      .optional(),
  })
  .strict()
export const piAiTransportPlugin = definePlugin({
  name: 'pi-ai-transport',
  Config: configuration,
  apply(ctx, config) {
    const service = createModelTransportService({
      policy: config.policy,
      ...(config.onDiagnostic ? { onDiagnostic: config.onDiagnostic } : {}),
      ...(config.registryDiagnostics ? { registryDiagnostics: config.registryDiagnostics } : {}),
    })
    const policy = Object.freeze({ ...config.retirement })
    ctx.effect(() => async () => {
      const result = await service.close(policy)
      if (!('retired' in result))
        ctx.logger.error('model_transport.remaining_active', service.inspect())
      // A timeout is observable; it does not falsely finish the owning fiber's disposal.
      await service.closed
    })
    ctx.provide(MODEL_TRANSPORT_SERVICE, service)
  },
})

/** Trusted assembly contribution: one definition, no pool and no tenant code evaluation. */
export function createModelPlugin(
  definition: ModelDefinition,
  meter: InputMeter,
  policy: RetirementPolicy,
): Plugin.Object<Record<string, never>> {
  const owned = ownDefinitions([definition])[0]
  if (!owned || !inputMeterValid(meter) || !retirementPolicyValid(policy))
    throw new TypeError('definition, meter and explicit retirement policy required')
  const retirePolicy = Object.freeze({ ...policy })
  return definePlugin({
    name: `model-adaptation:${owned.modelId}:${owned.implementation.revision}:${owned.revision}`,
    inject: [MODEL_TRANSPORT_SERVICE],
    Config: z.object({}).strict(),
    apply(ctx) {
      const service: unknown = ctx.get(MODEL_TRANSPORT_SERVICE)
      if (!isService(service)) throw new Error('model transport registry unavailable')
      const owner = Object.freeze({})
      const result = service.registerAdaptation(owned, meter, owner, () => {})
      if ('rejected' in result) throw new Error('model contribution rejected')
      const registration = result.registered
      ctx.effect(() => async () => {
        let outcome = await service.retire(registration, retirePolicy)
        while ('remaining_active' in outcome) {
          ctx.logger.error('model_transport.remaining_active', service.inspect())
          // Explicit scheduler/policy determines every wait; no hidden default or spin loop.
          outcome = await service.retire(registration, retirePolicy)
        }
        if ('cleanup_failed' in outcome || 'rejected' in outcome)
          throw new Error('model contribution cleanup failed')
      })
    },
  })
}

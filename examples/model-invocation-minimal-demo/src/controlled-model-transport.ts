import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { MODEL_TRANSPORT_SUPPORT, DEVELOPMENT_TRANSPORT_TLS } from '@omne-harness-lite/model-request-runtime/cordis'
import { createModelTransportService } from '@omne-harness-lite/pi-ai-transport'
import { TransportProvider, transportConfig } from '@omne-harness-lite/pi-ai-transport/cordis'
import { z } from 'zod'

/** Explicit development tree replacement. The normal provider remains OpenRouter-only. */
export const controlledModelTransport = definePlugin({
  name: 'acceptance-controlled-model-transport',
  inject: [MODEL_TRANSPORT_SUPPORT, DEVELOPMENT_TRANSPORT_TLS],
  Config: transportConfig.extend({ baseUrl: z.string().url() }).strict(),
  apply(ctx, config) {
    const support = ctx.modelTransportSupport
    const service = createModelTransportService({
      baseUrl: config.baseUrl, tls: { ca: [...ctx.developmentTransportTls.readCa()] }, policy: config.policy,
      ...(config.imagePreparation ? { imagePreparation: { policy: config.imagePreparation.policy, codec: support.imageCodec ?? null } } : {}),
      ...(support.onDiagnostic ? { onDiagnostic: support.onDiagnostic } : {}),
      ...(support.registryDiagnostics ? { registryDiagnostics: support.registryDiagnostics } : {}),
    })
    const retirement = Object.freeze({ ...config.retirement, schedule: support.retirementSchedule })
    ctx.effect(() => async () => {
      const result = await service.close(retirement)
      if ('cleanup_failed' in result || 'rejected' in result) throw new Error('model transport cleanup failed')
      await service.closed
    })
    new TransportProvider(ctx, service)
  },
})

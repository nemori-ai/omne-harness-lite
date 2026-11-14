import { Context } from '@deepseek-ai/cordis'
import {
  connectionPlugin,
  defineProtocolClient,
  protocolServiceName,
  type LoginStateSource,
} from '@omne-harness/client-assembly/cordis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { Transport } from '@omne-harness/sdk/core'
import { readRetryDelayMs } from './read-retry.ts'

export type ClientTree = {
  watch(service: string, listener: (value: unknown) => void): () => void
  dispose(): Promise<void>
}

export const serviceOf = (protocol: ProtocolContract): string =>
  protocolServiceName({ name: protocol.name, major: protocol.major })

export async function startClientTree(options: {
  readonly transport: Transport
  readonly login: LoginStateSource
  readonly protocols: readonly ProtocolContract[]
}): Promise<ClientTree> {
  const root = new Context()
  await root.plugin(
    connectionPlugin({
      transport: options.transport,
      login: options.login,
      readRetry: { delayMs: readRetryDelayMs },
    }),
  )
  for (const protocol of options.protocols) await root.plugin(defineProtocolClient(protocol))
  return {
    watch(service, listener) {
      const fiber = root.plugin({
        name: `watch:${service}`,
        inject: [service],
        apply(ctx: Context) {
          listener((ctx as unknown as { get(name: string): unknown }).get(service))
          ctx.effect(() => () => listener(undefined))
        },
      })
      return () => {
        void fiber.dispose()
      }
    },
    dispose: () => root.fiber.dispose().then(() => undefined),
  }
}

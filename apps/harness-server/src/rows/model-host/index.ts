// The `model-host` row (assembly page row table, R2-D6, `tmp/wire-model/design.md` §4, §5, §7):
// model-host-local's `createModelRuntimeLocalPlugin` with the real Model runtime as its provider.
// It injects `modelCommands`, `modelClock` and `modelHostAuthority` (the plugin's static inject).
// The objects that do not go into configuration come from the run composition the entry holds:
// - `executionChannel`: the one channel of the current records activation, shared with the send stage.
// - `releaseExecution`: disposes the send child, then closes the channel (host-local SPEC release order).
// - `qualifyObservation`: the `observe` row of the authority, after qualifying the observer.
// - `send`: `modelSendBoundary`, read per call (the records row's send child provides it; absent
//   means `not-started` with `unavailable`, never another source).
// - `retry`: the always-unavailable policy of M2 (no retry policy; a stall before the first content
//   stays `running`, the user can still cancel; known limitation).
// - the commands the runtime writes through are wrapped with the W admission point.
//
// Shutdown. The row is body-borne with phase `business`: the host plugin runs in a child fiber of
// the row, and the business stop disposes that child, which is the member's ordered shutdown
// (quiesce, stop dispatching and wait for every drive, stop the push, release the send child and
// the channel). The stop answers `settled` when the child is disposed before the deadline, else
// `incomplete` while the disposal goes on; the tree disposal awaits the same disposal later.
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import { createModelRuntime } from '@omne-harness/model'
import type { ModelRetryPolicy, ModelSendBoundary } from '@omne-harness/model-contract/provider'
import {
  ModelSendBoundaryService,
  modelClockKey,
  modelCommandsKey,
  modelHostAuthorityKey,
  modelInstanceHostKey,
  modelRuntimeKey,
  modelSendBoundaryKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { createModelRuntimeLocalPlugin } from '@omne-harness/model-host-local/cordis'
import { modelCompositionOf } from '../../entry/model-authorities.ts'
import { qualifyingCommands } from '../../model/commands-qualifying.ts'
import { defineRow, type RowHandle } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { modelHostConfig, type ModelHostConfig } from './config.ts'

const RETRY_UNAVAILABLE = {
  kind: 'unavailable' as const,
  dependency: 'model-retry-policy',
  diagnostic: 'not-configured',
}

/** M2 has no retry policy: every position ends `policy-unavailable`. */
export const unavailableRetry: ModelRetryPolicy<unknown> = Object.freeze({
  inspect: async () => ({ failure: RETRY_UNAVAILABLE }),
  decide: async () => ({ failure: RETRY_UNAVAILABLE }),
})

/** The send boundary, read per call: only the contract service under the formal key, or unavailable. */
export function lateBoundSendBoundary(ctx: Context): ModelSendBoundary<unknown> {
  const boundary: ModelSendBoundary<unknown> = {
    async send(demand, signal) {
      const service: unknown = ctx.get(modelSendBoundaryKey)
      if (!(service instanceof ModelSendBoundaryService))
        return {
          kind: 'not-started',
          failure: {
            kind: 'unavailable',
            dependency: modelSendBoundaryKey,
            diagnostic: 'send boundary is not provided',
          },
        }
      return (service as ModelSendBoundary<unknown>).send(demand, signal)
    },
  }
  return Object.freeze(boundary)
}

/** The host plugin of one row activation, with every live object in its closure. */
function hostPlugin(config: ModelHostConfig): Plugin.Object {
  return {
    name: 'model-host',
    inject: [modelCommandsKey, modelClockKey, modelHostAuthorityKey],
    apply(ctx: Context) {
      const composition = modelCompositionOf(ctx)
      if (composition === undefined)
        throw new Error(
          'model-host: the modelHostAuthority entry object of this release is not installed',
        )
      const binding = composition.bindHost(ctx)
      const send = lateBoundSendBoundary(ctx)
      const Plugin = createModelRuntimeLocalPlugin({
        executionChannel: binding.executionChannel,
        releaseExecution: binding.releaseExecution,
        qualifyObservation: access => binding.qualifyObservation(access),
        results: { ledger: binding.ledger, limits: config.results },
        provider: ({ host, commands, clock }) =>
          createModelRuntime(
            {
              commands: qualifyingCommands(commands, access => binding.qualify(access)),
              clock,
              instances: host,
              send,
              retry: unavailableRetry,
            },
            config.runtime,
          ),
      })
      const instance = new Plugin(ctx, config.host)
      return instance[Service.init]()
    },
  }
}

async function body(ctx: Context, raw: unknown): Promise<RowHandle> {
  const config = modelHostConfig.parse(raw)
  const child = ctx.plugin(hostPlugin(config))
  await child
  let disposing: Promise<void> | undefined
  return {
    stop: async deadline => {
      disposing ??= child.dispose()
      const remaining = deadline - monotonicClock.now()
      const timer = monotonicClock.after(remaining)
      const settled = await Promise.race([
        disposing.then(
          () => 'settled' as const,
          () => 'failed' as const,
        ),
        timer.promise.then(() => 'deadline' as const),
      ])
      timer.cancel()
      switch (settled) {
        case 'settled':
          return { kind: 'settled' }
        case 'failed':
          return { kind: 'failed', detail: 'the model host did not shut down cleanly' }
        case 'deadline':
          return { kind: 'incomplete', detail: 'the model host is still handing back its drives' }
      }
    },
  }
}

export const modelHostRow = defineRow({
  row: 'model-host',
  implementation: 'real',
  manifest: {
    provides: [modelRuntimeKey, modelInstanceHostKey],
    injects: [modelCommandsKey, modelClockKey, modelHostAuthorityKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'business' },
  Config: modelHostConfig,
  body,
})

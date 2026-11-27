import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import {
  NO_RESEND_RETRY_POLICY,
  createDefaultRetryPolicy,
  createModelRuntime,
  createNoResendRetryPolicy,
  routeRetryPolicies,
} from '@omne-harness/model'
import type { DurableEvidence } from '@omne-harness/model-contract'
import type { ModelSendBoundary } from '@omne-harness/model-contract/provider'
import {
  ModelSendBoundaryService,
  modelClockKey,
  modelCommandsKey,
  modelHostAuthorityKey,
  modelInstanceHostKey,
  modelRuntimeKey,
  modelSendBoundaryKey,
  modelStreamObservationKey,
  modelStreamReferencesKey,
} from '@omne-harness/model-cordis-contract/cordis'
import {
  createModelRuntimeLocalPlugin,
  type ModelHostDrain,
  type ResultPushRecovery,
} from '@omne-harness/model-host-local/cordis'
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import type { ModelHostBinding } from '../../model/composition.ts'
import { qualifyingCommands } from '../../model/commands-qualifying.ts'
import { modelHostPortOf } from '../../model/ports.ts'
import { defineRow, type RowHandle } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { modelHostConfig, type ModelHostConfig } from './config.ts'

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

/** The cost lookup of the send boundary this tree provides at the moment it is asked. */
function lateBoundCostLookup(ctx: Context): NonNullable<ModelSendBoundary<unknown>['lookupCost']> {
  return (input, signal) => {
    const service: unknown = ctx.get(modelSendBoundaryKey)
    if (!(service instanceof ModelSendBoundaryService))
      return Promise.resolve({ kind: 'unavailable', diagnostic: 'send boundary is not provided' })
    const lookup = (service as ModelSendBoundary<unknown>).lookupCost
    return lookup?.call(service, input, signal) ?? Promise.resolve({ kind: 'unsupported' })
  }
}

type Drain = (signal: AbortSignal) => Promise<ModelHostDrain>

/** The start scan reads every tenant the storage holds, each with its own scan access. */
function startScan(ctx: Context, binding: ModelHostBinding): ResultPushRecovery {
  return {
    async scopes() {
      const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
      const listed = await directory.enumerate({
        principal: ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY),
      })
      if (listed.kind === 'denied') return fail({ kind: 'denied', action: 'tenant-domains' })
      if (listed.kind === 'unavailable')
        return fail({
          kind: 'unavailable',
          dependency: tenantDomainsKey,
          diagnostic: listed.diagnostic,
        })
      const scopes: Access<unknown>[] = []
      for (const entry of listed.entries) {
        const tenant = tenantCodec.parse(entry.tenant)
        if (!tenant.ok) continue
        const access = binding.scanAccess(tenant.value)
        if ('failure' in access) return access
        scopes.push(access.ok)
      }
      return succeed(scopes)
    },
  }
}

export type ModelHostRowInput = Readonly<{
  lostContact?: (instance: string) => DurableEvidence | null
}>

function hostPlugin(
  input: ModelHostRowInput,
  config: ModelHostConfig,
  built: (drain: Drain) => void,
): Plugin.Object {
  return {
    name: 'model-host',
    inject: [
      modelCommandsKey,
      modelClockKey,
      modelHostAuthorityKey,
      tenantDomainsKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
    ],
    apply(ctx: Context) {
      const port = modelHostPortOf(ctx)
      if (port === undefined)
        throw new Error(
          'model-host: the modelHostAuthority entry object of this release is not installed',
        )
      const binding = port.bindHost(ctx)
      const observation = binding.observation()
      if ('failure' in observation)
        throw new Error(
          `model-host: the observation pair is unavailable (${observation.failure.kind})`,
        )
      const send = lateBoundSendBoundary(ctx)
      const Plugin = createModelRuntimeLocalPlugin({
        executionChannel: binding.executionChannel,
        releaseExecution: binding.releaseExecution,
        qualifyObservation: access => binding.qualifyObservation(access),
        observation: observation.ok,
        results: {
          ledger: binding.ledger,
          limits: config.results,
          recovery: startScan(ctx, binding),
          lookup: lateBoundCostLookup(ctx),
        },
        ...(input.lostContact === undefined ? {} : { lostContact: input.lostContact }),
        provider: ({ host, commands, clock, liveness, liveEvents }) =>
          createModelRuntime(
            {
              commands: qualifyingCommands(
                commands,
                access => binding.qualify(access),
                access => binding.qualifyRead(access),
              ),
              clock,
              instances: host,
              send,
              // A call is retried by the policy its request names: a chat call by the configured
              // one, a call that is sent once (a decision) by the policy that never sends again.
              retry: routeRetryPolicies([
                {
                  adoption: config.retry.adoption,
                  policy: createDefaultRetryPolicy({ ...config.retry, clock, random: Math.random }),
                },
                { adoption: NO_RESEND_RETRY_POLICY, policy: createNoResendRetryPolicy() },
              ]),
              liveness,
              live: { events: liveEvents, ...config.live },
            },
            config.runtime,
          ),
      })
      const instance = new Plugin(ctx, config.host)
      built(signal => instance.drain(signal))
      return instance[Service.init]()
    },
  }
}

const bodyOf = (input: ModelHostRowInput) =>
  async function body(ctx: Context, raw: unknown): Promise<RowHandle> {
    const config = modelHostConfig.parse(raw)
    let drain: Drain | undefined
    const child = ctx.plugin(hostPlugin(input, config, built => (drain = built)))
    await child
    let disposing: Promise<void> | undefined
    return {
      drain: async deadline => {
        if (drain === undefined) return { kind: 'settled' }
        const expired = new AbortController()
        const timer = monotonicClock.after(deadline - monotonicClock.now())
        void timer.promise.then(() => expired.abort())
        const drained = await drain(expired.signal)
        timer.cancel()
        if (!drained.quiesced)
          return { kind: 'incomplete', detail: 'the model runtime did not close its admission' }
        if (drained.inFlight === 0) return { kind: 'settled' }
        return {
          kind: 'incomplete',
          detail: `${drained.inFlight} model call(s) or result push(es) still ran at the drain deadline; the stop aborts them and their outcome stays unknown`,
        }
      },
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

export function createModelHostRow(input: ModelHostRowInput = {}) {
  return defineRow({
    row: 'model-host',
    implementation: 'real',
    manifest: {
      provides: [
        modelRuntimeKey,
        modelInstanceHostKey,
        modelStreamReferencesKey,
        modelStreamObservationKey,
      ],
      injects: [
        modelCommandsKey,
        modelClockKey,
        modelHostAuthorityKey,
        tenantDomainsKey,
        TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
      ],
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'body', phase: 'business' },
    Config: modelHostConfig,
    body: bodyOf(input),
  })
}

export const modelHostRow = createModelHostRow()

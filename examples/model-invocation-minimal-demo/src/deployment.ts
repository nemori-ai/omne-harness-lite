import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { isOk } from '@omne-harness-lite/identity-values'
import { parseOfferTtl } from '@omne-harness-lite/offer-expiry'
import { toOpaqueJson, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { CapabilityId, AssetDefinition, AssetHolding } from '@omne-harness-lite/asset-model'
import {
  createOfficialProfileContent,
  createDeepSeekV4ProInputMeter,
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
} from '@omne-harness-lite/pi-ai-transport'
import {
  openRouterCredentialRedactionConfig,
  type TokenMargin,
} from '@omne-harness-lite/model-request-runtime'
import type { AcceptanceConfig, AuthenticatedActor, ModelInputSource } from './types.ts'

export const MODEL = deepseekV4Pro0813Definition.modelId
export const DEMO_ROOT: CapabilityId = {
  category: 'agent_definition',
  name: 'demo:model-invocation-root',
}
export const PUBLICATION_TIME = '2026-09-28T00:00:00Z'
const URI =
  'https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/'
export function demoPublication(
  actor: AuthenticatedActor,
  expectedRevision: string | null = null,
): ModelInputSource['publication'] {
  const body: JsonObject = {
    references: [],
    attributes: [
      ...[
        { item: 'first_token_wait_limit', value: 'PT15S' },
        { item: 'post_first_token_stall_limit', value: 'PT120S' },
      ].map(({ item, value }): JsonObject => ({
        item,
        kind: 'setting',
        category: 'preference',
        domain: {
          kind: 'open',
          schema: {
            allOf: [
              { $ref: `${URI}tool-definition/v3/tool-definition.schema.json#/$defs/Duration` },
              { pattern: '[1-9]' },
            ],
          },
        },
        default: value,
      })),
      {
        item: 'model',
        kind: 'setting',
        category: 'binding',
        domain: {
          kind: 'open',
          schema: { $ref: `${URI}model-profile/v3/model-profile.schema.json#/$defs/RouteName` },
        },
        default: MODEL,
      },
    ],
  }
  const asset: AssetDefinition = {
    id: 'demo-model-invocation-root-asset',
    capability: DEMO_ROOT,
    origin: 'official',
    versions: [
      {
        number: 1,
        publishedAt: PUBLICATION_TIME,
        content: { category: 'agent_definition', body: toOpaqueJson(body) },
      },
    ],
  }
  const holding: AssetHolding = {
    holder: { layer: 'factory' },
    capability: DEMO_ROOT,
    asset: asset.id,
    basis: { kind: 'official' },
    immutable: false,
    assignments: [],
    versionSelection: { kind: 'current' },
    since: PUBLICATION_TIME,
  }
  return {
    expectedRevision,
    definitions: [asset],
    scopes: [
      { holder: { layer: 'factory' }, holdings: [holding] },
      { holder: { layer: 'organization', organization: actor.tenant.organization }, holdings: [] },
      { holder: { layer: 'tenant', tenant: actor.tenant }, holdings: [] },
    ],
  }
}

/** Explicit development deployment; keys and directory are created by the demo owner. */
export function createDemoConfig(
  directory: string,
  runId: string,
  now: () => string,
  tokenMargin: TokenMargin,
): AcceptanceConfig {
  const keys = {
    activationSigning: join(directory, 'activation-private.pem'),
    activationVerification: join(directory, 'activation-public.pem'),
    purgeSigning: join(directory, 'purge-private.pem'),
    purgeVerification: join(directory, 'purge-public.pem'),
    modelReplica: join(directory, 'model-key'),
  }
  const ttl = parseOfferTtl(60_000)
  if (!isOk(ttl)) throw new Error('explicit demo duration invalid')
  const profile = createOfficialProfileContent(deepseekV4Pro0813Definition, {
    providers: ['deepinfra/fp8'],
    allowFallback: false,
    configuration: deepseekV4Pro0813Configuration,
  })
  if ('rejected' in profile) throw new Error('frozen first model declaration rejected')
  return {
    runId,
    databaseFile: join(directory, 'db.sqlite'),
    keys,
    credentials: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
    identity: { credentialPolicy: { minLength: 8 }, unactivatedRetention: ttl.ok },
    governance: {
      invitationTtlDefault: ttl.ok,
      affiliationRequestTtlDefault: ttl.ok,
      teamCreationKeyRetention: ttl.ok,
    },
    officialManifest: { ordinal: 1, entries: [profile.ok] },
    wait: {
      clockTimeoutMs: 15_000,
      pollMs: 10,
      monotonicNow: () => Number(process.hrtime.bigint() / 1000000n),
      sleep,
    },
    sessionLog: {
      dir: join(directory, 'session-logs'),
      processOwnership: {
        current: runId,
        async observeExit() {
          return 'unknown'
        },
      },
      policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
    },
    modelRequest: {
      tokenMargin,
      evaluationInputs: {
        storeKey: 'model-invocation-minimal-demo',
        deployedOfficial: [{ capability: DEMO_ROOT, meta: false }],
        monotonicNow: () => process.hrtime.bigint(),
        async prepare(actor) {
          return {
            publication: demoPublication(actor),
            recipe: { rootDefinition: DEMO_ROOT },
          }
        },
      },
      transport: {
        definitions: [deepseekV4Pro0813Definition],
        inputMeters: [createDeepSeekV4ProInputMeter(deepseekV4Pro0813Definition)],
        policy: {
          maxConnections: 1,
          idleConnectionTimeoutMs: 5000,
          connectTimeoutMs: 5000,
          maxErrorBodyBytes: 8192,
          maxSseEventBytes: 65536,
          credentialRedaction: openRouterCredentialRedactionConfig,
        },
      },
      invocation: {
        now,
        firstContentTimeoutMs: 15000,
        idleContentTimeoutMs: 120000,
        schedule(ms, callback) {
          const timer = setTimeout(callback, ms)
          return () => clearTimeout(timer)
        },
        statusCauseTable: { '503': 'upstream_unavailable', '401': 'credential_unavailable' },
        credentialRedaction: openRouterCredentialRedactionConfig,
      },
      reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 5000 },
      settlement: {
        contention: {
          name: 'demo-finite-contention',
          limits: { submissions: 2, elapsedMs: 5000, retainedBytes: 1048576, concurrent: 1 },
          decide() {
            return { proceed: { waitMs: 0 } }
          },
        },
        scheduler: {
          nowMonotonicMs: () => Number(process.hrtime.bigint() / 1000000n),
          wait(ms, signal) {
            let timer: ReturnType<typeof setTimeout> | undefined,
              finished = false
            let complete: (value: 'elapsed' | 'cancelled') => void = () => undefined
            let stopped: () => void = () => undefined
            const completion = new Promise<'elapsed' | 'cancelled'>(resolve => {
              complete = resolve
            })
            const actualStopped = new Promise<void>(resolve => {
              stopped = resolve
            })
            function finish(value: 'elapsed' | 'cancelled') {
              if (finished) return
              finished = true
              if (timer !== undefined) clearTimeout(timer)
              signal.removeEventListener('abort', cancel)
              complete(value)
              stopped()
            }
            function cancel() {
              finish('cancelled')
            }
            if (signal.aborted) cancel()
            else {
              signal.addEventListener('abort', cancel, { once: true })
              const exact = ExactDecimal.from(ms)
              if (
                !exact.isInteger ||
                exact.compare(ExactDecimal.from(0)) < 0 ||
                exact.compare(ExactDecimal.from(Number.MAX_SAFE_INTEGER)) > 0
              )
                throw new Error('explicit demo scheduler range unsupported')
              timer = setTimeout(() => finish('elapsed'), Number(exact.toString()))
            }
            return { completion, stopped: actualStopped, requestStop: cancel }
          },
        },
      },
    },
  }
}

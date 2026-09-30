import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { randomInt } from 'node:crypto'
import sharp from 'sharp'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { isOk } from '@omne-harness-lite/identity-values'
import { parseOfferTtl } from '@omne-harness-lite/offer-expiry'
import { toOpaqueJson, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { CapabilityId, AssetDefinition, AssetHolding } from '@omne-harness-lite/asset-model'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import {
  createOfficialCatalogProfile,
  createSharpImageCodec,
  modelImageBalancedV1,
  deepseekV4Pro0813Definition,
  officialCatalog,
  type InputMeter,
  type ModelDefinition,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import type { ModelProfileContent } from '@omne-harness-lite/model-profile'
import {
  openRouterCredentialRedactionConfig,
  type AcknowledgementCleanupPolicy,
  type TokenMargin,
  type DefaultRetryConfiguration,
} from '@omne-harness-lite/model-request-runtime'
import type { AcceptanceConfig, AuthenticatedActor, ModelInputSource } from './types.ts'
import type { ProcessOwnership } from '@omne-harness-lite/session-log-jsonl'

export const MODEL = deepseekV4Pro0813Definition.modelId
/**
 * Official manifest ordinal. Raise it whenever the installed entries change: the directory keeps a
 * manifest whose ordinal equals the stored one but whose entries differ as `manifestNotNewer`, so an
 * existing data directory would keep its previous list. 4 replaced the two-DeepSeek list (3).
 */
export const DEMO_OFFICIAL_MANIFEST_ORDINAL = 4
/** Configuration revision of every official profile this demo installs. */
export const DEMO_OFFICIAL_CONFIGURATION_REVISION = 'model-invocation-minimal-demo-1'

/**
 * Every official leaf the transport package catalogs: its definition, one meter from the catalog's
 * own binding and one profile on its only route. A rejected profile stops the assembly.
 */
function officialModels(): {
  readonly definitions: readonly ModelDefinition[]
  readonly inputMeters: readonly InputMeter[]
  readonly profiles: readonly ModelProfileContent[]
} {
  const definitions: ModelDefinition[] = [],
    inputMeters: InputMeter[] = [],
    profiles: ModelProfileContent[] = []
  for (const entry of officialCatalog) {
    const profile = createOfficialCatalogProfile(entry, DEMO_OFFICIAL_CONFIGURATION_REVISION)
    if (!('ok' in profile))
      throw new Error(
        `official profile for ${entry.definition.modelId} rejected: ${profile.rejected}`,
      )
    definitions.push(entry.definition)
    inputMeters.push(entry.createInputMeter(entry.definition))
    profiles.push(profile.ok)
  }
  if (!definitions.some(definition => definition.modelId === MODEL))
    throw new Error('the initial demo model is not an official catalog entry')
  return { definitions, inputMeters, profiles }
}
export const DEMO_ROOT: CapabilityId = {
  category: 'agent_definition',
  name: 'demo:model-invocation-root',
}
export const DEMO_DEFAULT_RETRY: CapabilityId = {
  category: 'loop_extension',
  name: 'omne-official:default-retry',
}
/**
 * An explicit, finite retry schedule: automatic cleanup retry number `attempts` waits
 * `waitsMs[attempts - 1]`, and the round stops once the list is exhausted. Replace it with any
 * `AcknowledgementCleanupPolicy`; the durable cleanup responsibility itself never stops.
 */
export function createExplicitCleanupSchedule(
  waitsMs: readonly number[],
): AcknowledgementCleanupPolicy {
  if (!waitsMs.every(wait => Number.isSafeInteger(wait) && wait >= 0))
    throw new TypeError('cleanup schedule needs non-negative integer waits')
  const schedule = Object.freeze([...waitsMs])
  const policy: AcknowledgementCleanupPolicy = {
    next: ({ attempts }) => {
      const wait = schedule[Number(attempts) - 1]
      return wait === undefined ? { stop: true } : { waitMs: wait }
    },
  }
  return Object.freeze(policy)
}
export const PUBLICATION_TIME = '2026-09-28T00:00:00Z'
export function createDemoDefaultRetryConfiguration(): DefaultRetryConfiguration {
  return {
    policy: {
      kind: 'exponential',
      base: 'PT1S',
      factor: 2,
      max: 'PT30S',
      jitter: 'full',
    },
    sample: () => randomInt(1_000_000) / 1_000_000,
  }
}
const URI =
  'https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/'
export function demoPublication(
  actor: AuthenticatedActor,
  expectedRevision: string | null = null,
): ModelInputSource['publication'] {
  const body: JsonObject = {
    references: [
      {
        capability: {
          category: DEMO_DEFAULT_RETRY.category,
          name: DEMO_DEFAULT_RETRY.name,
        },
      },
    ],
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
  const retry = judgeDefinition({
    name: DEMO_DEFAULT_RETRY.name,
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    power: 'rewrite',
    implementation: { kind: 'builtin', builtinName: DEMO_DEFAULT_RETRY.name },
  })
  if ('rejected' in retry) throw new Error('default retry declaration rejected')
  const retryAsset: AssetDefinition = {
    id: 'demo-default-retry-asset',
    capability: DEMO_DEFAULT_RETRY,
    origin: 'official',
    versions: [
      {
        number: 1,
        publishedAt: PUBLICATION_TIME,
        content: { category: 'loop_extension', extension: retry.ok },
      },
    ],
  }
  const retryHolding: AssetHolding = {
    holder: { layer: 'factory' },
    capability: DEMO_DEFAULT_RETRY,
    asset: retryAsset.id,
    basis: { kind: 'official' },
    immutable: false,
    assignments: [],
    versionSelection: { kind: 'current' },
    since: PUBLICATION_TIME,
  }
  return {
    expectedRevision,
    definitions: [asset, retryAsset],
    scopes: [
      { holder: { layer: 'factory' }, holdings: [holding, retryHolding] },
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
  retirement: RetirementPolicy,
  processOwnership?: ProcessOwnership,
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
  const official = officialModels()
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
    officialManifest: { ordinal: DEMO_OFFICIAL_MANIFEST_ORDINAL, entries: official.profiles },
    wait: {
      clockTimeoutMs: 15_000,
      pollMs: 10,
      monotonicNow: () => Number(process.hrtime.bigint() / 1000000n),
      sleep,
    },
    sessionLog: {
      dir: join(directory, 'session-logs'),
      processOwnership: {
        current: processOwnership?.current ?? runId,
        observeExit: processOwnership?.observeExit ?? (async () => 'unknown'),
      },
      policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
    },
    modelRequest: {
      maxScopes: 64,
      acknowledgementCleanup: createExplicitCleanupSchedule([200, 1_000, 5_000, 30_000]),
      callReferences: {
        maxScopes: 64,
        content: { maxConcurrentWrites: 4, maxContentBytes: 16 * 1024 * 1024 },
      },
      tokenMargin,
      defaultRetry: createDemoDefaultRetryConfiguration(),
      registryPolicy: { maxRetries: 2, maxInFlight: 8 },
      evaluationInputs: {
        storeKey: 'model-invocation-minimal-demo',
        deployedOfficial: [
          { capability: DEMO_ROOT, meta: false },
          { capability: DEMO_DEFAULT_RETRY, meta: false },
        ],
        monotonicNow: () => process.hrtime.bigint(),
        async prepare(actor) {
          return {
            publication: demoPublication(actor),
            recipe: { rootDefinition: DEMO_ROOT },
          }
        },
      },
      transport: {
        imagePreparation: {
          policy: modelImageBalancedV1,
          codec: createSharpImageCodec(sharp),
        },
        definitions: official.definitions,
        inputMeters: official.inputMeters,
        policy: {
          maxConnections: 1,
          idleConnectionTimeoutMs: 5000,
          connectTimeoutMs: 5000,
          maxErrorBodyBytes: 8192,
          maxSseEventBytes: 65536,
          credentialRedaction: openRouterCredentialRedactionConfig,
        },
        retirement,
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

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { toOpaqueJson, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { AssetDefinition, AssetHolding, CapabilityId } from '@omne-harness-lite/asset-model'
import type { LocalPublication } from '@omne-harness-lite/evaluation-input-store/publication'
import {
  deepseekV4Pro0813Definition,
  deepseekV4Pro0813Configuration,
  createOfficialProfileContent,
} from '@omne-harness-lite/pi-ai-transport'
import { openRouterCredentialRedactionConfig } from '@omne-harness-lite/model-request-runtime'
import type { AcceptanceConfig, AuthenticatedActor, ModelRequestDeployment } from '../src/index.ts'
import { deployment } from './support.ts'

export const ROOT: CapabilityId = {
  category: 'agent_definition',
  name: 'acceptance:model-request-root',
}
const AT = '2026-09-28T00:00:00Z'
const URI =
  'https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/'
export function rootBody(): JsonObject {
  return {
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
        default: deepseekV4Pro0813Definition.modelId,
      },
    ],
  }
}
export function publication(
  actor: AuthenticatedActor,
  expectedRevision: string | null = null,
): LocalPublication {
  const asset: AssetDefinition = {
    id: 'acceptance-root-asset',
    capability: ROOT,
    origin: 'official',
    versions: [
      {
        number: 1,
        publishedAt: AT,
        content: { category: 'agent_definition', body: toOpaqueJson(rootBody()) },
      },
    ],
  }
  const holding: AssetHolding = {
    holder: { layer: 'factory' },
    capability: ROOT,
    asset: asset.id,
    basis: { kind: 'official' },
    immutable: false,
    assignments: [],
    versionSelection: { kind: 'current' },
    since: AT,
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
export async function callDeployment(
  label: string,
): Promise<AcceptanceConfig & { readonly modelRequest: ModelRequestDeployment }> {
  const base = await deployment(label),
    dir = join(dirname(base.databaseFile), 'logs')
  await mkdir(dir, { mode: 0o700 })
  const profile = createOfficialProfileContent(deepseekV4Pro0813Definition, {
    providers: ['deepinfra/fp8'],
    allowFallback: false,
    configuration: deepseekV4Pro0813Configuration,
  })
  if ('rejected' in profile) throw new Error('actual first model profile invalid')
  const credentialRedaction = openRouterCredentialRedactionConfig
  return {
    ...base,
    officialManifest: { ordinal: 1, entries: [profile.ok] },
    sessionLog: {
      dir,
      processOwnership: {
        current: label,
        async observeExit() {
          return 'unknown'
        },
      },
      policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
    },
    modelRequest: {
      evaluationInputs: {
        storeKey: label,
        deployedOfficial: [{ capability: ROOT, meta: false }],
        monotonicNow: () => process.hrtime.bigint(),
        async prepare(actor) {
          return { publication: publication(actor), recipe: { rootDefinition: ROOT } }
        },
      },
      transport: {
        definitions: [deepseekV4Pro0813Definition],
        policy: {
          maxConnections: 1,
          idleConnectionTimeoutMs: 5000,
          connectTimeoutMs: 5000,
          maxErrorBodyBytes: 8192,
          maxSseEventBytes: 65536,
          credentialRedaction,
        },
      },
      invocation: {
        now: () => AT,
        schedule(ms, callback) {
          const timer = setTimeout(callback, ms)
          return () => clearTimeout(timer)
        },
        statusCauseTable: { '503': 'upstream_unavailable' },
        credentialRedaction,
      },
      settlement: {
        contention: {
          name: 'explicit-acceptance-contention',
          limits: { submissions: 2, elapsedMs: 5000, retainedBytes: 1048576, concurrent: 1 },
          decide() {
            return { proceed: { waitMs: 0 } }
          },
        },
        scheduler: {
          nowMonotonicMs: () => Number(process.hrtime.bigint() / 1000000n),
          wait(_ms, signal) {
            return {
              completion: Promise.resolve(signal.aborted ? 'cancelled' : 'elapsed'),
              stopped: Promise.resolve(),
              requestStop() {},
            }
          },
        },
      },
    },
  }
}

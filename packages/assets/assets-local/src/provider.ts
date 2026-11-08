import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { projectAssetSettings } from '@omne-harness/assets'
import { SettingsIdSchema } from '@omne-harness/settings'
import {
  SettingsProjectionBindingSchema,
  SettingsSqlGuardBindingSchema,
  type SettingsProjectionBinding,
  type SettingsSqlGuards,
} from '@omne-harness/settings-local'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { digest, equal, identity, json, withinBudget } from './encoding.ts'
import {
  assetLookupSchema,
  assetResultSchema,
  changeHoldingSchema,
  domainSchema,
  HANDLER,
  holdSchema,
  holdingLookupSchema,
  holdingResultSchema,
  mutationSchema,
  PARTICIPANT,
  PROTOCOL,
  publishMetadataSchema,
  versionLookupSchema,
  versionResultSchema,
  type Failure,
  type Mutation,
} from './schema.ts'
import { receiptResult } from './results.ts'
import type {
  AssetsLocal,
  AssetsLocalOptions,
  AssetsMutationResult,
  AssetsPublish,
} from './types.ts'
const fail = (reason: Failure['reason']): Failure => ({ kind: 'rejected', reason })

export const assetsSettingsGuards = {
  participant: PARTICIPANT,
  command(binding: Parameters<SettingsSqlGuards['command']>[0]) {
    return {
      participant: PARTICIPANT,
      facts: { kind: 'guard', binding: json(SettingsSqlGuardBindingSchema.parse(binding)) },
    }
  },
} satisfies SettingsSqlGuards
export function assetsSettingsProjectionCommand(binding: SettingsProjectionBinding): FactCommandV2 {
  return {
    participant: PARTICIPANT,
    facts: { kind: 'capture', binding: json(SettingsProjectionBindingSchema.parse(binding)) },
  }
}
export function assetsPublicationCommand(binding: SettingsProjectionBinding): FactCommandV2 {
  return {
    participant: PARTICIPANT,
    facts: {
      kind: 'capturePublication',
      binding: json(SettingsProjectionBindingSchema.parse(binding)),
    },
  }
}
function publishCommand(options: AssetsLocalOptions, input: AssetsPublish) {
  if (!withinBudget(input)) return fail('limit_exceeded')
  const metadata = publishMetadataSchema.safeParse({
    operationId: input.operationId,
    assetRef: input.assetRef,
    expectedRevision: input.expectedRevision,
  })
  if (!metadata.success) return fail('invalid_input')
  const projection = projectAssetSettings(options.categories, {
    assetRef: metadata.data.assetRef,
    pinned: input.pinned,
  })
  if (projection.kind === 'rejected')
    return fail(projection.reason === 'provider_unavailable' ? 'unavailable' : 'invalid_input')
  const declaration =
    projection.kind === 'none'
      ? projection
      : {
          kind: 'declared',
          definition: projection.definition,
          definitionRef: {
            providerId: projection.definition.providerId,
            definitionId: projection.definition.definitionId,
            version: projection.definition.version,
            digest: digest(projection.definition),
          },
        }
  const command = mutationSchema.safeParse({
    ...metadata.data,
    kind: 'publish',
    category: input.pinned.identity.category,
    name: input.pinned.identity.name,
    version: input.pinned.version,
    source: input.pinned.source,
    body: input.pinned.body,
    declaration,
  })
  return command.success ? command.data : fail('invalid_input')
}
export function createAssetsLocal(input: AssetsLocalOptions): AssetsLocal {
  const options = { ...input, domain: domainSchema.parse(input.domain) }
  if (options.domain.scope.kind !== 'tenant')
    throw new TypeError('Assets-local requires a tenant domain')
  SettingsIdSchema.parse(options.combinationVersion)
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(options.manifestDigest)
  const active = new Set<Promise<unknown>>()
  let closed: Promise<void> | undefined
  function run<T>(task: () => Promise<T>): Promise<T | Failure> {
    if (closed) return Promise.resolve(fail('closing'))
    const promise = Promise.resolve()
      .then(task)
      .catch(() => fail('unavailable'))
    active.add(promise)
    void promise.then(() => active.delete(promise))
    return promise
  }
  async function commit(command: Mutation): Promise<AssetsMutationResult> {
    try {
      const result = await options.storage.commit({
        identity: identity(options.domain, command.operationId),
        combinationVersion: options.combinationVersion,
        manifestDigest: options.manifestDigest,
        commands: [
          {
            participant: PARTICIPANT,
            facts: { kind: 'mutate', binding: json({ domain: options.domain, command }) },
          },
        ],
      })
      const mapped = receiptResult(result, options.domain, command.operationId, command)
      return mapped.kind === 'not_found'
        ? { kind: 'unknown', operationId: command.operationId }
        : mapped
    } catch {
      return { kind: 'unknown', operationId: command.operationId }
    }
  }
  async function change(value: unknown): Promise<AssetsMutationResult> {
    if (!withinBudget(value)) return fail('limit_exceeded')
    const parsed = mutationSchema.safeParse(value)
    return parsed.success ? commit(parsed.data) : fail('invalid_input')
  }
  async function read(kind: 'asset' | 'holding' | 'version', lookup: unknown) {
    const result = await options.storage.read({
      domain: options.domain,
      handler: HANDLER,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input: json({ kind, domain: options.domain, lookup }),
    })
    return result.kind === 'read'
      ? result.output
      : fail(
          result.kind === 'unavailable' && result.reason === 'closing' ? 'closing' : 'unavailable',
        )
  }
  return {
    readAsset: input =>
      run(async () => {
        const parsed = assetLookupSchema.safeParse(input)
        if (!parsed.success) return fail('invalid_input')
        const result = assetResultSchema.parse(await read('asset', parsed.data))
        if (
          result.kind === 'asset' &&
          (result.asset.assetRef !== parsed.data.assetRef ||
            !equal(result.asset.domain, options.domain))
        )
          return fail('unavailable')
        return result
      }),
    publish: input =>
      run(async () => {
        const command = publishCommand(options, input)
        return command.kind === 'rejected' ? command : commit(command)
      }),
    hold: input =>
      run(async () => {
        if (!withinBudget(input)) return fail('limit_exceeded')
        const parsed = holdSchema.safeParse(input)
        return parsed.success ? change({ kind: 'hold', ...parsed.data }) : fail('invalid_input')
      }),
    changeHolding: input =>
      run(async () => {
        if (!withinBudget(input)) return fail('limit_exceeded')
        const parsed = changeHoldingSchema.safeParse(input)
        return parsed.success
          ? change({ kind: 'changeHolding', ...parsed.data })
          : fail('invalid_input')
      }),
    readHolding: input =>
      run(async () => {
        const parsed = holdingLookupSchema.safeParse(input)
        return parsed.success
          ? holdingResultSchema.parse(await read('holding', parsed.data))
          : fail('invalid_input')
      }),
    readVersion: input =>
      run(async () => {
        const parsed = versionLookupSchema.safeParse(input)
        return parsed.success
          ? versionResultSchema.parse(await read('version', parsed.data))
          : fail('invalid_input')
      }),
    getOperation: operationId =>
      run(async () => {
        if (!SettingsIdSchema.safeParse(operationId).success) return fail('invalid_input')
        try {
          return receiptResult(
            await options.storage.query(identity(options.domain, operationId)),
            options.domain,
            operationId,
          )
        } catch {
          return { kind: 'unknown' as const, operationId }
        }
      }),
    close() {
      return (closed ??= Promise.allSettled(active).then(() => undefined))
    },
  }
}

import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { StorageDefect, type AtomicStorage } from '@omne-harness-lite/storage'
import { invalid, object, parseManifest } from '@omne-harness-lite/model-profile-directory'
import { isCredentialRef } from './records.ts'
import { CatalogImplementation, OperationOwner, sanitized } from './runtime.ts'
import { createCredentialBindingReader } from './tx-reads.ts'
import type { CredentialLookup, DiagnosticSink, OfficialManifest, ReadBoundReplicaIn } from '@omne-harness-lite/model-profile-directory'
import type { FactoryCredential, MembershipsRead, ModelProfileDirectoryConfig, LocalCredentialLookupConfig } from './types.ts'

import { ModelCatalogService, ModelCatalogReadService, CredentialLookupService, MODEL_CATALOG, MODEL_CATALOG_READ, CREDENTIAL_LOOKUP, BOUND_CREDENTIAL_REPLICA_READER, MODEL_DIRECTORY_DIAGNOSTICS, FACTORY_MODEL_CREDENTIAL } from '@omne-harness-lite/model-profile-directory/cordis'
import type { ModelCatalog, ModelCatalogRead } from '@omne-harness-lite/model-profile-directory'
export const MEMBERSHIPS_SERVICE = 'memberships'

function manifest(value: unknown): value is OfficialManifest {
  return !('failure' in parseManifest(value))
}
export const ModelProfileDirectoryConfigSchema = z
  .object({
    faceMode: z.enum(['management', 'singleProcessCatalog', 'developmentBaseFaces']),
    officialManifest: z.custom<OfficialManifest>(manifest, 'invalid official manifest'),
    factoryCredentialRef: z
      .custom<string>(isCredentialRef, 'invalid factory credential reference')
      .optional(),
  })
  .strict()
export const LocalCredentialLookupConfigSchema = z
  .object({
    mode: z.literal('localCredentialOnly'),

  })
  .strict()
function storage(value: unknown): value is AtomicStorage {
  return (
    object(value) &&
    typeof value.read === 'function' &&
    typeof value.write === 'function' &&
    typeof value.atomic === 'function'
  )
}
function clock(value: unknown): value is Clock {
  return object(value) && typeof value.now === 'function'
}
function memberships(value: unknown): value is MembershipsRead {
  return object(value) && typeof value.standing === 'function'
}
function actualStorage(ctx: Context): AtomicStorage {
  const value: unknown = ctx.get(STORAGE_SERVICE)
  if (!storage(value)) throw new StorageDefect('directory requires AtomicStorage')
  return value
}
function ownerFor(ctx: Context): OperationOwner {
  const logger = ctx.logger('model-profile-directory')
  const owner = new OperationOwner(
    { record(event) {
      const sink = ctx.get(MODEL_DIRECTORY_DIAGNOSTICS)
      if (sink) sink.record(event)
      else logger.info('directory %o', event)
    } },
    () => {
      try {
        logger.error('directory diagnostic sink failed')
      } catch {
        /* Both observation destinations failed; business facts remain authoritative. */
      }
    },
  )
  ctx.effect(() => () => owner.close())
  return owner
}
function unique(ctx: Context, keys: readonly string[]): void {
  for (const key of keys)
    if (ctx.get(key) !== undefined) throw new Error('duplicate directory service provider')
}

export const modelProfileDirectoryPlugin = definePlugin<ModelProfileDirectoryConfig>({
  name: 'model-profile-directory',
  inject: [STORAGE_SERVICE, CLOCK_SERVICE, MEMBERSHIPS_SERVICE],
  Config: ModelProfileDirectoryConfigSchema,
  async apply(ctx, config) {
    const keys =
      config.faceMode === 'management'
        ? [MODEL_CATALOG]
        : config.faceMode === 'singleProcessCatalog'
          ? [MODEL_CATALOG, MODEL_CATALOG_READ]
          : [MODEL_CATALOG, MODEL_CATALOG_READ, CREDENTIAL_LOOKUP]
    unique(ctx, keys)
    const actual = actualStorage(ctx),
      time: unknown = ctx.get(CLOCK_SERVICE),
      standing: unknown = ctx.get(MEMBERSHIPS_SERVICE)
    if (!clock(time) || !memberships(standing))
      throw new Error('directory clock or memberships mapping invalid')
    const owner = ownerFor(ctx)
    const catalog = new CatalogImplementation({
      storage: actual,
      clock: time,
      memberships: standing,
      owner,
      factoryConfigured: config.factoryCredentialRef !== undefined,
      notify: ref => {
        try {
          ctx.emit('profile.withdrawn', ref)
        } catch {
          owner.record({
            operation: 'profile.withdrawn',
            phase: 'notification',
            outcome: 'listener_failed',
          })
        }
      },
    })
    try {
      await catalog.ready()
      const loaded = await owner.execute('loadManifest', () =>
        catalog.loadManifest(config.officialManifest),
      )
      if ('failure' in loaded) {
        if (loaded.failure === 'manifestNotNewer')
          owner.record({ operation: 'loadManifest', phase: 'error', outcome: 'manifestNotNewer' })
        else throw new Error('official manifest could not be loaded')
      }
      new CatalogProvider(ctx, catalog.management)
      if (config.faceMode !== 'management') new CatalogReadProvider(ctx, catalog.read)
      if (config.faceMode === 'developmentBaseFaces') {
        const lookup: CredentialLookup = {
          value: (tenant, origin) =>
            owner.execute('value', async () => {
              if (
                !('ok' in parseTenantId(tenant)) ||
                (origin !== 'official' && origin !== 'custom')
              )
                return invalid()
              return { failure: 'unavailable' } as const
            }),
        }
        new CredentialProvider(ctx, lookup)
      }
    } catch (error) {
      throw sanitized(error)
    }
  },
})

export const localCredentialLookupPlugin = definePlugin<LocalCredentialLookupConfig>({
  name: 'model-catalog-local-credential',
  inject: [STORAGE_SERVICE, BOUND_CREDENTIAL_REPLICA_READER],
  Config: LocalCredentialLookupConfigSchema,
  async apply(ctx) {
    unique(ctx, [CREDENTIAL_LOOKUP])
    const actual = actualStorage(ctx)
    // Validate the real directory table before provide; migrations belong to assembly.
    const reader = createCredentialBindingReader(actual)
    await actual.read(async tx => {
      await tx.db
        .selectFrom('model_credential_binding')
        .select(['organization_id', 'account_id', 'credential_ref', 'bound_at'])
        .limit(0)
        .execute()
    })
    const owner = ownerFor(ctx)
    const lookup: CredentialLookup = {
      value: (tenantInput, origin) =>
        owner.execute('value', async () => {
          const tenant = parseTenantId(tenantInput)
          if (!('ok' in tenant) || (origin !== 'official' && origin !== 'custom')) return invalid()
          // Values are held privately until the outer unit has really committed.
          const selected = await actual.atomic(async unit => {
            const current = await reader(unit, tenant.ok)
            if ('absent' in current) return { absent: true } as const
            const replica = await ctx.boundCredentialReplicaReader.readIn(
              unit,
              tenant.ok,
              current.binding.credentialRef,
            )
            if (
              'body' in replica &&
              (!(replica.body instanceof Uint8Array) || replica.body.byteLength === 0)
            )
              throw new StorageDefect('replica reader returned malformed body')
            return { replica }
          })
          if ('replica' in selected)
            return 'body' in selected.replica
              ? { scope: { layer: 'tenant', tenant: tenant.ok }, value: selected.replica.body }
              : { failure: 'credentialUnavailable' }
          const factoryReader = ctx.get(FACTORY_MODEL_CREDENTIAL)
          if (origin === 'custom' || factoryReader === undefined)
            return { failure: 'credentialUnavailable' }
          const factory = await factoryReader.read()
          if ('failure' in factory) return factory
          if ('absent' in factory) return { failure: 'credentialUnavailable' }
          if (!(factory.body instanceof Uint8Array) || factory.body.byteLength === 0)
            throw new StorageDefect('factory credential provider returned malformed body')
          return { scope: { layer: 'factory' }, value: factory.body }
        }),
    }
    new CredentialProvider(ctx, lookup)
  },
})
export type { ModelProfileDirectoryConfig, LocalCredentialLookupConfig } from './types.ts'

class CatalogProvider extends ModelCatalogService {
  constructor(ctx: Context, private readonly operations: ModelCatalog) { super(ctx) }
  readProfile(...args: Parameters<ModelCatalog['readProfile']>) { return this.operations.readProfile(...args) }
  listProfiles(...args: Parameters<ModelCatalog['listProfiles']>) { return this.operations.listProfiles(...args) }
  credentialPresent(...args: Parameters<ModelCatalog['credentialPresent']>) { return this.operations.credentialPresent(...args) }
  registerProfile(...args: Parameters<ModelCatalog['registerProfile']>) { return this.operations.registerProfile(...args) }
  updateProfile(...args: Parameters<ModelCatalog['updateProfile']>) { return this.operations.updateProfile(...args) }
  withdrawProfile(...args: Parameters<ModelCatalog['withdrawProfile']>) { return this.operations.withdrawProfile(...args) }
  relistProfile(...args: Parameters<ModelCatalog['relistProfile']>) { return this.operations.relistProfile(...args) }
  bindCredential(...args: Parameters<ModelCatalog['bindCredential']>) { return this.operations.bindCredential(...args) }
  unbindCredential(...args: Parameters<ModelCatalog['unbindCredential']>) { return this.operations.unbindCredential(...args) }
}

class CatalogReadProvider extends ModelCatalogReadService {
  constructor(ctx: Context, private readonly operations: ModelCatalogRead) { super(ctx) }
  readProfile(...args: Parameters<ModelCatalogRead['readProfile']>) { return this.operations.readProfile(...args) }
  listProfiles(...args: Parameters<ModelCatalogRead['listProfiles']>) { return this.operations.listProfiles(...args) }
  credentialPresent(...args: Parameters<ModelCatalogRead['credentialPresent']>) { return this.operations.credentialPresent(...args) }
}

class CredentialProvider extends CredentialLookupService {
  constructor(ctx: Context, private readonly operations: CredentialLookup) { super(ctx) }
  value(...args: Parameters<CredentialLookup['value']>) { return this.operations.value(...args) }
}

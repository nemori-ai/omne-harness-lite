import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { StorageDefect, type AtomicStorage } from '@omne-harness-lite/storage'
import { invalid, object, parseManifest } from './input.ts'
import { isCredentialRef } from './records.ts'
import { CatalogImplementation, OperationOwner, sanitized } from './runtime.ts'
import { createCredentialBindingReader } from './tx-reads.ts'
import type {
  CredentialLookup,
  DiagnosticSink,
  FactoryCredential,
  MembershipsRead,
  ModelProfileDirectoryConfig,
  LocalCredentialLookupConfig,
  OfficialManifest,
  ReadBoundReplicaIn,
} from './types.ts'

export const MODEL_CATALOG_SERVICE = 'modelCatalog'
export const MODEL_CATALOG_READ_SERVICE = 'modelCatalogRead'
export const CREDENTIAL_LOOKUP_SERVICE = 'credentialLookup'
export const STORAGE_SERVICE = 'storage'
export const CLOCK_SERVICE = 'clock'
export const MEMBERSHIPS_SERVICE = 'memberships'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'profile.withdrawn': (ref: import('@omne-harness-lite/model-profile').ModelProfileRef) => void
  }
}
function manifest(value: unknown): value is OfficialManifest {
  return !('failure' in parseManifest(value))
}
function replicaReader(value: unknown): value is ReadBoundReplicaIn {
  return typeof value === 'function'
}
function factoryReader(value: unknown): value is FactoryCredential {
  return typeof value === 'function'
}
function diagnostic(value: unknown): value is DiagnosticSink {
  return object(value) && typeof value.record === 'function'
}
export const ModelProfileDirectoryConfigSchema = z
  .object({
    faceMode: z.enum(['management', 'singleProcessCatalog', 'developmentBaseFaces']),
    officialManifest: z.custom<OfficialManifest>(manifest, 'invalid official manifest'),
    factoryCredentialRef: z
      .custom<string>(isCredentialRef, 'invalid factory credential reference')
      .optional(),
    diagnostics: z.custom<DiagnosticSink>(diagnostic, 'invalid diagnostic sink').optional(),
  })
  .strict()
export const LocalCredentialLookupConfigSchema = z
  .object({
    mode: z.literal('localCredentialOnly'),
    readBoundReplicaIn: z.custom<ReadBoundReplicaIn>(
      replicaReader,
      'a borrowed model replica reader is required',
    ),
    factoryCredential: z
      .custom<FactoryCredential>(factoryReader, 'invalid factory credential provider')
      .optional(),
    diagnostics: z.custom<DiagnosticSink>(diagnostic, 'invalid diagnostic sink').optional(),
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
function ownerFor(ctx: Context, sink: DiagnosticSink | undefined): OperationOwner {
  const logger = ctx.logger('model-profile-directory')
  const owner = new OperationOwner(
    sink ?? { record: event => logger.info('directory %o', event) },
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
        ? [MODEL_CATALOG_SERVICE]
        : config.faceMode === 'singleProcessCatalog'
          ? [MODEL_CATALOG_SERVICE, MODEL_CATALOG_READ_SERVICE]
          : [MODEL_CATALOG_SERVICE, MODEL_CATALOG_READ_SERVICE, CREDENTIAL_LOOKUP_SERVICE]
    unique(ctx, keys)
    const actual = actualStorage(ctx),
      time: unknown = ctx.get(CLOCK_SERVICE),
      standing: unknown = ctx.get(MEMBERSHIPS_SERVICE)
    if (!clock(time) || !memberships(standing))
      throw new Error('directory clock or memberships mapping invalid')
    const owner = ownerFor(ctx, config.diagnostics)
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
      ctx.provide(MODEL_CATALOG_SERVICE, catalog.management)
      if (config.faceMode !== 'management') ctx.provide(MODEL_CATALOG_READ_SERVICE, catalog.read)
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
        ctx.provide(CREDENTIAL_LOOKUP_SERVICE, lookup)
      }
    } catch (error) {
      throw sanitized(error)
    }
  },
})

export const localCredentialLookupPlugin = definePlugin<LocalCredentialLookupConfig>({
  name: 'model-catalog-local-credential',
  inject: [STORAGE_SERVICE],
  Config: LocalCredentialLookupConfigSchema,
  async apply(ctx, config) {
    unique(ctx, [CREDENTIAL_LOOKUP_SERVICE])
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
    const owner = ownerFor(ctx, config.diagnostics)
    const lookup: CredentialLookup = {
      value: (tenantInput, origin) =>
        owner.execute('value', async () => {
          const tenant = parseTenantId(tenantInput)
          if (!('ok' in tenant) || (origin !== 'official' && origin !== 'custom')) return invalid()
          // Values are held privately until the outer unit has really committed.
          const selected = await actual.atomic(async unit => {
            const current = await reader(unit, tenant.ok)
            if ('absent' in current) return { absent: true } as const
            const replica = await config.readBoundReplicaIn(
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
          if (origin === 'custom' || config.factoryCredential === undefined)
            return { failure: 'credentialUnavailable' }
          const factory = await config.factoryCredential()
          if ('failure' in factory) return factory
          if ('absent' in factory) return { failure: 'credentialUnavailable' }
          if (!(factory.body instanceof Uint8Array) || factory.body.byteLength === 0)
            throw new StorageDefect('factory credential provider returned malformed body')
          return { scope: { layer: 'factory' }, value: factory.body }
        }),
    }
    ctx.provide(CREDENTIAL_LOOKUP_SERVICE, lookup)
  },
})
export type { ModelProfileDirectoryConfig, LocalCredentialLookupConfig } from './types.ts'

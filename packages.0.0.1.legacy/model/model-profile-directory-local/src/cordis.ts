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
import { OperationOwner, sanitized } from './runtime.ts'
import { createLocalModelDirectory } from './local.ts'
import { createLocalCredentialLookup } from './local-credentials.ts'
import type {
  CredentialLookup,
  DiagnosticSink,
  OfficialManifest,
} from '@omne-harness-lite/model-profile-directory'
import type {
  MembershipsRead,
  ModelProfileDirectoryConfig,
  LocalCredentialLookupConfig,
} from './types.ts'

import {
  ModelCatalogService,
  ModelCatalogReadService,
  CredentialLookupService,
  MODEL_CATALOG,
  MODEL_CATALOG_READ,
  CREDENTIAL_LOOKUP,
  BOUND_CREDENTIAL_REPLICA_READER,
  MODEL_DIRECTORY_DIAGNOSTICS,
  FACTORY_MODEL_CREDENTIAL,
} from '@omne-harness-lite/model-profile-directory/cordis'
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
function observersFor(ctx: Context) {
  const logger = ctx.logger('model-profile-directory')
  const diagnostics: DiagnosticSink = {
    record(event) {
      const sink = ctx.get(MODEL_DIRECTORY_DIAGNOSTICS)
      if (sink) sink.record(event)
      else logger.info('directory %o', event)
    },
  }
  const onDiagnosticFailure = () => {
    try {
      logger.error('directory diagnostic sink failed')
    } catch {
      /* Business facts remain authoritative if both observation destinations fail. */
    }
  }
  return { diagnostics, onDiagnosticFailure }
}
function ownerFor(ctx: Context): OperationOwner {
  const observers = observersFor(ctx)
  const owner = new OperationOwner(observers.diagnostics, observers.onDiagnosticFailure)
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
    const directory = createLocalModelDirectory({
      storage: actual,
      clock: time,
      memberships: standing,
      ...observersFor(ctx),
      manifest: config.officialManifest,
      factoryConfigured: config.factoryCredentialRef !== undefined,
      withdrawn: ref => {
        ctx.emit('profile.withdrawn', ref)
      },
    })
    ctx.effect(() => () => directory.close())
    try {
      const catalog = await directory.ready
      new CatalogProvider(ctx, catalog)
      if (config.faceMode !== 'management') new CatalogReadProvider(ctx, catalog)
      if (config.faceMode === 'developmentBaseFaces') {
        const owner = ownerFor(ctx)
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
    const lookup = createLocalCredentialLookup({
      storage: actualStorage(ctx),
      ...observersFor(ctx),
      readBoundReplicaIn: (unit, tenant, ref) =>
        ctx.boundCredentialReplicaReader.readIn(unit, tenant, ref),
      factoryCredential: async () => {
        const reader = ctx.get(FACTORY_MODEL_CREDENTIAL)
        return reader === undefined ? { absent: true } : reader.read()
      },
    })
    ctx.effect(() => () => lookup.close())
    new CredentialProvider(ctx, await lookup.ready)
  },
})
export type { ModelProfileDirectoryConfig, LocalCredentialLookupConfig } from './types.ts'

class CatalogProvider extends ModelCatalogService {
  constructor(
    ctx: Context,
    private readonly operations: ModelCatalog,
  ) {
    super(ctx)
  }
  readProfile(...args: Parameters<ModelCatalog['readProfile']>) {
    return this.operations.readProfile(...args)
  }
  listProfiles(...args: Parameters<ModelCatalog['listProfiles']>) {
    return this.operations.listProfiles(...args)
  }
  credentialPresent(...args: Parameters<ModelCatalog['credentialPresent']>) {
    return this.operations.credentialPresent(...args)
  }
  registerProfile(...args: Parameters<ModelCatalog['registerProfile']>) {
    return this.operations.registerProfile(...args)
  }
  updateProfile(...args: Parameters<ModelCatalog['updateProfile']>) {
    return this.operations.updateProfile(...args)
  }
  withdrawProfile(...args: Parameters<ModelCatalog['withdrawProfile']>) {
    return this.operations.withdrawProfile(...args)
  }
  relistProfile(...args: Parameters<ModelCatalog['relistProfile']>) {
    return this.operations.relistProfile(...args)
  }
  bindCredential(...args: Parameters<ModelCatalog['bindCredential']>) {
    return this.operations.bindCredential(...args)
  }
  unbindCredential(...args: Parameters<ModelCatalog['unbindCredential']>) {
    return this.operations.unbindCredential(...args)
  }
}

class CatalogReadProvider extends ModelCatalogReadService {
  constructor(
    ctx: Context,
    private readonly operations: ModelCatalogRead,
  ) {
    super(ctx)
  }
  readProfile(...args: Parameters<ModelCatalogRead['readProfile']>) {
    return this.operations.readProfile(...args)
  }
  listProfiles(...args: Parameters<ModelCatalogRead['listProfiles']>) {
    return this.operations.listProfiles(...args)
  }
  credentialPresent(...args: Parameters<ModelCatalogRead['credentialPresent']>) {
    return this.operations.credentialPresent(...args)
  }
}

class CredentialProvider extends CredentialLookupService {
  constructor(
    ctx: Context,
    private readonly operations: CredentialLookup,
  ) {
    super(ctx)
  }
  value(...args: Parameters<CredentialLookup['value']>) {
    return this.operations.value(...args)
  }
}

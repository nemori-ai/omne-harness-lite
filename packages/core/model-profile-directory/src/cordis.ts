import { Context, Service } from '@deepseek-ai/cordis'
import type { ModelCatalogRead as Operations0, ModelCatalog as Operations1, CredentialLookup as Operations2, DiagnosticSink as Operations3, BoundCredentialReplicaReader as Operations4 } from './index.ts'

/** @contract capability.model-profile-directory */
export abstract class ModelCatalogReadService extends Service implements Operations0 {
  static readonly provide = 'modelCatalogRead'
  constructor(ctx: Context) { super(ctx, ModelCatalogReadService.provide) }
  abstract readProfile(...args: Parameters<Operations0['readProfile']>): ReturnType<Operations0['readProfile']>
  abstract listProfiles(...args: Parameters<Operations0['listProfiles']>): ReturnType<Operations0['listProfiles']>
  abstract credentialPresent(...args: Parameters<Operations0['credentialPresent']>): ReturnType<Operations0['credentialPresent']>
}
export const MODEL_CATALOG_READ = ModelCatalogReadService.provide

/** @contract capability.model-profile-directory */
export abstract class ModelCatalogService extends Service implements Operations1 {
  static readonly provide = 'modelCatalog'
  constructor(ctx: Context) { super(ctx, ModelCatalogService.provide) }
  abstract readProfile(...args: Parameters<Operations1['readProfile']>): ReturnType<Operations1['readProfile']>
  abstract listProfiles(...args: Parameters<Operations1['listProfiles']>): ReturnType<Operations1['listProfiles']>
  abstract credentialPresent(...args: Parameters<Operations1['credentialPresent']>): ReturnType<Operations1['credentialPresent']>
  abstract registerProfile(...args: Parameters<Operations1['registerProfile']>): ReturnType<Operations1['registerProfile']>
  abstract updateProfile(...args: Parameters<Operations1['updateProfile']>): ReturnType<Operations1['updateProfile']>
  abstract withdrawProfile(...args: Parameters<Operations1['withdrawProfile']>): ReturnType<Operations1['withdrawProfile']>
  abstract relistProfile(...args: Parameters<Operations1['relistProfile']>): ReturnType<Operations1['relistProfile']>
  abstract bindCredential(...args: Parameters<Operations1['bindCredential']>): ReturnType<Operations1['bindCredential']>
  abstract unbindCredential(...args: Parameters<Operations1['unbindCredential']>): ReturnType<Operations1['unbindCredential']>
}
export const MODEL_CATALOG = ModelCatalogService.provide

/** @contract capability.model-profile-directory */
export abstract class CredentialLookupService extends Service implements Operations2 {
  static readonly provide = 'credentialLookup'
  constructor(ctx: Context) { super(ctx, CredentialLookupService.provide) }
  abstract value(...args: Parameters<Operations2['value']>): ReturnType<Operations2['value']>
}
export const CREDENTIAL_LOOKUP = CredentialLookupService.provide

/** @contract capability.model-profile-directory */
export abstract class ModelDirectoryDiagnosticsService extends Service implements Operations3 {
  static readonly provide = 'modelDirectoryDiagnostics'
  constructor(ctx: Context) { super(ctx, ModelDirectoryDiagnosticsService.provide) }
  abstract record(...args: Parameters<Operations3['record']>): ReturnType<Operations3['record']>
}
export const MODEL_DIRECTORY_DIAGNOSTICS = ModelDirectoryDiagnosticsService.provide

/** @contract capability.model-profile-directory */
export abstract class BoundCredentialReplicaReaderService extends Service implements Operations4 {
  static readonly provide = 'boundCredentialReplicaReader'
  constructor(ctx: Context) { super(ctx, BoundCredentialReplicaReaderService.provide) }
  abstract readIn(...args: Parameters<Operations4['readIn']>): ReturnType<Operations4['readIn']>
}
export const BOUND_CREDENTIAL_REPLICA_READER = BoundCredentialReplicaReaderService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelCatalogRead: ModelCatalogReadService
    modelCatalog: ModelCatalogService
    credentialLookup: CredentialLookupService
    modelDirectoryDiagnostics: ModelDirectoryDiagnosticsService
    boundCredentialReplicaReader: BoundCredentialReplicaReaderService
  }
}

import type { FactoryModelCredentialReader } from './index.ts'
/** @contract capability.model-profile-directory */
export abstract class FactoryModelCredentialService extends Service implements FactoryModelCredentialReader {
  static readonly provide = 'factoryModelCredential'
  constructor(ctx: Context) { super(ctx, FactoryModelCredentialService.provide) }
  abstract read(): ReturnType<FactoryModelCredentialReader['read']>
}
export const FACTORY_MODEL_CREDENTIAL = FactoryModelCredentialService.provide

declare module '@deepseek-ai/cordis' {
  interface Context { factoryModelCredential: FactoryModelCredentialService }
  interface Events {
    /** @mode emit Existing directory withdrawal notification. */
    'profile.withdrawn': (ref: import('@omne-harness-lite/model-profile').ModelProfileRef) => void
  }
}

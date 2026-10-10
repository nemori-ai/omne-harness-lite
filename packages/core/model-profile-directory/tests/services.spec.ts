import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  BOUND_CREDENTIAL_REPLICA_READER,
  BoundCredentialReplicaReaderService,
  CREDENTIAL_LOOKUP,
  CredentialLookupService,
  FACTORY_MODEL_CREDENTIAL,
  FactoryModelCredentialService,
  MODEL_CATALOG,
  MODEL_CATALOG_READ,
  MODEL_DIRECTORY_DIAGNOSTICS,
  ModelCatalogReadService,
  ModelCatalogService,
  ModelDirectoryDiagnosticsService,
} from '../src/cordis.ts'
import type { DirectoryDiagnostic } from '../src/index.ts'

const unavailable = async () => ({ failure: 'unavailable' as const })

// These providers exercise binding definitions, not directory storage or credential custody.
class CatalogReadFixture extends ModelCatalogReadService {
  readProfile = unavailable
  listProfiles = unavailable
  credentialPresent = unavailable
}
class CatalogFixture extends ModelCatalogService {
  readProfile = unavailable
  listProfiles = unavailable
  credentialPresent = unavailable
  registerProfile = unavailable
  updateProfile = unavailable
  withdrawProfile = unavailable
  relistProfile = unavailable
  bindCredential = unavailable
  unbindCredential = unavailable
}
class LookupFixture extends CredentialLookupService {
  value = unavailable
}
class DiagnosticsFixture extends ModelDirectoryDiagnosticsService {
  readonly entries: DirectoryDiagnostic[] = []
  record(event: DirectoryDiagnostic) {
    this.entries.push(event)
  }
}
class ReplicaFixture extends BoundCredentialReplicaReaderService {
  async readIn() {
    return { absent: true as const }
  }
}
class FactoryFixture extends FactoryModelCredentialService {
  async read() {
    return { absent: true as const }
  }
}

it('publishes exact public service keys and withdraws all six with their provider', async () => {
  const keys = [
    MODEL_CATALOG_READ,
    MODEL_CATALOG,
    CREDENTIAL_LOOKUP,
    MODEL_DIRECTORY_DIAGNOSTICS,
    BOUND_CREDENTIAL_REPLICA_READER,
    FACTORY_MODEL_CREDENTIAL,
  ]
  expect(keys).toEqual([
    'modelCatalogRead',
    'modelCatalog',
    'credentialLookup',
    'modelDirectoryDiagnostics',
    'boundCredentialReplicaReader',
    'factoryModelCredential',
  ])
  const ctx = new Context()
  for (const key of keys) expect(ctx.get(key)).toBeUndefined()
  const events: DirectoryDiagnostic[] = []
  const provider = await ctx.plugin(inner => {
    new CatalogReadFixture(inner)
    new CatalogFixture(inner)
    new LookupFixture(inner)
    const diagnostics = new DiagnosticsFixture(inner)
    inner.effect(() => () => {
      events.push(...diagnostics.entries)
    })
    new ReplicaFixture(inner)
    new FactoryFixture(inner)
  })
  try {
    expect(ctx.modelCatalogRead).toBeInstanceOf(CatalogReadFixture)
    expect(ctx.modelCatalog).toBeInstanceOf(CatalogFixture)
    expect(ctx.credentialLookup).toBeInstanceOf(LookupFixture)
    expect(ctx.modelDirectoryDiagnostics).toBeInstanceOf(DiagnosticsFixture)
    expect(ctx.boundCredentialReplicaReader).toBeInstanceOf(ReplicaFixture)
    expect(ctx.factoryModelCredential).toBeInstanceOf(FactoryFixture)
    const consumer = await ctx.plugin({
      inject: keys,
      async apply(inner) {
        expect(await inner.modelCatalogRead.readProfile(undefined, undefined)).toEqual({
          failure: 'unavailable',
        })
        expect(await inner.modelCatalog.listProfiles(undefined)).toEqual({ failure: 'unavailable' })
        expect(await inner.credentialLookup.value(undefined, undefined)).toEqual({
          failure: 'unavailable',
        })
        expect(await inner.factoryModelCredential.read()).toEqual({ absent: true })
        inner.modelDirectoryDiagnostics.record({
          operation: 'lookup',
          phase: 'finish',
          outcome: 'absent',
        })
      },
    })
    await consumer.dispose()
    for (const key of keys) expect(ctx.get(key)).toBeDefined()
  } finally {
    await provider.dispose()
  }
  for (const key of keys) expect(ctx.get(key)).toBeUndefined()
  expect(events).toEqual([{ operation: 'lookup', phase: 'finish', outcome: 'absent' }])
})

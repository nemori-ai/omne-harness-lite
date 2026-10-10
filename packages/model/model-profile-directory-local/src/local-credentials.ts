import { StorageDefect, StorageUnavailable, type AtomicStorage } from '@omne-harness-lite/storage'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import {
  invalid,
  type CredentialLookup,
  type DiagnosticSink,
  type ReadBoundReplicaIn,
} from '@omne-harness-lite/model-profile-directory'
import { createCredentialBindingReader } from './tx-reads.ts'
import { OperationOwner } from './runtime.ts'
import type { FactoryCredential } from './types.ts'

/** Restricted P-1r construction ports. Only the resulting CredentialLookup is borrowed by a runtime. */
export interface LocalCredentialLookupDependencies {
  readonly storage: AtomicStorage
  readonly readBoundReplicaIn: ReadBoundReplicaIn
  readonly factoryCredential?: FactoryCredential
  readonly diagnostics: DiagnosticSink
  readonly onDiagnosticFailure: () => void
}
/** Fixed source-pair checks and real outer commit precede every returned body. */
export function createLocalCredentialLookup(dependencies: LocalCredentialLookupDependencies) {
  const storage = dependencies.storage
  const reader = createCredentialBindingReader(storage)
  const readReplica = dependencies.readBoundReplicaIn
  const factoryCredential = dependencies.factoryCredential
  const owner = new OperationOwner(dependencies.diagnostics, dependencies.onDiagnosticFailure)
  const ready = owner
    .execute('initializeCredentialLookup', async () => {
      await storage.read(async tx => {
        await tx.db
          .selectFrom('model_credential_binding')
          .select(['organization_id', 'account_id', 'credential_ref', 'bound_at'])
          .limit(0)
          .execute()
      })
      return true
    })
    .then(result => {
      if (result !== true)
        throw new StorageUnavailable('credential lookup initialization unavailable')
      return Object.freeze(lookup)
    })
  const lookup: CredentialLookup = {
    value: (tenantInput, origin) =>
      owner.execute('value', async () => {
        const tenant = parseTenantId(tenantInput)
        if (!('ok' in tenant) || (origin !== 'official' && origin !== 'custom')) return invalid()
        const selected = await storage.atomic(async unit => {
          const current = await reader(unit, tenant.ok)
          if ('absent' in current) return { absent: true } as const
          const replica = await readReplica(unit, tenant.ok, current.binding.credentialRef)
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
        return factoryValue(origin)
      }),
  }
  async function factoryValue(
    origin: 'official' | 'custom',
  ): Promise<Awaited<ReturnType<CredentialLookup['value']>>> {
    if (origin === 'custom' || factoryCredential === undefined)
      return { failure: 'credentialUnavailable' }
    const factory = await factoryCredential()
    if ('failure' in factory) return factory
    if ('absent' in factory) return { failure: 'credentialUnavailable' }
    if (!(factory.body instanceof Uint8Array) || factory.body.byteLength === 0)
      throw new StorageDefect('factory credential provider returned malformed body')
    return { scope: { layer: 'factory' }, value: factory.body }
  }
  void ready.catch(() => {})
  return Object.freeze({ ready, close: () => owner.close() })
}

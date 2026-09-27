import { expectTypeOf } from 'vitest'
import { sealBody, openBody } from '@omne-harness-lite/credential-custodian-local'
import {
  createModelReplicaCustodian,
  type ModelReplicaOptions,
  type ReadBoundReplicaIn,
  type StoreBoundReplicaResult,
} from '@omne-harness-lite/credential-custodian-local/model-replica'
import { replicaMigrations } from '@omne-harness-lite/credential-custodian-local/migrations'
import type { AtomicStorage, MigrationFragment } from '@omne-harness-lite/storage'

expectTypeOf(replicaMigrations).toEqualTypeOf<readonly MigrationFragment[]>()
expectTypeOf<ReadBoundReplicaIn>().returns.resolves.toEqualTypeOf<
  { readonly body: Uint8Array } | { readonly absent: true }
>()
expectTypeOf<StoreBoundReplicaResult>().toEqualTypeOf<
  | {
      readonly stored: true
      readonly tenant: import('@omne-harness-lite/identity-values').TenantId
    }
  | { readonly stored: false }
  | { readonly failure: 'invalidInput' | 'custodianWithdrawn' | 'unavailable' }
>()
expectTypeOf(openBody).toBeFunction()
expectTypeOf(sealBody).toBeFunction()

function wrongStorage(
  options: ModelReplicaOptions,
  storage: Pick<AtomicStorage, 'read' | 'write'>,
) {
  // @ts-expect-error An ordinary storage cannot satisfy the participating factory.
  return createModelReplicaCustodian({ ...options, storage })
}
function borrowedClose(read: ReadBoundReplicaIn) {
  // @ts-expect-error The borrowed reader does not convey the owner's close right.
  return read.close()
}
function noGenericShell(options: ModelReplicaOptions) {
  return createModelReplicaCustodian(options).then(c => {
    // @ts-expect-error A model-only component has no generic/OAuth service methods.
    return c.resolve({})
  })
}
expectTypeOf(wrongStorage).toBeFunction()
expectTypeOf(borrowedClose).toBeFunction()
expectTypeOf(noGenericShell).toBeFunction()

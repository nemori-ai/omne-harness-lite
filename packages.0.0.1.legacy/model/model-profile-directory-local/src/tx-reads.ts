import { type AtomicStorage, StorageDefect } from '@omne-harness-lite/storage'
import { bindingKey, checkedTenant, readBinding } from './records.ts'
import type { ReadCredentialBindingIn } from './types.ts'
export type { ReadCredentialBindingIn } from './types.ts'

/** Restricted construction by trusted assembly; execution only by P-1r and CCL. */
export function createCredentialBindingReader(storage: AtomicStorage): ReadCredentialBindingIn {
  if (typeof storage.atomic !== 'function')
    throw new StorageDefect('binding reader requires AtomicStorage')
  return async (unit, tenant) =>
    unit.run(async () => {
      unit.assertStorage(storage)
      const checked = checkedTenant(tenant)
      await unit.mutate(tx => tx.lockRow('model_credential_binding', bindingKey(checked)))
      const binding = await unit.query(tx => readBinding(tx, checked))
      return binding === undefined ? { absent: true } : { binding }
    })
}

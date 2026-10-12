import type { Storage } from '@omne-harness-lite/storage'

// Provider-local projection only. This is not a tenant credential or a database-file identity.
const storageInstance = Symbol('storage-sql.instance')

export function attachStorageInstance(face: object, storage: Storage): void {
  Object.defineProperty(face, storageInstance, { value: storage })
}

export function isStorageInstance(expected: Storage, storage: Storage): boolean {
  if (expected === storage) return true
  try {
    return Reflect.get(expected, storageInstance) === storage
  } catch {
    // The unit's original mismatch path must poison even if the caller catches the failure.
    return false
  }
}

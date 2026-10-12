import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import type { AdmittedInputSourceDependencies } from './admitted-types.ts'
import { SourceUnavailable } from './data.ts'

export function createAuthorizedInputRead(
  storage: AtomicStorage,
  withUnit: AdmittedInputSourceDependencies['withAuthorizedUnit'],
) {
  return async <T>(read: (unit: StorageUnit) => Promise<T>): Promise<T> => {
    let invoked = false,
      original: T | undefined
    let callbackFailure: { error: unknown } | undefined
    const outcome = await withUnit(async unit => {
      if (invoked) {
        callbackFailure = {
          error: new TypeError('authorized input callback invoked more than once'),
        }
        throw callbackFailure.error
      }
      invoked = true
      try {
        unit.assertStorage(storage)
        original = await read(unit)
        return original
      } catch (error) {
        callbackFailure = { error }
        throw error
      }
    })
    if (callbackFailure) throw callbackFailure.error
    if ('unavailable' in outcome) throw new SourceUnavailable('current_authorization')
    if (!invoked || outcome.read !== original)
      throw new TypeError('authorized input source did not return its original unit result')
    return outcome.read
  }
}

import {
  narrow,
  StorageUnavailable,
  mapStorageError,
  type ReadTx,
  type Storage,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import type { TenantId } from '@omne-harness-lite/identity-values'
import { sessionValue, decodeTenant } from './values.ts'

export interface SessionTenancyDb {
  session_tenancy: { session: string; tenant: string }
}
export type HoldingTenantResult =
  | { readonly tenant: TenantId }
  | { readonly failure: 'invalidInput' | 'sessionNotFound' | 'unavailable' }
export interface SessionTenancyService {
  holdingTenant(session: unknown): Promise<HoldingTenantResult>
}
export interface SessionTenancyReader extends SessionTenancyService {
  participate(unit: StorageUnit): SessionTenancyService
  close(): Promise<void>
}
async function query(tx: ReadTx, session: string): Promise<HoldingTenantResult> {
  const row = await narrow<SessionTenancyDb>(tx)
    .selectFrom('session_tenancy')
    .select('tenant')
    .where('session', '=', session)
    .executeTakeFirst()
  return row === undefined ? { failure: 'sessionNotFound' } : { tenant: decodeTenant(row.tenant) }
}
export function createSessionTenancyReader(storage: Storage): SessionTenancyReader {
  let closed = false
  let inFlight = 0
  let closing: Promise<void> | undefined
  let drained: (() => void) | undefined
  async function admitted<T>(operation: () => Promise<T>): Promise<T> {
    if (closed) throw new StorageUnavailable('session tenancy reader withdrawn')
    inFlight++
    try {
      return await operation()
    } finally {
      inFlight--
      if (closed && inFlight === 0) drained?.()
    }
  }
  async function holdingTenant(value: unknown): Promise<HoldingTenantResult> {
    const session = sessionValue(value)
    if (session === undefined) return { failure: 'invalidInput' }
    try {
      return await admitted(() => storage.read(tx => query(tx, session)))
    } catch (error) {
      return mapStorageError(error, 'unavailable')
    }
  }
  return Object.freeze({
    holdingTenant,
    participate(unit: StorageUnit): SessionTenancyService {
      return Object.freeze({
        async holdingTenant(value: unknown): Promise<HoldingTenantResult> {
          unit.assertStorage(storage)
          return unit.run(async () => {
            const session = sessionValue(value)
            if (session === undefined) return { failure: 'invalidInput' }
            // Unavailability escapes run; an outer owner maps it only after the whole unit exits.
            return admitted(() => unit.query(tx => query(tx, session)))
          })
        },
      })
    },
    close(): Promise<void> {
      if (closing !== undefined) return closing
      closed = true
      closing =
        inFlight === 0
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              drained = resolve
            })
      return closing
    },
  })
}

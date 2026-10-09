import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import type { RunId } from '@omne-harness-lite/call-accounts'
import {
  parseTenantId,
  isOk,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SessionLifecycleStep } from '@omne-harness-lite/session-runtime-local'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
interface HeldWork {
  readonly scope: SessionScope
  readonly preparation: Preparation
  readonly token: object
  acknowledged: boolean
}
export interface SessionModelWorkOwner {
  /** Actual same-unit finish input. Missing ownership never means settled. */
  readonly readIn: (
    unit: StorageUnit,
    scope: SessionScope,
    run: RunId,
  ) => Promise<'settled' | 'pending' | 'unavailable'>
  /** Trusted host only, before invoking the original model segment. */
  readonly begin: (scope: SessionScope, preparation: Preparation) => object
  /** The host calls this only after the original task has actually completed custody and ACK. */
  readonly acknowledge: (token: object) => void
  /** Called only after reliable Run finish and journal return. */
  readonly release: (token: object) => void
}
/** Own volatile model jobs for this live root. It is not a recovery proof or ordinary service. */
export function createSessionModelWorkOwner(options: {
  readonly storage: AtomicStorage
  readonly tenant: TenantId
  readonly maxRecords: number
}): SessionModelWorkOwner {
  const parsed = parseTenantId(options.tenant)
  if (!isOk(parsed)) throw new TypeError('actual tenant binding required')
  if (!Number.isSafeInteger(options.maxRecords) || options.maxRecords < 1)
    throw new TypeError('bounded actual work owner required')
  const rows = new Map<object, HeldWork>()
  const tenant = Object.freeze(parsed.ok)
  const storage = options.storage,
    maxRecords = options.maxRecords
  function held(token: object) {
    const row = rows.get(token)
    if (!row) throw new TypeError('original model work token required')
    return row
  }
  return Object.freeze<SessionModelWorkOwner>({
    readIn: async (unit, scope, run) => {
      unit.assertStorage(storage)
      if (!tenantIdEquals(scope.tenant, tenant)) return 'unavailable'
      const original = [...rows.values()].filter(
        row => row.scope.session === scope.session && row.preparation.run === run,
      )
      if (original.length === 0) return 'unavailable'
      return original.every(row => row.acknowledged) ? 'settled' : 'pending'
    },
    begin: (scope, preparation) => {
      if (!tenantIdEquals(scope.tenant, tenant)) throw new TypeError('foreign model work')
      for (const row of rows.values()) {
        if (row.scope.session !== scope.session || row.preparation.call !== preparation.call)
          continue
        if (row.preparation !== preparation)
          throw new TypeError('original model preparation required')
        return row.token
      }
      if (rows.size >= maxRecords) throw new Error('model work owner capacity')
      const token = Object.freeze({})
      rows.set(token, {
        scope: Object.freeze({ tenant, session: scope.session }),
        preparation,
        token,
        acknowledged: false,
      })
      return token
    },
    acknowledge: token => {
      held(token).acknowledged = true
    },
    release: token => {
      if (!held(token).acknowledged) throw new TypeError('unacknowledged original work retained')
      rows.delete(token)
    },
  })
}

import type { AtomicStorage } from '@omne-harness-lite/storage'
import {
  parseTenantId,
  isOk,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SessionLifecycleStep } from '@omne-harness-lite/session-runtime'
import type { SessionDriverWorkOwner, SessionDriverWorkToken } from './driver-types.ts'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
interface HeldWork {
  readonly scope: SessionScope
  readonly preparation: Preparation
  readonly token: SessionDriverWorkToken
  completed: boolean
}
/** Live original responsibility only. Absence after release or restart is never a settlement proof. */
export function createSessionDriverWorkOwner(options: {
  readonly storage: AtomicStorage
  readonly tenant: TenantId
  readonly maxRecords: number
}): SessionDriverWorkOwner {
  const parsed = parseTenantId(options.tenant)
  if (!isOk(parsed)) throw new TypeError('actual tenant binding required')
  if (!Number.isSafeInteger(options.maxRecords) || options.maxRecords < 1)
    throw new TypeError('bounded actual work owner required')
  const rows = new Map<SessionDriverWorkToken, HeldWork>()
  const tenant = Object.freeze(parsed.ok)
  const storage = options.storage,
    maxRecords = options.maxRecords
  function held(token: SessionDriverWorkToken) {
    const row = rows.get(token)
    if (!row) throw new TypeError('original work token required')
    return row
  }
  return Object.freeze<SessionDriverWorkOwner>({
    readIn: async (unit, scope, run) => {
      unit.assertStorage(storage)
      if (!tenantIdEquals(scope.tenant, tenant)) return 'unavailable'
      const original = [...rows.values()].filter(
        row => row.scope.session === scope.session && row.preparation.run === run,
      )
      if (original.length === 0) return 'unavailable'
      return original.every(row => row.completed) ? 'settled' : 'pending'
    },
    begin: (scope, preparation) => {
      if (!tenantIdEquals(scope.tenant, tenant)) throw new TypeError('foreign original work')
      for (const row of rows.values()) {
        if (row.scope.session !== scope.session || row.preparation.call !== preparation.call)
          continue
        if (row.preparation !== preparation) throw new TypeError('original preparation required')
        return row.token
      }
      if (rows.size >= maxRecords) throw new Error('original work owner capacity')
      const token = Object.freeze(Object.create(null)) as SessionDriverWorkToken
      rows.set(token, {
        scope: Object.freeze({ tenant, session: scope.session }),
        preparation,
        token,
        completed: false,
      })
      return token
    },
    complete: token => {
      held(token).completed = true
    },
    release: token => {
      if (!held(token).completed) throw new TypeError('uncompleted original work retained')
      rows.delete(token)
    },
  })
}

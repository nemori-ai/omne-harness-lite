import type { ActingForTenantPrincipal, SystemPrincipal } from '@omne-harness/identity'

/** The `work.owner` of a principal that the login of this request produced (server-entry, ID-16). */
export const LOGIN_WORK_OWNER = 'identity-login'
/** The `work.owner` of a session work principal (AA runtime object table, DA4 §4.1). */
export const SESSION_WORK_OWNER = 'session'

/** The principal, classified by shape alone. The value is the very object that was given. */
type Classified =
  | Readonly<{ column: 'login' | 'work'; principal: ActingForTenantPrincipal }>
  | Readonly<{ column: 'system'; principal: SystemPrincipal }>

function recordOf(value: unknown): object | null {
  return typeof value === 'object' && value !== null ? value : null
}

function textMember(value: object, name: string): string | null {
  const member: unknown = Reflect.get(value, name)
  return typeof member === 'string' ? member : null
}

function isSystemShape(value: unknown): value is SystemPrincipal {
  const record = recordOf(value)
  return (
    record !== null &&
    textMember(record, 'kind') === 'system' &&
    textMember(record, 'component') !== null
  )
}

function isActingShape(value: unknown): value is ActingForTenantPrincipal {
  const record = recordOf(value)
  if (record === null || textMember(record, 'kind') !== 'acting-for-tenant') return false
  const work = recordOf(Reflect.get(record, 'work'))
  return (
    work !== null &&
    textMember(work, 'owner') !== null &&
    textMember(work, 'work') !== null &&
    isSystemShape(Reflect.get(record, 'actor')) &&
    Reflect.get(record, 'tenant') !== undefined
  )
}

/** Policy draft §2. A principal outside the three columns has no column. */
export function classify(value: unknown): Classified | null {
  if (isSystemShape(value)) return { column: 'system', principal: value }
  if (!isActingShape(value)) return null
  switch (value.work.owner) {
    case LOGIN_WORK_OWNER:
      return { column: 'login', principal: value }
    case SESSION_WORK_OWNER:
      return { column: 'work', principal: value }
    default:
      return null
  }
}

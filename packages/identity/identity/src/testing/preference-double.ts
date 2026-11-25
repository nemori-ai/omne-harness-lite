import type { Instant } from '@omne-harness/utc-instant'
import { ACCOUNT_PREFERENCE_LIMITS, type IdentityGovernance } from '../governance.ts'
import type { IdentityRecords } from './records.ts'

type Refused =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>
type Deps = Readonly<{
  begin(): Promise<Readonly<{ kind: 'read'; instant: Instant }> | Refused>
  caller(
    input: unknown,
    now: Instant,
    acting: boolean,
  ): Readonly<{ kind: 'caller'; account: unknown }> | Refused
  records: IdentityRecords
}>

const DENIED = Object.freeze({ kind: 'denied' as const })
const field = (input: unknown, name: string): unknown => (input as Record<string, unknown>)[name]

function preferences(
  deps: Deps,
): Pick<IdentityGovernance, 'readAccountPreference' | 'writeAccountPreference'> {
  const held = deps.records.preferences
  const owner = async (input: unknown) => {
    const time = await deps.begin()
    if (time.kind !== 'read') return time
    const who = deps.caller(input, time.instant, false)
    if (who.kind !== 'caller') return who
    const name = field(input, 'name')
    return typeof name === 'string' &&
      name.length > 0 &&
      name.length <= ACCOUNT_PREFERENCE_LIMITS.name
      ? { kind: 'key' as const, key: `${JSON.stringify(who.account)}\u0000${name}` }
      : DENIED
  }
  return {
    async readAccountPreference(input) {
      const found = await owner(input)
      if (found.kind !== 'key') return found
      const now = held.get(found.key)
      return Object.freeze({
        kind: 'succeeded',
        value: now?.value ?? null,
        revision: String(now?.revision ?? 0),
      })
    },
    async writeAccountPreference(input) {
      const found = await owner(input)
      if (found.kind !== 'key') return found
      const value = field(input, 'value')
      const fits =
        value === null ||
        (typeof value === 'string' && value.length <= ACCOUNT_PREFERENCE_LIMITS.value)
      if (!fits) return DENIED
      const now = held.get(found.key)?.revision ?? 0
      if (field(input, 'expected') !== String(now))
        return Object.freeze({ kind: 'conflict', revision: String(now) })
      held.set(found.key, { value: value as string | null, revision: now + 1 })
      return Object.freeze({ kind: 'succeeded', revision: String(now + 1) })
    },
  }
}

/** The rest of the double with the preferences of each account added, frozen. */
export function withPreferences(deps: Deps) {
  return <T extends object>(rest: T): Readonly<T & ReturnType<typeof preferences>> =>
    Object.freeze({ ...rest, ...preferences(deps) })
}

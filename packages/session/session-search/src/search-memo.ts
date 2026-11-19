import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionId, SessionRevision } from '@omne-harness/session-contract'
import type { FrozenCover } from './cursor.ts'
import type { Cover, CoverStamp } from './index-port.ts'
import type { LoggedSession, LogStamp } from './log-port.ts'

// What the last page of a tenant read of the covers and of the log heads. Both only move on, so
// equal stamps mean nothing moved, and what is remembered is what a read now would give.

export type Remembered = Readonly<{
  generation: number
  stamp: CoverStamp
  covered: ReadonlyMap<SessionId, Cover>
  heads: LogStamp
  sessions: readonly LoggedSession[]
  /** A cover past its log head: the index is broken. Otherwise the sessions behind their heads. */
  behind: readonly FrozenCover[] | 'broken'
}>

export type SearchMemo = Readonly<{
  get(tenant: TenantId): Remembered | undefined
  set(tenant: TenantId, value: Remembered): void
}>

export const sameStamp = (
  left: Readonly<Record<string, string | number>>,
  right: Readonly<Record<string, string | number>>,
): boolean => Object.keys(left).every(key => left[key] === right[key])

export function headsOf(sessions: readonly LoggedSession[]): LogStamp {
  let total = 0n
  let archived = 0
  for (const item of sessions) {
    total += BigInt(item.tail)
    if (item.archived) archived += 1
  }
  return { sessions: sessions.length, total: total.toString(), archived }
}

const NO_COVER: Cover = { through: '0' as SessionRevision, at: 0 }

export function behindOf(
  sessions: readonly LoggedSession[],
  covered: ReadonlyMap<SessionId, Cover> | undefined,
): Remembered['behind'] {
  const behind: FrozenCover[] = []
  for (const { session, tail } of sessions) {
    const cover = covered?.get(session) ?? NO_COVER
    if (cover.through === tail) continue
    const [head, through] = [BigInt(tail), BigInt(cover.through)]
    if (through > head) return 'broken'
    behind.push([session, cover.through, cover.at])
  }
  return behind
}

/** A few tenants, the least lately used one dropped first. */
export function createSearchMemo(capacity = 64): SearchMemo {
  const held = new Map<string, Remembered>()
  return {
    get(tenant) {
      return held.get(JSON.stringify(tenant))
    },
    set(tenant, value) {
      const key = JSON.stringify(tenant)
      held.delete(key)
      held.set(key, value)
      if (held.size > capacity) held.delete(held.keys().next().value!)
    },
  }
}

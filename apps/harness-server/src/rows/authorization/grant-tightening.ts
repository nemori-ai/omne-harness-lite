// The operator's tightening of the maintenance grant table (R2-D204 item 2, IC-18). The table is
// built into the release: the operator can revoke one record or give it an end time, and nothing
// else. A record id outside the table, or a member beyond `revoked` and `expiresAt` (purposes,
// principal, scope), fails the configuration, so the row does not start. The end time is judged by
// the injected clock, never by the system time. This file holds no table of its own.
import { z } from 'zod'
import type { SystemActionClock } from '@omne-harness/authorization'
import type { IdentityClock } from '@omne-harness/identity'
import { compareInstants, parseInstant } from '@omne-harness/utc-instant'
import { MAINTENANCE_GRANTS, type GrantHolder, type ReleaseGrant } from './grants.ts'

const tightening = z
  .strictObject({
    revoked: z.literal(true).optional(),
    expiresAt: z
      .string()
      .refine(text => parseInstant(text).ok, {
        message: 'expiresAt must be a UTC instant such as 2027-01-01T00:00:00Z',
      })
      .optional(),
  })
  .refine(value => value.revoked !== undefined || value.expiresAt !== undefined, {
    message: 'a tightening must revoke the grant (`revoked: true`) or set `expiresAt`',
  })
  .readonly()

function knownRecords(table: Readonly<Record<GrantHolder, ReleaseGrant>>): string[] {
  return Object.values(table).map(grant => grant.record)
}

/**
 * The row configuration `maintenanceGrants`: tightenings by record id (`maintenance-grant/<component>`
 * as the read port reports it). Absent or empty means the table as released.
 */
export const maintenanceGrantsSchema = z
  .custom<object>(value => typeof value === 'object' && value !== null && !Array.isArray(value), {
    message: 'maintenanceGrants must be an object of tightenings by record id',
  })
  // The keys are read from the raw object: a key such as `__proto__` is not dropped by the record
  // parser below, it is named and refused here.
  .superRefine((value, ctx) => {
    const known = knownRecords(MAINTENANCE_GRANTS)
    for (const key of Object.getOwnPropertyNames(value)) {
      if (!known.includes(key))
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `unknown maintenance grant "${key}"; an operator can only tighten a grant of the release table: ${known.join(', ')}`,
        })
    }
  })
  .pipe(z.record(z.string(), tightening))
  .readonly()

export type MaintenanceGrantsConfig = z.output<typeof maintenanceGrantsSchema>

/**
 * The release table with the operator's tightening: a record named by the configuration gets
 * `revoked: true` and/or `expiresAt`; every other member of every record is the release value. An
 * empty configuration returns the release table itself. A record id outside the table throws.
 */
export function tightenMaintenanceGrants(
  config: MaintenanceGrantsConfig | undefined,
  builtin: Readonly<Record<GrantHolder, ReleaseGrant>> = MAINTENANCE_GRANTS,
): Readonly<Record<GrantHolder, ReleaseGrant>> {
  const entries = Object.entries(config ?? {})
  if (entries.length === 0) return builtin
  const known = knownRecords(builtin)
  for (const [key] of entries) {
    if (!known.includes(key)) throw new Error(`unknown maintenance grant "${key}"`)
  }
  const tightened = Object.entries(builtin).map(([holder, grant]) => {
    const change = Object.hasOwn(config ?? {}, grant.record) ? config?.[grant.record] : undefined
    if (change === undefined) return [holder, grant] as const
    return [
      holder,
      Object.freeze({
        ...grant,
        ...(change.revoked === true ? { revoked: true } : {}),
        ...(change.expiresAt === undefined ? {} : { expiresAt: change.expiresAt }),
      }),
    ] as const
  })
  return Object.freeze(Object.fromEntries(tightened)) as Readonly<Record<GrantHolder, ReleaseGrant>>
}

/**
 * The system action clock over the injected clock. An end time is reached when the reading of
 * `now` is at or after it. A clock that cannot answer, or an end time that is not an instant, is
 * `unavailable`, never reached and never pending.
 */
export function grantClockOf(clock: IdentityClock): SystemActionClock {
  return Object.freeze({
    reached: async (expiresAt: string) => {
      const end = parseInstant(expiresAt)
      if (!end.ok)
        return Object.freeze({
          kind: 'unavailable' as const,
          diagnostic: `end time is not an instant: ${end.failure.kind}`,
        })
      const reading = await clock.now()
      if (reading.kind !== 'read')
        return Object.freeze({ kind: 'unavailable' as const, diagnostic: reading.diagnostic })
      return Object.freeze({
        kind:
          compareInstants(reading.instant, end.value) >= 0
            ? ('reached' as const)
            : ('pending' as const),
      })
    },
  })
}

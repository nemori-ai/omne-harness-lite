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

export const maintenanceGrantsSchema = z
  .custom<object>(value => typeof value === 'object' && value !== null && !Array.isArray(value), {
    message: 'maintenanceGrants must be an object of tightenings by record id',
  })
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

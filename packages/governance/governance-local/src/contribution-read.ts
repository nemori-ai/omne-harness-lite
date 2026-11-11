import { z } from 'zod'
import {
  GovernanceContributionRefSchema,
  GovernanceIdSchema,
} from '@omne-harness/governance-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { equal, json, scopeKey } from './encoding.ts'
import { readScope } from './scope.ts'

export const CONTRIBUTION_HANDLER = {
  handler: 'governance.contribution-state',
  protocol: 'governance-contribution-state/1',
}
export const contributionReadSchema = z.strictObject({
  contribution: GovernanceContributionRefSchema,
  principalRef: GovernanceIdSchema,
})
const stateSchema = z.enum(['active', 'closing', 'released'])
export const contributionReadingSchema = z.discriminatedUnion('kind', [
  contributionReadSchema.extend({ kind: z.literal('found'), state: stateSchema }),
  z.strictObject({ kind: z.literal('denied') }),
])
export default {
  ...CONTRIBUTION_HANDLER,
  read(raw, port) {
    const input = contributionReadSchema.parse(raw)
    const ref = input.contribution
    const row = port.execute(
      'SELECT contributor_id,generation,registrar_ref,epoch,state FROM gc_contribution WHERE scope_key=? AND registration_id=? LIMIT 1',
      [scopeKey(ref.scope), ref.registrationId],
    ).rows[0]
    if (!row || !equal(row.slice(0, 3), [ref.contributorId, ref.generation, input.principalRef]))
      return { kind: 'read', output: { kind: 'denied' } }
    const current = readScope(port, ref.scope)
    if (!current) throw new Error('Missing contribution scope')
    const state = stateSchema.parse(row[4])
    return {
      kind: 'read',
      output: json({
        ...input,
        kind: 'found',
        state: current.epoch === row[3] ? state : 'released',
      }),
    }
  },
} satisfies ReadHandlerModule

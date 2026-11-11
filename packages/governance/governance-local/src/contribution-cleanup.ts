import { z } from 'zod'
import { GovernanceIdSchema } from '@omne-harness/governance-contract'
import { bindingSchema, type PublicOperationBinding } from './operation-schema.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import type { GovernanceStandingCoordinator } from './standing-coordinator.ts'
import { equal } from './encoding.ts'
import { isTerminal } from './registrar-results.ts'

const retiredSchema = z.strictObject({
  kind: z.literal('retired'),
  binding: bindingSchema,
  epoch: GovernanceIdSchema,
})

export class GovernanceContributionCleanup {
  private readonly sql: SqlOperationCoordinator
  private readonly standing: GovernanceStandingCoordinator

  constructor(sql: SqlOperationCoordinator, standing: GovernanceStandingCoordinator) {
    this.sql = sql
    this.standing = standing
  }

  async finish(
    binding: PublicOperationBinding,
    callsSettled: boolean,
  ): Promise<'complete' | 'retry' | 'calls'> {
    const result = await this.sql.retireContribution(binding)
    if (result.kind === 'conflict') return callsSettled ? 'complete' : 'calls'
    if (result.kind === 'absent') {
      if (!callsSettled) return 'calls'
      return (await this.sql.uncommittedAcceptance(binding.ref)).kind === 'not-committed'
        ? 'complete'
        : 'retry'
    }
    if (result.kind !== 'applied') return 'retry'
    return this.settle(binding, result.response, callsSettled)
  }

  private async settle(
    binding: PublicOperationBinding,
    response: unknown,
    callsSettled: boolean,
  ): Promise<'complete' | 'retry' | 'calls'> {
    const retired = retiredSchema.safeParse(response)
    if (!retired.success || !equal(retired.data.binding, binding)) return 'retry'
    const current = await this.sql.observe(binding)
    if (
      current.kind !== 'found' ||
      !isTerminal(current.record) ||
      current.record.epoch !== retired.data.epoch
    )
      return 'retry'
    if (!callsSettled) return 'calls'
    const custody = await this.standing.settle(binding)
    return custody.kind === 'settled' || custody.kind === 'unplanned' ? 'complete' : 'retry'
  }
}

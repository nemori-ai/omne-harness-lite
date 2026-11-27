import type { Context } from '@deepseek-ai/cordis'
import { goalsKey, type GoalsService } from '@omne-harness/goal-cordis-contract/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

type Asker = Readonly<{ principal: unknown; tenant: TenantId }>

/** Whether a session examines for a goal that is not settled, as the goal domain answers the work of that session. Undefined: no goal services are here, so no session does either thing with a goal. */
export async function examiningOf(
  ctx: Context,
  asker: Asker,
  session: string,
): Promise<Outcome<boolean | undefined, string>> {
  const goals = ctx.get(goalsKey) as GoalsService | undefined
  const tenant = tenantCodec.encode(asker.tenant)
  if (goals === undefined || !tenant.ok) return succeed(undefined)
  const caller = { tenant: tenant.value, subject: asker.principal }
  const answer = await goals.examines(caller, { examiner: session })
  return answer.kind === 'done'
    ? succeed(answer.value)
    : fail(`whether the session examines for a goal cannot be read: ${answer.kind}`)
}

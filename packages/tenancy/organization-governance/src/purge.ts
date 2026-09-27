// organization-purge 服务面：只承 S-53 清除未激活账号的个人组织。单独一个服务名，只给清除链解析
// （S-42 第 4 行装配给；调用点限制由 tools/ts-checks 的 restricted-call-sites 守）。
import {
  type AccountId,
  type HandoffWarrant,
  handoffWarrant,
  isOk,
  parseAccountId,
} from '@omne-harness-lite/identity-values'
import { type Outcome, fail, succeed } from '@omne-harness-lite/kernel-basis'
import { db, readOrganizationOwnedBy } from './records.ts'
import { type Deps, type OperationContext, readAccountFacts, withOperation } from './runtime.ts'
import type { OrganizationPurgeService, PurgePersonalOrganizationFailure } from './types.ts'

type PurgeOutcome = Outcome<{ readonly warrant: HandoffWarrant }, PurgePersonalOrganizationFailure>

/** 清除依据只在 `ok` 路径签发（含两路幂等）；断言的只有一件事：这个 AccountId 的个人组织已不存在。 */
function warrantFor(deps: OperationContext, account: AccountId): PurgeOutcome {
  return succeed({ warrant: handoffWarrant.issue(deps.config.purgeSigningKey, 'purge', account) })
}

/**
 * 求值次序固定（②）：表示层 → 读账号 → 读组织。账号读面在本节点事务之外调用（它自己是 AI 的一次提交，
 * 并在账号行上落盘「已过期」这个单调事实）；之后的判定与删除在一次受 S-17 序列化的写提交里。
 */
async function purgePersonalOrganization(
  deps: OperationContext,
  accountInput: unknown,
): Promise<PurgeOutcome> {
  const parsed = parseAccountId(accountInput)
  if (!isOk(parsed)) return fail('invalidInput')
  const account = parsed.ok

  const facts = await readAccountFacts(deps, account)
  // ⑧ storage-unavailable（没有结论）只能失败：不清除、不产出依据，绝不当成「不存在／未激活／已过期」往下走
  if ('failure' in facts && facts.failure !== 'accountDoesNotExist') return facts

  if ('failure' in facts) {
    // ②乙 账号读不到（account-not-found 是成立的结论）：不在这一步失败，继续读组织
    const outcome = await deps.query(async tx => {
      const organization = await readOrganizationOwnedBy(db(tx), account)
      return succeed(organization?.id)
    })
    // ⑦乙 两样都不在了：一次重扫，依据断言的事实此刻为真
    if (outcome.ok === undefined) return warrantFor(deps, account)
    // 缺陷观测支：「个人组织存在 ⇒ 账号记录存在」已被破。不删、不产依据、必须可观测（不折进 unavailable）
    deps.logger.error(
      'purge: personal organization %s is still present but its account %s no longer exists (invariant broken: organization outlived its account)',
      outcome.ok,
      account,
    )
    return fail('accountDoesNotExist')
  }

  // ②甲 两条现读都是硬拒绝：已激活 ⇒ 终止；未过期 ⇒ 不替调用方相信「该清了」
  if (facts.ok.activated) return fail('accountIsActivated')
  if (!facts.ok.retentionExpired) return fail('accountNotExpired')

  const outcome = await deps.mutate(async tx => {
    const d = db(tx)
    const organization = await readOrganizationOwnedBy(d, account)
    // ⑦甲 账号仍在、个人组织已不存在（被上一次清除掉）⇒ ok 并返回依据，无二次效果
    if (organization === undefined) return succeed(undefined)
    // ④ 受 S-17 序列化：删成员关系记录前锁组织行（R-3a）
    await tx.lockRow('organization', { organization_id: organization.id })
    // ③ 空真的守卫：由 AccountId 定位到的组织不是个人组织 ⇒ 拒绝、不删、不签（团队组织没有这条路径）
    if (organization.kind !== 'personal') return fail('organizationIsNotPersonal')
    // ④ 删组织行 ＋ 它那条唯一的成员关系记录，同一提交；有意不发 membership.changed
    await d.deleteFrom('membership').where('organization_id', '=', organization.id).execute()
    await d.deleteFrom('organization').where('organization_id', '=', organization.id).execute()
    return succeed(organization.id)
  })
  if ('failure' in outcome) return outcome
  if (outcome.ok !== undefined) {
    deps.notify('organization.purged', { organization: outcome.ok, ownerAccount: account })
  }
  return warrantFor(deps, account)
}

export function createOrganizationPurgeService(deps: Deps): OrganizationPurgeService {
  return {
    purgePersonalOrganization: accountId =>
      withOperation(deps, context => purgePersonalOrganization(context, accountId)),
  }
}

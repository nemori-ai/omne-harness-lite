import { RegistrationStopped } from '@omne-harness-lite/account-registration'
// 两条动作链的方法体：注册主链（契约 S-8）与未激活到期清除链（S-34）。
// 契约：packages/core/account-registration/SPEC.md；
// 节点设计：packages/tenancy/account-registration-sequential/SPEC.md Cordis 的投影」。
//
// 无状态、无存储、无锁、无事务：三步是三次跨 owner 的提交，正确性来自提交点位置（S-10）与三个幂等边界（S-9），
// 不来自「写在同一个函数里」。方法局部变量只活在一次调用内；每步之前问一次「本插件这一代是否仍在」（S-22），
// 不在了就停在当前位置返回，不清理、不补偿。参与方声明之外的异常原样上抛，没有 catch-all。
import type { AccountsService } from '@omne-harness-lite/account-identity'
import {
  type AccountId,
  type SigningKey,
  handoffWarrant,
  isOk,
  parseAccountId,
} from '@omne-harness-lite/identity-values'
import type {
  OrganizationPurgeService,
  OrganizationsService,
  PurgePersonalOrganizationFailure,
} from '@omne-harness-lite/organization-governance'
import type {
  AccountPurgeFailure,
  PurgeExpiredResult,
  PurgeFailureClass,
  RegistrationDefectRecord,
  RegistrationService,
  TerminalOutcome,
} from '@omne-harness-lite/account-registration'

/** 插件体交给方法体的全部依赖；三个服务面来自必需 inject 的快照，不在调用时重新解析。 */
export interface RegistrationDeps {
  readonly accounts: Pick<AccountsService, 'produce' | 'activate' | 'purge'>
  readonly organizations: Pick<OrganizationsService, 'createPersonal'>
  readonly organizationPurge: OrganizationPurgeService
  /** 本插件私有的 `activation` 签名私钥；只在 ② 成功返回之后用一次。 */
  readonly activationKey: SigningKey
  /** 本插件这一代是否仍在（fiber `ACTIVE` 且本代未被卸载）；每步之前读一次。 */
  readonly isActive: () => boolean
  /** 缺陷的可观测记录（映射表「另记什么」列）：不进返回值，不并入普通 `interrupted`。 */
  readonly recordDefect: (record: RegistrationDefectRecord) => void
}

type PurgeChainFailure = Exclude<PurgeExpiredResult, 'ok'>
type PurgeChainResult = 'ok' | PurgeChainFailure | { readonly stopped: 'purge-1' | 'purge-2' }

/** S-34 三分类，写死在这里、与发起者无关。 */
function classifyOrganizationPurge(failure: PurgePersonalOrganizationFailure): PurgeFailureClass {
  switch (failure) {
    case 'accountIsActivated':
    case 'accountNotExpired':
      return 'terminal'
    case 'organizationIsNotPersonal':
    case 'invalidInput':
    case 'accountDoesNotExist':
      return 'defect'
    case 'unavailable':
      return 'transient'
  }
}

function classifyAccountPurge(failure: AccountPurgeFailure): PurgeFailureClass {
  switch (failure) {
    case 'not-expired':
      return 'terminal'
    case 'purge-warrant-invalid':
    case 'invalid-input':
      return 'defect'
    case 'storage-unavailable':
      return 'transient'
  }
}

/**
 * 清除链的缺陷记录，两个发起者共用：缺陷型一律记；② 的 `not-expired` 在两个发起者下都不可达，出现即契约违反。
 * ① 的 `accountDoesNotExist` 是「个人组织存在 ⇒ 账号记录存在」被破的唯一运行期观测点（S-35），记为契约违反。
 */
function purgeDefect(
  failure: PurgeChainFailure,
  accountIdInput: unknown,
): RegistrationDefectRecord | undefined {
  const kind =
    failure.failure === 'not-expired' || failure.failure === 'accountDoesNotExist'
      ? 'contract-violation'
      : failure.class === 'defect'
        ? 'composition-defect'
        : undefined
  if (kind === undefined) return undefined
  // 记录里的 AccountId 只作关联；清扫交进来的值可能过不了表示层（那正是 invalidInput 这一支），那时不带
  const parsed = parseAccountId(accountIdInput)
  return {
    kind,
    step: failure.from === 'S-53' ? 'purge-1' : 'purge-2',
    failure: failure.failure,
    ...(isOk(parsed) ? { accountId: parsed.ok } : {}),
  }
}

export interface RegistrationInstance extends RegistrationService {
  close(): Promise<void>
}

export function createRegistrationService(dependencies: RegistrationDeps): RegistrationInstance {
  let live = true
  let closing: Promise<void> | undefined
  const inFlight = new Set<Promise<unknown>>()
  const deps: RegistrationDeps = {
    ...dependencies,
    isActive: () => live && dependencies.isActive(),
  }
  function track<T>(work: () => Promise<T>): Promise<T> {
    const { promise: result, resolve, reject } = Promise.withResolvers<T>()
    inFlight.add(result)
    result.then(
      () => inFlight.delete(result),
      () => inFlight.delete(result),
    )
    try {
      resolve(work())
    } catch (error) {
      reject(error)
    }
    return result
  }
  /** S-34：① S-53 → ② S-38。依据由 ① 产出、② 核实，本链只逐字携带；② 的入参只有 ① 的返回值。 */
  async function runPurgeChain(accountId: unknown): Promise<PurgeChainResult> {
    if (!deps.isActive()) return { stopped: 'purge-1' }
    const first = await deps.organizationPurge.purgePersonalOrganization(accountId)
    if ('failure' in first) {
      const failure: PurgeChainFailure = {
        from: 'S-53',
        failure: first.failure,
        class: classifyOrganizationPurge(first.failure),
      }
      const defect = purgeDefect(failure, accountId)
      if (defect !== undefined) deps.recordDefect(defect)
      return failure
    }
    if (!deps.isActive()) return { stopped: 'purge-2' }
    const second = await deps.accounts.purge(accountId, first.ok.warrant)
    if (!deps.isActive()) return { stopped: 'purge-2' }
    if (second !== 'ok') {
      const failure: PurgeChainFailure = {
        from: 'S-38',
        failure: second.failure,
        class: classifyAccountPurge(second.failure),
      }
      const defect = purgeDefect(failure, accountId)
      if (defect !== undefined) deps.recordDefect(defect)
      return failure
    }
    return 'ok'
  }

  /**
   * ① 产生账号（含撞上已过期记录时就地清除、重跑 ① 至多一次）。返回 AccountId，或本次尝试的终结结果。
   * `reran` 是方法局部变量，不是状态。
   */
  async function produce(
    loginIdentifier: unknown,
    presentedCredential: unknown,
  ): Promise<{ readonly accountId: AccountId } | { readonly outcome: TerminalOutcome }> {
    let reran = false
    for (;;) {
      if (!deps.isActive()) return { outcome: 'interrupted' }
      const produced = await deps.accounts.produce(loginIdentifier, presentedCredential)
      if ('ok' in produced) return { accountId: produced.ok }
      switch (produced.failure) {
        case 'identifier-taken':
          return { outcome: 'identifier-taken' }
        case 'credential-rejected':
          return { outcome: 'credential-rejected' }
        case 'invalid-input':
          // 表示层校验归注册入口（S-2）；交进来的收场是 interrupted，另记入口缺陷
          deps.recordDefect({ kind: 'entry-defect', step: 1, failure: produced.failure })
          return { outcome: 'interrupted' }
        case 'storage-unavailable':
          return { outcome: 'interrupted' }
        case 'identifier-held-by-expired-record': {
          // 重跑仍撞上已过期记录（窗口里又有一条过期了）⇒ interrupted，不循环（S-8「撞上一条已过期的记录」）
          if (reran) return { outcome: 'interrupted' }
          const purged = await runPurgeChain(produced.expiredRecord)
          if (purged !== 'ok') {
            // 主链这一列：终止型不可达（「已过期」单调、激活过不了 S-14 前置③），出现即契约违反；
            // ② 的 not-expired 已在清除链里记过。缺陷型已记；抖动型不记。三类都不重跑 ①
            if (!('stopped' in purged) && purged.from === 'S-53' && purged.class === 'terminal') {
              deps.recordDefect({
                kind: 'contract-violation',
                step: 'purge-1',
                failure: purged.failure,
                accountId: produced.expiredRecord,
              })
            }
            return { outcome: 'interrupted' }
          }
          reran = true
          continue
        }
      }
    }
  }

  async function register(
    loginIdentifier: unknown,
    presentedCredential: unknown,
  ): Promise<TerminalOutcome> {
    const first = await produce(loginIdentifier, presentedCredential)
    if ('outcome' in first) return first.outcome
    const { accountId } = first

    // ② 创建个人组织（含幂等返回既有的那一个）
    if (!deps.isActive()) return 'interrupted'
    const created = await deps.organizations.createPersonal(accountId)
    if ('failure' in created) {
      switch (created.failure) {
        case 'accountRecordExpired':
        case 'unavailable':
          return 'interrupted'
        case 'accountDoesNotExist':
        case 'invalidInput':
          // ② 的输入是本组合从 ① 拿到并逐字传递的 AccountId：被拒说明次序或携带坏了（期间跑过清除链的除外）
          deps.recordDefect({
            kind: 'composition-defect',
            step: 2,
            failure: created.failure,
            accountId,
          })
          return 'interrupted'
      }
    }

    // 激活依据只在 ② 成功返回之后产出（含幂等那一路），只绑定 AccountId；③ 只用这一份
    const activationWarrant = handoffWarrant.issue(deps.activationKey, 'activation', accountId)

    // ③ 激活：唯一提交点
    if (!deps.isActive()) return 'interrupted'
    const activated = await deps.accounts.activate(accountId, activationWarrant)
    if (!deps.isActive()) return 'interrupted'
    if (activated === 'ok') return 'registered'
    switch (activated.failure) {
      case 'account-record-expired':
      case 'storage-unavailable':
        return 'interrupted'
      case 'account-not-found':
      case 'warrant-invalid':
      case 'invalid-input':
        deps.recordDefect({
          kind: 'composition-defect',
          step: 3,
          failure: activated.failure,
          accountId,
        })
        return 'interrupted'
    }
  }

  async function purgeExpired(accountIdInput: unknown): Promise<PurgeExpiredResult> {
    // 表示层不在本节点判：原样交给 ①，不合格由 S-53 答 invalidInput（缺陷型），与主链同一条路径
    const result = await runPurgeChain(accountIdInput)
    if (result !== 'ok' && 'stopped' in result) throw new RegistrationStopped(result.stopped)
    return result
  }

  return {
    register: (...args) => track(() => register(...args)),
    purgeExpired: (...args) => track(() => purgeExpired(...args)),
    close() {
      if (closing) return closing
      live = false
      closing = Promise.allSettled([...inFlight]).then(() => {})
      return closing
    },
  }
}

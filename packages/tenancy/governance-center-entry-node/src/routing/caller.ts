import { StorageUnavailable } from '@omne-harness-lite/storage'
// 判定次序第 ② 步：认人（入口契约 S-11；入口节点约束第 8 条「只凭出示物认人」）。
// **`Caller` 只在本模块构造**：路由调用函数以登录状态为发起方或调用方时，实参只从它取；
// 它的两个值只来自 `logins.exchange` 的返回——线上收到的任何 `LoginStateId` 都不作认人依据。
import {
  type ExchangedIdentity,
  type LoginsService,
  parseLoginStatePresentation,
} from '@omne-harness-lite/account-identity'
import {
  type AccountId,
  type LoginStateId,
  isOk,
  validate,
} from '@omne-harness-lite/identity-values'
import { type Observed, type Rejection, thrownValue } from './record-shapes.ts'

/** 认人所得（S-12）。私有字段让它名义上唯一：本模块之外构造不出来（类本身不导出）。 */
class CallerIdentity {
  readonly #nominal = true
  readonly loginStateId: LoginStateId
  readonly accountId: AccountId

  constructor(identity: ExchangedIdentity) {
    this.loginStateId = identity.loginStateId
    this.accountId = identity.accountId
  }
}

export type Caller = CallerIdentity

export type Authentication =
  | { readonly kind: 'caller'; readonly caller: Caller }
  /** 六种不认情形同一个线上答复；记录里可以区分到 `rejection` 这一步。 */
  | { readonly kind: 'rejected'; readonly rejection: Rejection }
  | { readonly kind: 'unavailable'; readonly observed: Observed }
  | { readonly kind: 'defect'; readonly observed: Observed }

/**
 * 出示物的三种不查即判（没带、带了不止一个、表示层不合格 ⇒ 不调 `exchange`），其余现读 AI S-44。
 * `occurrences` 是信封顶层 `presentedLoginState` 出现的次数（重复由读取器报出）。
 */
export async function authenticate(
  presented: unknown,
  occurrences: number,
  logins: Pick<LoginsService, 'exchange'>,
): Promise<Authentication> {
  if (occurrences === 0) return { kind: 'rejected', rejection: 'absent' }
  if (occurrences > 1) return { kind: 'rejected', rejection: 'multiple' }
  // 表示层就是 AI S-45 的交换表示，用账号能力包导出的同一个函数判（S-5），不另立一条
  const presentation = parseLoginStatePresentation(presented)
  if (!isOk(presentation)) return { kind: 'rejected', rejection: 'malformed' }
  let outcome: Awaited<ReturnType<LoginsService['exchange']>>
  try {
    outcome = await logins.exchange(presentation.ok)
  } catch (error) {
    if (error instanceof StorageUnavailable) throw error
    return defect(thrownValue(error))
  }
  // 参与方的返回按运行期形状核：失败集合之外的任何东西（含没有值）都是缺陷
  const shape: unknown = outcome
  if (typeof shape !== 'object' || shape === null) return defect('not-an-outcome')
  if ('ok' in outcome) {
    const identity: unknown = outcome.ok
    if (
      typeof identity !== 'object' ||
      identity === null ||
      !('loginStateId' in identity) ||
      !('accountId' in identity) ||
      !validate('LoginStateId', identity.loginStateId).valid ||
      !validate('AccountId', identity.accountId).valid
    ) {
      return defect('malformed-identity')
    }
    return { kind: 'caller', caller: new CallerIdentity(outcome.ok) }
  }
  switch (outcome.failure) {
    // 查不到、已撤销、所属账号未激活，以及本版到不了的表示层不合格：都是「不认」（S-11 出口表）
    case 'login-state-rejected':
    case 'invalid-input':
      return { kind: 'rejected', rejection: 'judged' }
    case 'storage-unavailable':
      return { kind: 'unavailable', observed: { call: 'authenticate', value: outcome.failure } }
    default:
      return defect('outside-failure-set')
  }
}

function defect(value: string): Authentication {
  return { kind: 'defect', observed: { call: 'authenticate', value } }
}

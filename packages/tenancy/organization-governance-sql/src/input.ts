// 本契约自己拥有的几样输入形状的表示层解析（IV S-33：在进入任何判定之前；不合 ⇒ `invalidInput`）。
// 身份值本身的解析归 identity-values，这里只组合。
import {
  type Parsed,
  invalidInput,
  isOk,
  ok,
  parseAccountId,
  parseTenantId,
} from '@omne-harness-lite/identity-values'
import type { OfferReader } from '@omne-harness-lite/organization-governance'

/**
 * 列表面的过滤开关（S-57～S-60 ①）：缺席取条款写死的默认（`false` = 只要 pending／只要有效的），
 * 给了就必须是布尔；别的取值不在集合内 ⇒ `invalidInput`，不猜。
 */
export function parseIncludeSwitch(value: unknown): Parsed<boolean> {
  if (value === undefined) return ok(false)
  return typeof value === 'boolean' ? ok(value) : invalidInput('filter switch: not a boolean')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** S-55 ①：调用方身份恰两支，判别式集合封闭；不靠「哪个字段有值」去猜，多余成员一律拒绝。 */
export function parseOfferReader(value: unknown): Parsed<OfferReader> {
  if (!isPlainObject(value)) return invalidInput('OfferReader: not an object')
  const keys = Object.keys(value).sort().join(',')
  if (value['kind'] === 'account') {
    if (keys !== 'accountId,kind') return invalidInput('OfferReader: unexpected member')
    const accountId = parseAccountId(value['accountId'])
    return isOk(accountId)
      ? ok({ kind: 'account', accountId: accountId.ok })
      : invalidInput('OfferReader.accountId invalid')
  }
  if (value['kind'] === 'tenant') {
    if (keys !== 'kind,tenantId') return invalidInput('OfferReader: unexpected member')
    const tenantId = parseTenantId(value['tenantId'])
    return isOk(tenantId)
      ? ok({ kind: 'tenant', tenantId: tenantId.ok })
      : invalidInput('OfferReader.tenantId invalid')
  }
  return invalidInput('OfferReader: unknown kind')
}

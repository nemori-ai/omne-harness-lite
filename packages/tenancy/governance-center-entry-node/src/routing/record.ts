// 每个请求一条工程记录（入口契约 S-30；入口节点 design「工程记录」「工程记录的关联号」）。
// 边界：不记对端地址；账号与租户只以不可逆的关联号出现；不含出示物、凭据材料、载荷里的值与任何秘密；
// 失败只记入口层自己观察到的值——哪一次调用、参与方给出的值名或异常类型——不推断它背后是存储还是钟。
import { createHash } from 'node:crypto'
import { type TenantId, toCanonicalJson } from '@omne-harness-lite/identity-values'

const ACCOUNT_LABEL = 'omne.governance-center-entry.account-correlation.v1'
const TENANT_LABEL = 'omne.governance-center-entry.tenant-correlation.v1'

function correlation(label: string, input: string): string {
  return createHash('sha256')
    .update(label, 'utf8')
    .update(Buffer.of(0))
    .update(input, 'utf8')
    .digest('hex')
}

/** `hex(SHA-256(标签 ‖ 0x00 ‖ AccountId))`：确定、跨重启稳定，还原不出 `AccountId`。 */
export function accountCorrelation(accountId: string): string {
  return correlation(ACCOUNT_LABEL, accountId)
}

/** 租户以它的规范 JSON 形式作输入。 */
export function tenantCorrelation(tenant: TenantId): string {
  return correlation(TENANT_LABEL, toCanonicalJson(tenant))
}

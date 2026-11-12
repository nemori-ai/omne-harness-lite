// 发行的并发范围与固定请求的上下文采用（B 段）。并发范围按 run 划分：范围是请求来源 consumer 的纯函数，
// 不存状态。Tool 请求供给者（`entry/tool-requests.ts` 的 `prepare`）用 `runToolScope` 填请求，装配用 `runScopeGrants`
// 为本范围拥有者声明核验器（Tool SPEC 第 10 节「并发范围的授予经 guards.grants 核验」）。队列在租户内按范围的
// owner 与 key 划分（tool-contract SPEC P02），所以两个 run 互不排队。同一 run 内的名额数是 Agent 写入请求的
// `limits.scopeBudget`，本文件不给。
import type { TenantId } from '@omne-harness/legal-identity'
import { canonicalDigest, type ToolGrantVerifier } from '@omne-harness/tool'
import type { ConsumerRef, ResourceScope } from '@omne-harness/tool-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'

const OWNER = '@omne-harness/harness-server'
const GRANT_RECORD = 'harness-server#run-tool-scope'
const GRANT_REVISION = '1'

/** 授予证据的摘要：把范围 key 绑定到一个租户。同一个 key 在别的租户下摘要不同。 */
const grantDigest = (tenant: TenantId, key: string) => canonicalDigest({ tenant, key })

/**
 * 一个 run 的并发范围。key 是 consumer 的 owner 与 work（Agent 的 work 就是 execution），不含 position，
 * 所以同一 run 的全部动作共用一个范围。授予证据由本拥有者为 `tenant` 签发。
 */
export function runToolScope(tenant: TenantId, consumer: ConsumerRef): ResourceScope {
  // 两段的 JSON 数组文本：含分隔符的 owner 或 work 不会拼出别的 key。
  const key = JSON.stringify([consumer.owner, consumer.work])
  return Object.freeze({
    owner: OWNER,
    key,
    grant: Object.freeze({
      owner: OWNER,
      record: GRANT_RECORD,
      revision: GRANT_REVISION,
      digest: grantDigest(tenant, key),
    }),
  })
}

/**
 * 本范围拥有者的授予核验器表，只有一项。授予的 owner、record、revision 都是本文件签发的值，且 digest 等于按调用的
 * 租户与 `scope.key` 重算的值时答 granted；其余答 refused。别的拥有者不在表里，由 Tool 账本拒绝。
 */
export function runScopeGrants(): ReadonlyMap<string, ToolGrantVerifier<unknown>> {
  const verifier: ToolGrantVerifier<unknown> = {
    verifyGrant: ({ tenant, scope }) =>
      Promise.resolve(
        scope.grant.owner === OWNER &&
          scope.grant.record === GRANT_RECORD &&
          scope.grant.revision === GRANT_REVISION &&
          scope.grant.digest === grantDigest(tenant, scope.key)
          ? { kind: 'granted' }
          : { kind: 'refused', reason: 'scope-not-granted' },
      ),
  }
  return new Map([[OWNER, verifier]])
}

/** 固定请求的 `context` 采用：本发行的 Tool 请求供给者。 */
export const RELEASE_REQUEST_CONTEXT = describedAdoption({
  owner: OWNER,
  name: 'tool-request-source',
  revision: '1',
})

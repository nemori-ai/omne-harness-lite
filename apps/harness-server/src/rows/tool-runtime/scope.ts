import type { TenantId } from '@omne-harness/legal-identity'
import { canonicalDigest, type ToolGrantVerifier } from '@omne-harness/tool'
import type { ConsumerRef, ResourceScope } from '@omne-harness/tool-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'

const OWNER = '@omne-harness/harness-server'
const GRANT_RECORD = 'harness-server#run-tool-scope'
const GRANT_REVISION = '1'

const grantDigest = (tenant: TenantId, key: string) => canonicalDigest({ tenant, key })

export function runToolScope(tenant: TenantId, consumer: ConsumerRef): ResourceScope {
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

export const RELEASE_REQUEST_CONTEXT = describedAdoption({
  owner: OWNER,
  name: 'tool-request-source',
  revision: '1',
})

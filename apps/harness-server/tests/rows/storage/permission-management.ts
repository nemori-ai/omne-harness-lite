import type { Context } from '@deepseek-ai/cordis'
import {
  identityGovernanceKey,
  identityOperationsKey,
  principalIssuerKey,
} from '@omne-harness/identity/cordis'
import { loginStateCodec } from '@omne-harness/legal-identity'
import { sessionId, operationId } from '@omne-harness/session-contract/testing'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { SESSION_PERMISSION_OWN_LOGIN_POLICY } from '../../../src/rows/authorization/session-permission-write.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import type { EntryEnv, EntryObjectModule } from '../../../src/types.ts'

/** A trusted test client of real Identity and Session services, without replacement decisions. */
export function permissionManagement() {
  let mounted: { scope: Context; env: EntryEnv } | undefined
  const entry: EntryObjectModule = {
    name: 'permission-management-test-client',
    implementation: 'real',
    install(scope, env) {
      const current = { scope, env }
      scope.effect(() => {
        mounted = current
        return () => {
          if (mounted === current) mounted = undefined
        }
      })
    },
  }
  return {
    entry,
    async denyShell(session: string, credentials: { loginIdentifier: string; credential: string }) {
      if (mounted === undefined) throw new Error('Test management client is not mounted')
      const { scope, env } = mounted
      const identity = scope.get(identityOperationsKey)
      const governance = env.readTrusted(identityGovernanceKey).get(identityGovernanceKey)
      const issuer = env.readTrusted(principalIssuerKey).get(principalIssuerKey)
      const service = scope.intercept(sessionKey, { caller: 'intake' }).get(sessionKey)
      if (!identity || !governance || !issuer || !service)
        throw new Error('Actual management services unavailable')
      const issued = await identity.issueLogin(credentials)
      if (issued.kind !== 'succeeded') throw new Error(`Login issuance: ${issued.kind}`)
      const recognized = await identity.recognizeLogin({ loginProof: issued.loginProof })
      if (recognized.kind !== 'recognized') throw new Error(`Login recognition: ${recognized.kind}`)
      const current = await governance.queryCurrentTenant({ login: recognized.login })
      if (current.kind !== 'succeeded') throw new Error(`Current tenant: ${current.kind}`)
      const login = loginStateCodec.encode(recognized.login)
      if (!login.ok) throw new Error('Original login could not be encoded')
      const actor = issuer.issueSystem({ component: 'server-entry' })
      if ('failure' in actor) throw new Error('Actual issuer refused server actor')
      const principal = issuer.issueActingForTenant({
        actor: actor.ok,
        tenant: current.tenant,
        work: { owner: 'identity-login', work: login.value },
      })
      if ('failure' in principal) throw new Error('Actual issuer refused login principal')
      const release = await loadProductionRelease()
      if (release.kind !== 'trusted') throw new Error('Actual release unavailable')
      const permission = release.manifest.entries.find(entry => entry.asset.name === 'Shell')
        ?.governance.declaration.permissions[0]
      if (!permission) throw new Error('Actual Shell permission absent')
      return service.management.change({
        principal: principal.ok,
        tenant: current.tenant,
        session: sessionId(session),
        operation: operationId('release-permission-deny-shell'),
        declaration: {
          kind: 'permission-assignment',
          capabilityId: permission.capabilityId,
          enforcementKey: permission.enforcementKey,
          definition: permission.reference,
          rule: { pick: 'deny', allowedSet: null },
          expectedRevision: '0',
          authorization: SESSION_PERMISSION_OWN_LOGIN_POLICY,
        },
      })
    },
  }
}

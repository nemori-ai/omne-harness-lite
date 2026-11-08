import type { Context } from '@deepseek-ai/cordis'
import { referenceSystemActionAuthorization } from '@omne-harness/authorization'
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import { createPolicySessionAccessCheck } from '@omne-harness/session-contract/testing'
import {
  SessionAccessCheckService,
  sessionAccessCheckKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../../src/row.ts'
import { releaseMaintenanceGrants } from '../../../src/rows/authorization/grants.ts'
import {
  SystemActionAuthorizationService,
  systemActionAuthorizationKey,
} from '../../../src/rows/authorization/system-action-service.ts'
import { allowAll } from '../storage/fixtures/tree.ts'

export const maintenancePolicy = defineRow({
  row: 'authorization',
  implementation: 'contract-double',
  manifest: {
    provides: [sessionAccessCheckKey, systemActionAuthorizationKey],
    injects: [principalVerifierKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'maintenance-policy-fixture',
    inject: [principalVerifierKey],
    apply(ctx: Context) {
      const policy = createPolicySessionAccessCheck(allowAll)
      new (class extends SessionAccessCheckService<string> {
        readonly check = policy.check
      })(ctx)
      const system = referenceSystemActionAuthorization({
        verifier: { verify: value => ctx.principalVerifier.verify(value) },
        grants: releaseMaintenanceGrants(),
        clock: null,
      })
      new (class extends SystemActionAuthorizationService {
        readonly check = system.check
      })(ctx)
    },
  },
})

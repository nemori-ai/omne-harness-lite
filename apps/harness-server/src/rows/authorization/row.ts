// The `authorization` row (application assembly, DP-4): the application member's authorization
// adapter plugin. It provides `sessionAccessCheck`, `agentAccessCheck` and `agentActionAdmission`
// over the policy tables of this directory, and it injects the verifier (an entry object) and the
// tenant standing source (the `identity` row). The grant table is a module constant that the plugin
// hands to the reference system action authorization. It is not an `inject`, not a service key and
// not configuration, so no operator setting can give a system principal a purpose (DP4-C13).
import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  referenceAdmissionCheck,
  referenceSystemActionAuthorization,
} from '@omne-harness/authorization'
import {
  ActionAdmissionService,
  AgentAccessCheckService,
  agentAccessCheckKey,
  agentActionAdmissionKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ActionAdmission, AgentAccessCheck } from '@omne-harness/agent-contract'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import {
  SessionAccessCheckService,
  sessionAccessCheckKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { SessionAccessCheck } from '@omne-harness/session-contract'
import { defineRow } from '../../row.ts'
import {
  createActionAdmission,
  createAgentAccessCheck,
  createSessionAccessCheck,
  type AccessPorts,
} from './adapters.ts'
import { releaseMaintenanceGrants } from './grants.ts'

// The services keep closures only: no `#` private field, because a method reached through a caller
// proxy has a `this` that is not the instance (docs/real-mode.md).
class SessionAccessCheckImpl extends SessionAccessCheckService<unknown> {
  readonly check: SessionAccessCheck<unknown>['check']
  constructor(ctx: Context, delegate: SessionAccessCheck<unknown>) {
    super(ctx)
    this.check = input => delegate.check(input)
  }
}

class AgentAccessCheckImpl extends AgentAccessCheckService<unknown> {
  readonly check: AgentAccessCheck<unknown>['check']
  constructor(ctx: Context, delegate: AgentAccessCheck<unknown>) {
    super(ctx)
    this.check = input => delegate.check(input)
  }
}

class ActionAdmissionImpl extends ActionAdmissionService<unknown> {
  readonly admit: ActionAdmission<unknown>['admit']
  constructor(ctx: Context, delegate: ActionAdmission<unknown>) {
    super(ctx)
    this.admit = input => delegate.admit(input)
  }
}

/**
 * The two dependencies, read from the context again on every call. A reference that outlives a
 * dependency fails inside the reference checks and gives `unavailable` there, never a stale answer.
 */
function portsOf(ctx: Context): AccessPorts {
  const verifier: PrincipalVerifier = { verify: value => ctx.principalVerifier.verify(value) }
  const standing: TenantStandingSource = { read: input => ctx.tenantStanding.read(input) }
  return Object.freeze({
    admission: referenceAdmissionCheck({ verifier, standing, permits: null }),
    systemActions: referenceSystemActionAuthorization({
      verifier,
      grants: releaseMaintenanceGrants(),
      clock: null,
    }),
  })
}

const authorizationPlugin: Plugin.Object = {
  name: 'authorization',
  inject: [principalVerifierKey, tenantStandingKey],
  apply(ctx: Context) {
    const ports = portsOf(ctx)
    new SessionAccessCheckImpl(ctx, createSessionAccessCheck(ports))
    new AgentAccessCheckImpl(ctx, createAgentAccessCheck(ports))
    new ActionAdmissionImpl(ctx, createActionAdmission())
  },
}

/** Row id `authorization`. The manifest equals the `authorization` row of `src/s0/stubs.ts`. */
export const authorization = defineRow({
  row: 'authorization',
  implementation: 'real',
  manifest: {
    provides: [sessionAccessCheckKey, agentAccessCheckKey, agentActionAdmissionKey],
    injects: [tenantStandingKey, principalVerifierKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: authorizationPlugin,
})

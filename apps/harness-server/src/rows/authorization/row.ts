// The `authorization` row (application assembly, DP-4): the application member's authorization
// adapter plugin. It provides `sessionAccessCheck`, `agentAccessCheck` and `agentActionAdmission`
// over the policy tables of this directory, and it injects the verifier (an entry object) and the
// tenant standing source (the `identity` row). The grant table is built into the release and the
// plugin hands it to the reference system action authorization. It is not an `inject` and not a
// service key. The one operator setting, `maintenanceGrants`, can only tighten a record of the table
// (revoke it, or give it an end time judged by the injected clock), so no operator setting can
// give a system principal a purpose (DP4-C13, R2-D204 item 2).
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
import type { IdentityClock, PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
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
import { configuresExpiry, grantClockOf, tightenMaintenanceGrants } from './grant-tightening.ts'
import { releaseMaintenanceGrants } from './grants.ts'
import { authorizationConfig } from './action-rules.ts'

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
function portsOf(
  ctx: Context,
  grants: ReturnType<typeof releaseMaintenanceGrants>,
  clock: IdentityClock | null,
): AccessPorts {
  const verifier: PrincipalVerifier = { verify: value => ctx.principalVerifier.verify(value) }
  const standing: TenantStandingSource = { read: input => ctx.tenantStanding.read(input) }
  return Object.freeze({
    admission: referenceAdmissionCheck({ verifier, standing, permits: null }),
    systemActions: referenceSystemActionAuthorization({
      verifier,
      grants,
      clock: clock === null ? null : grantClockOf(clock),
    }),
  })
}

function authorizationPluginOf(clock: IdentityClock | null): Plugin.Object {
  return {
    name: 'authorization',
    inject: [principalVerifierKey, tenantStandingKey],
    Config: authorizationConfig,
    apply(ctx: Context, config: unknown) {
      const { actionRules, maintenanceGrants } = authorizationConfig.parse(config)
      // An end time that nothing can judge would leave the grant unusable without a reason.
      if (configuresExpiry(maintenanceGrants) && clock === null)
        throw new Error(
          'maintenanceGrants sets expiresAt, but no clock is installed in the authorization row to judge it',
        )
      const grants = releaseMaintenanceGrants(tightenMaintenanceGrants(maintenanceGrants))
      let active = true
      ctx.effect(
        () => () => {
          active = false
        },
        'authorization.active',
      )
      const ports = portsOf(ctx, grants, clock)
      new SessionAccessCheckImpl(ctx, createSessionAccessCheck(ports))
      new AgentAccessCheckImpl(ctx, createAgentAccessCheck(ports))
      new ActionAdmissionImpl(
        ctx,
        createActionAdmission({
          actionRules,
          readAdmission: () => (active ? ports.admission : undefined),
        }),
      )
    },
  }
}

/** Row id `authorization`. The manifest equals the `authorization` row of `src/s0/stubs.ts`. */
export function createAuthorizationRow(options: Readonly<{ clock: IdentityClock | null }>) {
  return defineRow({
    row: 'authorization',
    implementation: 'real',
    manifest: {
      provides: [sessionAccessCheckKey, agentAccessCheckKey, agentActionAdmissionKey],
      injects: [tenantStandingKey, principalVerifierKey],
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'none' },
    plugin: authorizationPluginOf(options.clock),
  })
}

/**
 * The row of the release. No clock is installed in it yet: the manifest does not inject
 * `identityClock`, so a configured `expiresAt` stops the start instead of being ignored.
 */
export const authorization = createAuthorizationRow({ clock: null })

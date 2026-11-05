// The `authorization` row (application assembly, DP-4): the application member's authorization
// adapter plugin. It provides `sessionAccessCheck`, `agentAccessCheck` and `agentActionAdmission`
// over the policy tables of this directory, and it injects the verifier (an entry object), the
// tenant standing source (the `identity` row) and `identityClock` (an entry object on the root).
// The grant table is built into the release and the plugin hands it to the reference system action
// authorization. The table is not an `inject` and not a service key. The row provides the decision
// over it as the trusted key `systemActionAuthorization` (R2-D245): `session-storage` asks it before
// it enumerates tenants, so the operator's tightening reaches that path too. The one operator setting,
// `maintenanceGrants`, can only tighten a record of the table (revoke it, or give it an end time
// judged by the injected `identityClock`), so no operator setting can give a system principal a
// purpose (DP4-C13, R2-D204 item 2).
import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  referenceAdmissionCheck,
  referenceSystemActionAuthorization,
  type SystemActionAuthorization,
} from '@omne-harness/authorization'
import {
  ActionAdmissionService,
  AgentAccessCheckService,
  agentAccessCheckKey,
  agentActionAdmissionKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ActionAdmission, AgentAccessCheck } from '@omne-harness/agent-contract'
import type { IdentityClock, PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import {
  identityClockKey,
  principalVerifierKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
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
import { grantClockOf, tightenMaintenanceGrants } from './grant-tightening.ts'
import { releaseMaintenanceGrants } from './grants.ts'
import {
  SystemActionAuthorizationService,
  systemActionAuthorizationKey,
} from './system-action-service.ts'
import { authorizationConfig } from './action-rules.ts'
import { createToolTargetPolicy, installToolTargetPolicy } from './tool-target-policy.ts'

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
 * The system action decision over the tightened table. After the row stops, a reference that a
 * consumer still holds answers `unavailable`, never a decision.
 */
class SystemActionAuthorizationImpl extends SystemActionAuthorizationService {
  readonly check: SystemActionAuthorization['check']
  constructor(ctx: Context, delegate: SystemActionAuthorization, active: () => boolean) {
    super(ctx)
    this.check = input =>
      active()
        ? delegate.check(input)
        : Promise.resolve(
            Object.freeze({
              kind: 'unavailable' as const,
              diagnostic: 'the authorization row has stopped',
            }),
          )
  }
}

/**
 * The three dependencies, read from the context again on every call. A reference that outlives a
 * dependency fails inside the reference checks and gives `unavailable` there, never a stale answer.
 */
function portsOf(ctx: Context, grants: ReturnType<typeof releaseMaintenanceGrants>): AccessPorts {
  const verifier: PrincipalVerifier = { verify: value => ctx.principalVerifier.verify(value) }
  const standing: TenantStandingSource = { read: input => ctx.tenantStanding.read(input) }
  const clock: IdentityClock = { now: () => ctx.identityClock.now() }
  return Object.freeze({
    admission: referenceAdmissionCheck({ verifier, standing, permits: null }),
    systemActions: referenceSystemActionAuthorization({
      verifier,
      grants,
      clock: grantClockOf(clock),
    }),
  })
}

const plugin: Plugin.Object = {
  name: 'authorization',
  inject: [principalVerifierKey, tenantStandingKey, identityClockKey],
  Config: authorizationConfig,
  apply(ctx: Context, config: unknown) {
    const { actionRules, maintenanceGrants } = authorizationConfig.parse(config)
    const grants = releaseMaintenanceGrants(tightenMaintenanceGrants(maintenanceGrants))
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'authorization.active',
    )
    const ports = portsOf(ctx, grants)
    installToolTargetPolicy(
      ctx,
      createToolTargetPolicy(actionRules, () => (active ? ports.admission : undefined)),
    )
    new SystemActionAuthorizationImpl(ctx, ports.systemActions, () => active)
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

/**
 * Row id `authorization`. The manifest equals the `authorization` row of `src/s0/stubs.ts`. An end
 * time of a tightened grant is judged by the injected `identityClock` (R2-D210 item 3), the same
 * clock as the `identity` row; while it is absent the row stays `PENDING`.
 */
export const authorization = defineRow({
  row: 'authorization',
  implementation: 'real',
  manifest: {
    provides: [
      sessionAccessCheckKey,
      agentAccessCheckKey,
      agentActionAdmissionKey,
      systemActionAuthorizationKey,
    ],
    injects: [tenantStandingKey, principalVerifierKey, identityClockKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})

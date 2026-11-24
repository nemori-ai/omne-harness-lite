import type { Access } from '@omne-harness/legal-identity'
import { currentHeldTool } from '../tool-host/held-current.ts'
import { rememberAdmittedTarget } from './admitted-targets.ts'
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
  agentDecisionCardsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ActionAdmission, AgentAccessCheck } from '@omne-harness/agent-contract'
import type { IdentityClock, PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import {
  identityClockKey,
  identityGovernanceKey,
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
import { rowGrantInstalled } from './row-grants.ts'
import {
  SystemActionAuthorizationService,
  systemActionAuthorizationKey,
} from './system-action-service.ts'
import { authorizationConfig } from './action-rules.ts'
import { sessionAuthorizationWriter } from './session-authorization-writer.ts'
import { createTenantPicks } from './tenant-picks.ts'
import { tenantPermissionDeclarations } from '../../entry/permission-declarations.ts'
import { tenantSettingsKey } from '../governance/tenant-settings-service.ts'
import { currentPermissionOf } from './current-permission.ts'
import { toolCatalogKey, toolReleaseDetailsKey } from '@omne-harness/tool-cordis-contract/cordis'
import {
  createToolActionResolution,
  createToolCallLabeling,
} from '../../entry/tool-action-resolution.ts'
import { sourcedEntriesOf } from '../../entry/tool-entry-sources.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { releaseCatalogViewOf } from '../tool-bindings/catalog-view.ts'

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

function portsOf(ctx: Context, grants: ReturnType<typeof releaseMaintenanceGrants>): AccessPorts {
  const verifier: PrincipalVerifier = { verify: value => ctx.principalVerifier.verify(value) }
  const standing: TenantStandingSource = { read: input => ctx.tenantStanding.read(input) }
  const clock: IdentityClock = { now: () => ctx.identityClock.now() }
  return Object.freeze({
    admission: referenceAdmissionCheck({ verifier, standing, permits: null }),
    login: { queryCurrentTenant: input => ctx.identityGovernance.queryCurrentTenant(input) },
    cards: () => ctx.get(agentDecisionCardsKey, false),
    systemActions: referenceSystemActionAuthorization({
      verifier,
      grants,
      clock: grantClockOf(clock),
    }),
  })
}

const plugin: Plugin.Object = {
  name: 'authorization',
  inject: [principalVerifierKey, tenantStandingKey, identityClockKey, identityGovernanceKey],
  Config: authorizationConfig,
  apply(ctx: Context, config: unknown) {
    const { actionRules, maintenanceGrants } = authorizationConfig.parse(config)
    const grants = releaseMaintenanceGrants(tightenMaintenanceGrants(maintenanceGrants), holder =>
      rowGrantInstalled(ctx, holder),
    )
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'authorization.active',
    )
    const ports = portsOf(ctx, grants)
    const permission = currentPermissionOf(ctx)
    const forwarding = {
      release: () => releaseOf(ctx),
      catalog: () => ctx.get(toolCatalogKey, false),
      view: () => releaseCatalogViewOf(ctx),
      held: (access: Access<unknown>, name: string) => currentHeldTool(ctx, access, name),
      sourced: () => sourcedEntriesOf(ctx),
    }
    const resolution = createToolActionResolution(forwarding)
    const labeling = createToolCallLabeling({
      ...forwarding,
      details: () => ctx.get(toolReleaseDetailsKey, false),
    })
    const authorizations = sessionAuthorizationWriter(ctx)
    const picks = createTenantPicks({
      declarations: tenant => tenantPermissionDeclarations(ctx, tenant),
      settings: () => ctx.get(tenantSettingsKey, false),
    })
    const readPermission = () => (active ? permission : undefined)
    new SystemActionAuthorizationImpl(ctx, ports.systemActions, () => active)
    new SessionAccessCheckImpl(ctx, createSessionAccessCheck(ports))
    new AgentAccessCheckImpl(ctx, createAgentAccessCheck(ports))
    new ActionAdmissionImpl(
      ctx,
      createActionAdmission({
        actionRules,
        readAdmission: () => (active ? ports.admission : undefined),
        readPermission,
        readResolution: () => (active ? resolution : undefined),
        readLabeling: () => (active ? labeling : undefined),
        readAuthorizations: () => (active ? authorizations : undefined),
        readPicks: () => (active ? picks : undefined),
        carried: (action, target) => rememberAdmittedTarget(ctx, action, target),
      }),
    )
  },
}

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
    injects: [tenantStandingKey, principalVerifierKey, identityClockKey, identityGovernanceKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})

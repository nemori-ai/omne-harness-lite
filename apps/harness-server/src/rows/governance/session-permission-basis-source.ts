// The source of the commit basis of a Session permission assignment (session-storage-sql
// `SessionProtectedBasisSource`). The Session commit asks it for one delivery. It reads the facts
// of other domains now and keeps nothing: the login, and the organization layer of a mapped
// target. The facts of the tenant domain are read again inside the commit by the members that the
// plan names, so a change after this read stops the commit.
import { canonicalText } from '@omne-harness/authorization'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import {
  governanceDefinitionProjectionCommand,
  type GovernanceDefinitionBinding,
} from '@omne-harness/governance-local'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { organizationCodec, tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { PermissionScope, PermissionSource } from '@omne-harness/permissions'
import { commandDigest, type SessionFailure } from '@omne-harness/session-contract'
import type {
  SessionProtectedBasis,
  SessionProtectedBasisSource,
  SessionProtectedCommit,
} from '@omne-harness/session-storage-sql'
import { readSettingsSource } from '@omne-harness/settings-local'
import type { DomainRef, FactCommandV2, SqlStorage } from '@omne-harness/sql-contract'
import {
  recheckSessionPermissionLogin,
  SESSION_PERMISSION_OWN_LOGIN_POLICY,
  type SessionPermissionLogin,
} from '../authorization/session-permission-write.ts'
import { organizationPermissionSource } from './organization-permission-source.ts'
import {
  sessionPermissionBasisFactsSchema,
  sessionPermissionBasisProducer,
  type SessionPermissionBasisFacts,
  type SessionPermissionBasisMode,
} from './session-permission-basis.ts'
import {
  discoverSessionPermissionDeclaration,
  matchingPermissions,
  type SessionPermissionCatalogReader,
} from './session-permission-discovery.ts'
import type { SessionPermissionSettingsResolver } from './session-permission-settings.ts'
import { targetSnapshotCommands } from './target-snapshot.ts'

type Principal = ActingForTenantPrincipal
type Commit = SessionProtectedCommit<Principal>
type Plan = Outcome<SessionProtectedBasis, SessionFailure>
/** The stated part of the producer facts. The Session command stays as the commit gave it. */
type Stated = Pick<SessionPermissionBasisFacts, 'change' | 'assignment'> &
  Readonly<{ commands: readonly [FactCommandV2] }>
type Selected = Stated & Pick<SessionPermissionBasisFacts, 'selection'>
type Combination = SessionProtectedBasis['combination']

export type SessionPermissionBasisSource = SessionProtectedBasisSource<Principal>
export type SessionPermissionBasisSourceOptions = Readonly<{
  scope: GovernanceScope
  domain: DomainRef
  /** The current epoch of the Governance scope; the projections of the commit read this epoch. */
  epoch: string
  storage: Pick<SqlStorage, 'read'>
  login?: () => SessionPermissionLogin | undefined
  settings?: SessionPermissionSettingsResolver
  readCatalog: SessionPermissionCatalogReader
  /** The registered combination of each mode: the Session writer, its producer and their sources. */
  combinations: Readonly<Record<SessionPermissionBasisMode, Combination>>
}>

const OWNER = 'harness.session-permission-write'
const denied = (): Plan => fail({ kind: 'denied', action: 'change' })
const unavailable = (diagnostic: string): Plan =>
  fail({ kind: 'unavailable', owner: OWNER, diagnostic })

/** What the access decision qualified, when it is the decision of this command in this scope. */
function stated(
  scope: GovernanceScope,
  commit: Commit,
): (Stated & { principalRef: string }) | null {
  const { access, command, qualification } = commit
  const declaration = command.input.declaration
  if (declaration.kind !== 'permission-assignment') return null
  const tenant = tenantCodec.encode(command.input.tenant)
  if (
    !tenant.ok ||
    tenant.value !== scope.tenantRef ||
    access.session !== command.input.session ||
    !tenantEquals(access.tenant, command.input.tenant) ||
    !tenantEquals(access.principal.tenant, command.input.tenant) ||
    !tenantEquals(qualification.tenant, command.input.tenant)
  )
    return null
  const principalRef = standingPrincipalRef(access.principal)
  const expected = {
    session: command.input.session,
    operation: command.input.operation,
    commandDigest: commandDigest(command),
    permissionRevision: declaration.expectedRevision,
    principalRef,
    policy: SESSION_PERMISSION_OWN_LOGIN_POLICY,
  }
  const { tenant: _tenant, ...received } = qualification
  if (
    canonicalText(received) !== canonicalText(expected) ||
    canonicalText(declaration.authorization) !== canonicalText(expected.policy)
  )
    return null
  return {
    principalRef,
    commands: [commit.session],
    change: {
      operation: expected.operation,
      commandDigest: expected.commandDigest,
      revision: expected.permissionRevision,
      authority: expected.policy,
    },
    assignment: {
      capabilityId: declaration.capabilityId,
      enforcementKey: declaration.enforcementKey,
      definition: declaration.definition,
      rule: declaration.rule,
    },
  }
}

export function createSessionPermissionBasisSource(
  options: SessionPermissionBasisSourceOptions,
): SessionPermissionBasisSource {
  const scope = structuredClone(options.scope)
  const combinations = structuredClone(options.combinations)

  const plan = (
    mode: SessionPermissionBasisMode,
    sources: readonly FactCommandV2[],
    facts: Selected,
  ): Plan =>
    succeed({
      combination: combinations[mode],
      commands: [
        ...sources,
        {
          participant: sessionPermissionBasisProducer(mode),
          facts: sessionPermissionBasisFactsSchema.parse(facts),
        },
      ],
    })

  function permissionScope(session: string, targetId: string): PermissionScope | undefined {
    const tenant = tenantCodec.parse(scope.tenantRef)
    if (!tenant.ok) return undefined
    const organization = organizationCodec.encode(tenant.value.organization)
    if (!organization.ok) return undefined
    return {
      tenantId: scope.tenantRef,
      sessionId: session,
      organizationId: organization.value,
      deploymentId: scope.deploymentId,
      logicalServiceId: scope.logicalServiceId,
      targetId,
    }
  }

  async function set(original: Stated & { principalRef: string }, session: string): Promise<Plan> {
    const found = await discoverSessionPermissionDeclaration({
      scope,
      change: original.assignment,
      readCatalog: options.readCatalog,
    })
    if (found.kind !== 'found') return unavailable('the permission declaration is not available')
    const permission = matchingPermissions(found.declaration, original.assignment)[0]
    if (permission === undefined) return unavailable('the permission declaration is not available')
    const binding: GovernanceDefinitionBinding = {
      scope,
      epoch: options.epoch,
      principalRef: original.principalRef,
      captureId: original.change.operation,
      transactionDomain: options.domain.transactionDomain,
      definition: found.declaration.reference,
    }
    const { principalRef: _principalRef, ...facts } = original
    const definition = governanceDefinitionProjectionCommand(binding)
    if (permission.settings === null) {
      const unmapped = permissionScope(session, session)
      return unmapped === undefined
        ? unavailable('the tenant has no permission scope')
        : plan('unmapped', [definition], {
            ...facts,
            selection: { binding, scope: unmapped, organization: null },
          })
    }
    const mapped = await options.settings?.({ scope, declaration: found.declaration, permission })
    if (mapped === undefined) return unavailable('the Settings target of the permission is unknown')
    const target = permissionScope(session, canonicalText(mapped.target))
    if (target === undefined) return unavailable('the tenant has no permission scope')
    // An unreadable organization layer goes into the judgment as unavailable; the producer decides.
    const organization: PermissionSource = organizationPermissionSource(
      await readSettingsSource(options.storage, mapped.source),
      permission,
      target,
    )
    return plan(
      'mapped',
      [
        definition,
        ...targetSnapshotCommands({ ...binding, mode: 'management', target: mapped.target }),
      ],
      { ...facts, selection: { binding, scope: target, organization } },
    )
  }

  return async commit => {
    const original = stated(scope, commit)
    if (original === null) return denied()
    const login = await recheckSessionPermissionLogin(commit.access.principal, options.login?.())
    if (login.kind !== 'current')
      return login.kind === 'denied' ? denied() : unavailable('the login source is unavailable')
    if (original.assignment.rule !== null) return set(original, commit.command.input.session)
    const { principalRef: _principalRef, ...facts } = original
    return plan('clear', [], { ...facts, selection: null })
  }
}

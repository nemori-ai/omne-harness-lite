import type { Context } from '@deepseek-ai/cordis'
import {
  inProcessPrincipalAuthority,
  type ActingForTenantPrincipal,
  type IssueFailure,
  type Principal,
  type PrincipalIssuer,
  type PrincipalVerifier,
  type SystemPrincipal,
} from '@omne-harness/identity'
import {
  PrincipalIssuerService,
  PrincipalVerifierService,
  principalIssuerKey,
  principalVerifierKey,
} from '@omne-harness/identity/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  SessionInternalPrincipalsService,
  sessionPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { SESSION_MAINTAINER_COMPONENT } from '../rows/authorization/grants.ts'
import { SESSION_WORK_OWNER } from '../rows/authorization/principals.ts'
import { SESSION_WORK_COMPONENT } from '../rows/tool-runtime/session-work.ts'
import type { EntryEnv, EntryObjectModule } from '../types.ts'

export const ENTRY_COMPONENTS = Object.freeze({
  sessionCoordinator: 'sessionPrincipals.coordinator',
  sessionMaintainer: SESSION_MAINTAINER_COMPONENT,
  sessionWork: SESSION_WORK_COMPONENT,
  governanceDirectory: 'governanceDirectoryPrincipals',
  governanceInstallation: 'governanceInstallationPrincipals',
  sessionModes: 'sessionModesPrincipals',
  toolDecisions: 'toolDecisions',
})

type EntryPrincipals = Readonly<{
  issuer: PrincipalIssuer
  verifier: PrincipalVerifier
  coordinator: SystemPrincipal
  maintainer: SystemPrincipal
  sessionWorkActor: SystemPrincipal
  governanceDirectoryActor: SystemPrincipal
  governanceInstallationActor: SystemPrincipal
  sessionModesActor: SystemPrincipal
  toolDecisionsActor: SystemPrincipal
}>

function issueSystem(issuer: PrincipalIssuer, component: string): SystemPrincipal {
  const issued = issuer.issueSystem({ component })
  if ('failure' in issued)
    throw new Error(
      `principals: the authority refused the entry component "${component}" (${issued.failure.field}: ${issued.failure.reason})`,
    )
  return issued.ok
}

function createEntryPrincipals(): EntryPrincipals {
  const { issuer, verifier } = inProcessPrincipalAuthority()
  return Object.freeze({
    issuer,
    verifier,
    coordinator: issueSystem(issuer, ENTRY_COMPONENTS.sessionCoordinator),
    maintainer: issueSystem(issuer, ENTRY_COMPONENTS.sessionMaintainer),
    sessionWorkActor: issueSystem(issuer, ENTRY_COMPONENTS.sessionWork),
    governanceDirectoryActor: issueSystem(issuer, ENTRY_COMPONENTS.governanceDirectory),
    governanceInstallationActor: issueSystem(issuer, ENTRY_COMPONENTS.governanceInstallation),
    sessionModesActor: issueSystem(issuer, ENTRY_COMPONENTS.sessionModes),
    toolDecisionsActor: issueSystem(issuer, ENTRY_COMPONENTS.toolDecisions),
  })
}

const PRINCIPALS = Symbol('harness-server/entry-principals')

function principalsOf(env: EntryEnv): EntryPrincipals {
  return env.once(PRINCIPALS, createEntryPrincipals)
}

export function verifierOf(env: EntryEnv): PrincipalVerifier {
  return principalsOf(env).verifier
}

export function governanceDirectoryIssuerOf(env: EntryEnv) {
  const { issuer, governanceDirectoryActor } = principalsOf(env)
  return (tenant: TenantId): ActingForTenantPrincipal | undefined => {
    const result = issuer.issueActingForTenant({
      actor: governanceDirectoryActor,
      tenant,
      work: { owner: 'harness.governance', work: 'directory' },
    })
    return 'ok' in result ? result.ok : undefined
  }
}

export function governanceInstallationIssuerOf(env: EntryEnv) {
  const { issuer, governanceInstallationActor } = principalsOf(env)
  return (tenant: TenantId): ActingForTenantPrincipal | undefined => {
    const result = issuer.issueActingForTenant({
      actor: governanceInstallationActor,
      tenant,
      work: { owner: 'harness.governance', work: 'installation' },
    })
    return 'ok' in result ? result.ok : undefined
  }
}

export const SESSION_MODES_WORK = Object.freeze({ owner: 'harness.session-context', work: 'modes' })

export function sessionModesIssuerOf(env: EntryEnv) {
  const { issuer, sessionModesActor } = principalsOf(env)
  return (tenant: TenantId): ActingForTenantPrincipal | undefined => {
    const result = issuer.issueActingForTenant({
      actor: sessionModesActor,
      tenant,
      work: SESSION_MODES_WORK,
    })
    return 'ok' in result ? result.ok : undefined
  }
}

export const TOOL_DECISIONS_WORK = Object.freeze({ owner: 'harness.tool-decisions', work: 'ask' })

export function toolDecisionsIssuerOf(env: EntryEnv) {
  const { issuer, toolDecisionsActor } = principalsOf(env)
  return (tenant: TenantId): ActingForTenantPrincipal | undefined => {
    const result = issuer.issueActingForTenant({
      actor: toolDecisionsActor,
      tenant,
      work: TOOL_DECISIONS_WORK,
    })
    return 'ok' in result ? result.ok : undefined
  }
}

export type SessionWorkIssue = (
  input: Readonly<{ tenant: TenantId; session: string }>,
) => Outcome<ActingForTenantPrincipal, IssueFailure>

export function sessionWorkIssuerOf(env: EntryEnv): SessionWorkIssue {
  const { issuer, sessionWorkActor } = principalsOf(env)
  return ({ tenant, session }) =>
    issuer.issueActingForTenant({
      actor: sessionWorkActor,
      tenant,
      work: { owner: SESSION_WORK_OWNER, work: session },
    })
}

class EntryPrincipalVerifier extends PrincipalVerifierService {
  readonly verify: PrincipalVerifier['verify']
  constructor(ctx: Context, verifier: PrincipalVerifier) {
    super(ctx)
    this.verify = value => verifier.verify(value)
  }
}

class EntryPrincipalIssuer extends PrincipalIssuerService {
  readonly issueSystem: PrincipalIssuer['issueSystem']
  readonly issueActingForTenant: PrincipalIssuer['issueActingForTenant']
  constructor(ctx: Context, issuer: PrincipalIssuer) {
    super(ctx)
    this.issueSystem = input => issuer.issueSystem(input)
    this.issueActingForTenant = input => issuer.issueActingForTenant(input)
  }
}

class EntrySessionPrincipals extends SessionInternalPrincipalsService<Principal> {
  readonly coordinator: Principal
  readonly maintainer: Principal
  constructor(ctx: Context, principals: Pick<EntryPrincipals, 'coordinator' | 'maintainer'>) {
    super(ctx)
    this.coordinator = principals.coordinator
    this.maintainer = principals.maintainer
  }
}

export const principalVerifier: EntryObjectModule = {
  name: principalVerifierKey,
  implementation: 'real',
  install(scope, env) {
    new EntryPrincipalVerifier(scope, verifierOf(env))
  },
}

export const principalIssuer: EntryObjectModule = {
  name: principalIssuerKey,
  implementation: 'real',
  install(scope, env) {
    new EntryPrincipalIssuer(scope, principalsOf(env).issuer)
  },
}

export const sessionPrincipals: EntryObjectModule = {
  name: sessionPrincipalsKey,
  implementation: 'real',
  install(scope, env) {
    new EntrySessionPrincipals(scope, principalsOf(env))
  },
}

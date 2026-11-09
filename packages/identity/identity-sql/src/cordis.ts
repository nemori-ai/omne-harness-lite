// The Cordis binding (DP3-C16; IC-1 to IC-3, IC-8, IC-13, IC-14): a function plugin that injects
// `storage` and `identityClock`, validates the two lifetimes and the two invitation durations,
// opens scrypt with the deployed profile, derives the decoy material, registers the identity
// combination, and provides `identityOperations`, `tenantStanding` and `identityGovernance` as
// subclasses of the identity service definitions, over one provider instance. One managed effect
// stops the provider and then waits for scrypt to close. The clock is the injected `identityClock`
// service (R1-D27): this member reads no wall clock.
import type { Context } from '@deepseek-ai/cordis'
import { randomBytes } from 'node:crypto'
import type {
  IdentityGovernance,
  IdentityGovernanceRecovery,
  StandingReservations,
  IdentityOperations,
  TenantStandingSource,
} from '@omne-harness/identity'
import {
  IdentityGovernanceService,
  IdentityGovernanceRecoveryService,
  StandingReservationsService,
  standingDestinationResolverKey,
  principalVerifierKey,
  IdentityOperationsService,
  TenantStandingSourceService,
  identityClockKey,
} from '@omne-harness/identity/cordis'
import { definePlugin, type StandardSchema } from '@omne-harness/kernel-basis/cordis'
import { openScrypt, SCRYPT_PROFILE } from '@omne-harness/scrypt'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import {
  constantInvitationTerms,
  constantLoginTerms,
  parseIdentitySqlConfig,
  type IdentitySqlConfig,
} from './config.ts'
import { identitySqlRegistration } from './materials.ts'
import { createIdentitySql } from './provider.ts'

class IdentitySqlOperationsService extends IdentityOperationsService {
  readonly registerAndActivate: IdentityOperations['registerAndActivate']
  readonly issueLogin: IdentityOperations['issueLogin']
  readonly recognizeLogin: IdentityOperations['recognizeLogin']

  constructor(ctx: Context, operations: IdentityOperations) {
    super(ctx)
    this.registerAndActivate = input => operations.registerAndActivate(input)
    this.issueLogin = input => operations.issueLogin(input)
    this.recognizeLogin = input => operations.recognizeLogin(input)
  }
}

class IdentitySqlStandingService extends TenantStandingSourceService {
  readonly read: TenantStandingSource['read']

  constructor(ctx: Context, standing: TenantStandingSource) {
    super(ctx)
    this.read = input => standing.read(input)
  }
}

class IdentitySqlGovernanceService extends IdentityGovernanceService {
  readonly createOrganization: IdentityGovernance['createOrganization']
  readonly queryCreateOrganization: IdentityGovernance['queryCreateOrganization']
  readonly issueMemberInvitation: IdentityGovernance['issueMemberInvitation']
  readonly acceptMemberInvitation: IdentityGovernance['acceptMemberInvitation']
  readonly rejectMemberInvitation: IdentityGovernance['rejectMemberInvitation']
  readonly withdrawMemberInvitation: IdentityGovernance['withdrawMemberInvitation']
  readonly queryInvitation: IdentityGovernance['queryInvitation']
  readonly queryReceivedInvitations: IdentityGovernance['queryReceivedInvitations']
  readonly queryIssuedInvitations: IdentityGovernance['queryIssuedInvitations']
  readonly queryOwnMemberships: IdentityGovernance['queryOwnMemberships']
  readonly queryOrganizationMembers: IdentityGovernance['queryOrganizationMembers']
  readonly leaveOrganization: IdentityGovernance['leaveOrganization']
  readonly removeMember: IdentityGovernance['removeMember']
  readonly changeMemberRole: IdentityGovernance['changeMemberRole']
  readonly switchCurrentTenant: IdentityGovernance['switchCurrentTenant']
  readonly queryCurrentTenant: IdentityGovernance['queryCurrentTenant']
  readonly revokeLogin: IdentityGovernance['revokeLogin']
  readonly queryOwnValidLogins: IdentityGovernance['queryOwnValidLogins']
  readonly reportBusinessAccess: IdentityGovernance['reportBusinessAccess']

  constructor(ctx: Context, governance: IdentityGovernance) {
    super(ctx)
    this.createOrganization = input => governance.createOrganization(input)
    this.queryCreateOrganization = input => governance.queryCreateOrganization(input)
    this.issueMemberInvitation = input => governance.issueMemberInvitation(input)
    this.acceptMemberInvitation = input => governance.acceptMemberInvitation(input)
    this.rejectMemberInvitation = input => governance.rejectMemberInvitation(input)
    this.withdrawMemberInvitation = input => governance.withdrawMemberInvitation(input)
    this.queryInvitation = input => governance.queryInvitation(input)
    this.queryReceivedInvitations = input => governance.queryReceivedInvitations(input)
    this.queryIssuedInvitations = input => governance.queryIssuedInvitations(input)
    this.queryOwnMemberships = input => governance.queryOwnMemberships(input)
    this.queryOrganizationMembers = input => governance.queryOrganizationMembers(input)
    this.leaveOrganization = input => governance.leaveOrganization(input)
    this.removeMember = input => governance.removeMember(input)
    this.changeMemberRole = input => governance.changeMemberRole(input)
    this.switchCurrentTenant = input => governance.switchCurrentTenant(input)
    this.queryCurrentTenant = input => governance.queryCurrentTenant(input)
    this.revokeLogin = input => governance.revokeLogin(input)
    this.queryOwnValidLogins = input => governance.queryOwnValidLogins(input)
    this.reportBusinessAccess = input => governance.reportBusinessAccess(input)
  }
}

class SqlReservationsService extends StandingReservationsService {
  readonly reserve: StandingReservations['reserve']
  readonly settle: StandingReservations['settle']
  readonly recover: StandingReservations['recover']
  constructor(ctx: Context, port: StandingReservations) {
    super(ctx)
    this.reserve = input => port.reserve(input)
    this.settle = id => port.settle(id)
    this.recover = input => port.recover(input)
  }
}

class SqlGovernanceRecoveryService extends IdentityGovernanceRecoveryService {
  readonly resume: IdentityGovernanceRecovery['resume']
  readonly recover: IdentityGovernanceRecovery['recover']
  constructor(ctx: Context, port: IdentityGovernanceRecovery) {
    super(ctx)
    this.resume = input => port.resume(input)
    this.recover = input => port.recover(input)
  }
}

const configSchema: StandardSchema<IdentitySqlConfig> = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness-identity-sql',
    validate(value: unknown) {
      const judged = parseIdentitySqlConfig(value)
      if (judged.kind === 'valid') return { value: judged.config }
      return {
        issues: judged.problems.map(problem => ({ message: `${problem.field}: ${problem.rule}` })),
      }
    },
  },
}

export const IdentitySqlPlugin = definePlugin({
  name: 'identity-sql',
  Config: configSchema,
  inject: [storageKey, identityClockKey],
  async apply(ctx, config) {
    const judged = parseIdentitySqlConfig(config)
    if (judged.kind !== 'valid') throw new Error('identity-sql configuration rejected')
    const storage = ctx.storage
    const clock = ctx.identityClock
    const opened = openScrypt(SCRYPT_PROFILE)
    if (!opened.ok) throw new Error(`scrypt profile rejected: ${opened.code}`)
    const scrypt = opened.module
    const fail = async (message: string): Promise<never> => {
      await scrypt.close()
      throw new Error(message)
    }
    // The decoy: a random secret derived once, kept in memory only (DP3-C6).
    const decoy = scrypt.derive(randomBytes(32).toString('base64url'), () => ({ ok: true }))
    if (!('done' in decoy)) return fail(`decoy-derive-failed:${decoy.code}`)
    const derived = await decoy.done
    if (derived.code !== 'material') return fail(`decoy-derive-failed:${derived.code}`)
    const registered = await storage.registerCombination(identitySqlRegistration())
    if (registered.kind !== 'registered')
      return fail(
        `identity combination not registered: ${registered.kind}${
          registered.kind === 'rejected_before_accept' ? `/${registered.reason}` : ''
        }`,
      )
    const provider = createIdentitySql({
      storage,
      clock,
      terms: constantLoginTerms(judged.terms),
      accessRefreshGranularity: judged.accessRefreshGranularity,
      invitationTerms: constantInvitationTerms(judged.invitationTerms),
      scrypt,
      decoyMaterial: derived.material,
      principalVerifier: {
        async verify(value) {
          const verifier = ctx.get(principalVerifierKey)
          return verifier === undefined
            ? { kind: 'unavailable', diagnostic: 'principal-verifier-missing' }
            : verifier.verify(value)
        },
      },
      destinationResolver: {
        async seal(reservation) {
          const resolver = ctx.get(standingDestinationResolverKey)
          return resolver === undefined
            ? { kind: 'unavailable', diagnostic: 'destination-resolver-missing' }
            : resolver.seal(reservation)
        },
      },
    })
    new IdentitySqlOperationsService(ctx, provider.operations)
    new IdentitySqlStandingService(ctx, provider.standing)
    new IdentitySqlGovernanceService(ctx, provider.governance)
    new SqlReservationsService(ctx, provider.reservations)
    new SqlGovernanceRecoveryService(ctx, provider.governanceRecovery)
    // One effect, so the order holds: stop new calls first, then wait for scrypt to finish.
    ctx.effect(() => async () => {
      provider.stop()
      await scrypt.close()
    })
  },
})

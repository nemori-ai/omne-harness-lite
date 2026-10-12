import type {
  AccountsService,
  LoginsService,
  CredentialsService,
} from '@omne-harness-lite/account-identity'
import type { RegistrationService } from '@omne-harness-lite/account-registration'
import type {
  OrganizationsService,
  MembershipsService,
  OffersService,
} from '@omne-harness-lite/organization-governance'
import type { AccountParticipation, LoginParticipation } from '@omne-harness-lite/account-identity'
import type {
  OrganizationsParticipation,
  MembershipsParticipation,
  OffersParticipation,
} from '@omne-harness-lite/organization-governance'

/**
 * 入口层经 inject 取得的参与方面，收窄到本表调用的方法：`logins` 没有 `verify`（AI S-17 只给进程内），
 * `credentials` 只有 `parse`，`memberships` 没有 `sweepStaleSelections`，`organizations` 没有 `createPersonal`。
 */
export interface EntryServices {
  readonly accounts: Pick<AccountsService, 'participate'>
  readonly logins: Pick<
    LoginsService,
    'issue' | 'exchange' | 'revoke' | 'listEffective' | 'participate' | 'prepareCredentialChange'
  >
  readonly registration: Pick<RegistrationService, 'register'>
  readonly credentials: Pick<CredentialsService, 'parse'>
  readonly organizations: Pick<
    OrganizationsService,
    | 'participate'
    | 'createTeam'
    | 'read'
    | 'dissolveAffiliation'
    | 'ancestorChain'
    | 'shareAncestor'
    | 'scopeLayers'
  >
  readonly memberships: Pick<
    MembershipsService,
    | 'participate'
    | 'standing'
    | 'mine'
    | 'changeRole'
    | 'remove'
    | 'currentTenant'
    | 'switchCurrentTenant'
    | 'list'
  >
  readonly offers: OffersService
}

/** Ordinary independent operations are not present in the authenticated unit. */
export interface AuthenticatedServices {
  readonly accounts: Pick<AccountParticipation, 'resolveActivatedIdentifier'>
  readonly logins: LoginParticipation
  readonly organizations: OrganizationsParticipation
  readonly memberships: MembershipsParticipation
  readonly offers: OffersParticipation
}

export interface DecisionServices {
  readonly credentials: Pick<CredentialsService, 'parse'>
  readonly registration: Pick<RegistrationService, 'register'>
  readonly logins: Pick<LoginsService, 'issue' | 'exchange' | 'prepareCredentialChange'>
}

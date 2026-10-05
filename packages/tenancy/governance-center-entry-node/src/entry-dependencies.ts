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
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { EntryOpeningSignal, ServingNotice } from '@omne-harness-lite/governance-center-entry'
import type { GovernanceCenterLogger } from './work.ts'

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

export interface EntryNotifications {
  serving(notice: ServingNotice): void
  stopped(): void
  defect(): void
  onListening(listener: () => void): () => void
}

export interface GovernanceCenterEntryDependencies {
  readonly storage: AtomicStorage
  readonly clock: Clock
  readonly services: EntryServices
  readonly opening: EntryOpeningSignal
  readonly logger: GovernanceCenterLogger
  readonly notifications: EntryNotifications
  isCurrent(): boolean
  isReadyToOpen(): boolean
}

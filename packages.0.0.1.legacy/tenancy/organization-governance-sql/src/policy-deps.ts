import type { SigningKey } from '@omne-harness-lite/identity-values'
import type { Clock, Duration } from '@omne-harness-lite/offer-expiry'
import type {
  OrganizationGovernanceEventName,
  OrganizationGovernanceEventPayload,
} from '@omne-harness-lite/organization-governance'
import type { OrgPersistence } from './governance-data.ts'

export interface ResolvedConfig {
  readonly invitationTtlDefault: Duration
  readonly affiliationRequestTtlDefault: Duration
  readonly teamCreationKeyRetention: Duration
  readonly purgeSigningKey: SigningKey
}

export interface PolicyDeps {
  readonly persistence: OrgPersistence
  readonly clock: Clock
  readonly config: ResolvedConfig
  readonly logger: {
    error(message: string, ...values: unknown[]): void
    info(message: string, ...values: unknown[]): void
  }
  /** 提交之后的通知派发（S-40）：不等待、不读返回值；监听者抛出只记日志，不改已提交的事实。 */
  notify<K extends OrganizationGovernanceEventName>(
    name: K,
    payload: OrganizationGovernanceEventPayload<K>,
  ): void
}

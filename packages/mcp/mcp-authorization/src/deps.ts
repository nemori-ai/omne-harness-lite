import type { Outcome } from '@omne-harness/operation-result'
import type {
  AuthorizationRecords,
  GrantKey,
  GrantSecrets,
  OAuthFetch,
} from '@omne-harness/mcp-contract/provider'
import type { Random } from './requests.ts'

export type McpAuthorizationDeps = Readonly<{
  records: AuthorizationRecords
  secrets: GrantSecrets
  fetch: OAuthFetch
  now(): number
  random: Random
  /** How long a pending authorization waits for its callback. */
  pendingMs: number
  /** How long before its expiry an access token is refreshed first. */
  refreshLeadMs: number
  /** The bound of one request a refresh sends; it is not any caller's bound. */
  requestMs: number
  configuredSecret?(key: GrantKey): Promise<Outcome<string | 'absent', 'unavailable'>>
}>

export type Deps = McpAuthorizationDeps

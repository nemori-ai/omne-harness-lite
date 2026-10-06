export type CenterTrust =
  | { readonly mode: 'ca'; readonly certificateAuthorities?: string | Uint8Array }
  | { readonly mode: 'spki'; readonly sha256: string }

export interface PublicHealthOptions {
  readonly url: string | URL
  /** SPKI必须已由调用方确认；本包没有发现/接受/保存信任的副作用。 */
  readonly trust?: CenterTrust
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

export class GovernanceClientConfigurationError extends Error {
  override readonly name = 'GovernanceClientConfigurationError'
}

import type { JsonValue } from '@omne-harness-lite/content-blocks'

export type CredentialRedactionPattern =
  | { readonly kind: 'prefix-token'; readonly prefix: string; readonly alphabet: 'key' | 'auth' }
  | { readonly kind: 'scheme-token'; readonly scheme: string; readonly alphabet: 'key' | 'auth' }

/** All three parameters are explicit. Generic construction is not production approval. */
export interface CredentialRedactionConfig {
  readonly credential_fragment_min_length: number
  readonly credential_header_names: readonly string[]
  readonly credential_patterns: readonly CredentialRedactionPattern[]
}

export type CredentialRedactionResult<T> =
  { readonly ok: T } | { readonly rejected: 'invalidInput' }

export type CredentialRedactionHeaders = Readonly<Record<string, string | readonly string[]>>

/** No credential, configuration, windows or original input can be read from this closure. */
export interface BoundCredentialRedaction {
  readonly text: (value: string) => CredentialRedactionResult<string>
  readonly headers: (
    value: CredentialRedactionHeaders,
  ) => CredentialRedactionResult<CredentialRedactionHeaders>
  /** Raw/error JSON only; do not rewrite required business status, identity or cost facts. */
  readonly json: (value: JsonValue) => CredentialRedactionResult<JsonValue>
}

export interface CredentialRedactionPolicy {
  readonly bind: (knownCredential: string) => CredentialRedactionResult<BoundCredentialRedaction>
}

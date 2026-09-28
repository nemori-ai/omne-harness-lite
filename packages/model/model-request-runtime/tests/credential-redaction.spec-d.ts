import { it, expectTypeOf } from 'vitest'
import { type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  createCredentialRedactionPolicy,
  redact,
  openRouterCredentialRedactionConfig,
  type CredentialRedactionConfig,
  type CredentialRedactionPolicy,
  type BoundCredentialRedaction,
  type CredentialRedactionResult,
  type CredentialRedactionHeaders,
} from '@omne-harness-lite/model-request-runtime'

it('pure public signatures retain explicit config and JSON/header shapes without a secret accessor', () => {
  expectTypeOf(createCredentialRedactionPolicy)
    .parameter(0)
    .toEqualTypeOf<CredentialRedactionConfig>()
  expectTypeOf(createCredentialRedactionPolicy).returns.toEqualTypeOf<CredentialRedactionPolicy>()
  expectTypeOf(redact).parameter(0).toEqualTypeOf<JsonValue>()
  expectTypeOf(redact).parameter(1).toEqualTypeOf<string>()
  expectTypeOf(redact).parameter(2).toEqualTypeOf<CredentialRedactionConfig>()
  expectTypeOf(redact).returns.toEqualTypeOf<CredentialRedactionResult<JsonValue>>()
  expectTypeOf<BoundCredentialRedaction['headers']>().returns.toEqualTypeOf<
    CredentialRedactionResult<CredentialRedactionHeaders>
  >()
  // @ts-expect-error no implicit configuration
  createCredentialRedactionPolicy()
  // @ts-expect-error all three named parameters are required
  createCredentialRedactionPolicy({
    credential_fragment_min_length: 8,
    credential_header_names: [],
  })
  // @ts-expect-error no default config in redact
  redact('known', 'known')
  createCredentialRedactionPolicy({
    ...openRouterCredentialRedactionConfig,
    // @ts-expect-error no callable pattern or open regex
    credential_patterns: [() => 'secret'],
  })
  const policy = createCredentialRedactionPolicy(openRouterCredentialRedactionConfig)
  // @ts-expect-error policy does not expose credential metadata
  policy.credential
  const result = policy.bind('teaching-value')
  if ('ok' in result) {
    // @ts-expect-error bound closure has no raw credential accessor
    result.ok.knownCredential
    // @ts-expect-error protected header values cannot be numbers
    result.ok.headers({ A: 4 })
    // @ts-expect-error baseline is immutable
    openRouterCredentialRedactionConfig.credential_fragment_min_length = 1
  }
})

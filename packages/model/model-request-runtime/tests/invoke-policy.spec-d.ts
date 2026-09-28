import { expectTypeOf, test } from 'vitest'
import type { RawHeaders, Failure } from '@omne-harness-lite/model-response/v5'
import type {
  CredentialRedactionConfig,
  InvocationPolicy,
  ModelInvocationResult,
  SendResult,
  StreamEnd,
  TransportFailure,
} from '@omne-harness-lite/model-request-runtime'
test('D095 explicit complete configuration and one MR5 header handoff', () => {
  expectTypeOf<InvocationPolicy['credentialRedaction']>().toEqualTypeOf<CredentialRedactionConfig>()
  expectTypeOf<InvocationPolicy>().not.toHaveProperty('redact')
  expectTypeOf<TransportFailure>().not.toHaveProperty('headers')
  expectTypeOf<Extract<SendResult<object>, { response: object }>['rawHeaders']>().toEqualTypeOf<
    RawHeaders | undefined
  >()
  expectTypeOf<Extract<SendResult<object>, { rejected: string }>>().not.toHaveProperty('rawHeaders')
  expectTypeOf<StreamEnd>().not.toHaveProperty('rawHeaders')
  expectTypeOf<ModelInvocationResult['rawHeaders']>().toEqualTypeOf<RawHeaders | undefined>()
  expectTypeOf<ModelInvocationResult['failure']>().toEqualTypeOf<Failure | undefined>()
})

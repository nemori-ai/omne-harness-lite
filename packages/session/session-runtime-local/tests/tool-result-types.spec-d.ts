import { expectTypeOf } from 'vitest'
import type { CoordinationAuthority, AttemptPermit } from '@omne-harness-lite/session-runtime'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  LocalToolResultCustody,
  LocalToolResultDelivery,
  ToolResultInput,
  ToolDeliveryInput,
} from '../src/index.ts'

expectTypeOf<Parameters<LocalToolResultCustody['store']>>().toEqualTypeOf<
  [CoordinationAuthority, SessionScope, ToolResultInput]
>()
expectTypeOf<ToolDeliveryInput['permit']>().toEqualTypeOf<AttemptPermit>()
expectTypeOf<Parameters<LocalToolResultDelivery['confirm']>>().toEqualTypeOf<
  [CoordinationAuthority, SessionScope, ToolDeliveryInput]
>()
declare const input: ToolResultInput
declare const pending: PendingModelResponse
// @ts-expect-error Tool custody is not a Model Pending response.
const wrongResult: ToolResultInput = pending
// @ts-expect-error Current permit must not be required for original result custody.
input.permit
declare const withoutPermit: Omit<ToolDeliveryInput, 'permit'>
// @ts-expect-error Ordinary message adoption requires the current actual attempt permit.
const unqualified: ToolDeliveryInput = withoutPermit
void [wrongResult, unqualified]

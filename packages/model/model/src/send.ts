import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ModelFailure, ModelSendBoundary, SendDemand } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { SendLifetime } from './send/lifetime.ts'
import { createAttemptRunner, refused, unavailable, type SendAttempt } from './send/attempt.ts'
import type { ModelSendBoundaryOptions } from './send/types.ts'
export type {
  CredentialSelection,
  ModelSendBoundaryOptions,
  SendCoordinator,
  SendResource,
  SendResources,
  SendStart,
} from './send/types.ts'
function snapshot<P>(input: SendDemand<P>): SendDemand<P> {
  return {
    principal: input.principal,
    tenant: input.tenant,
    call: input.call,
    dispatch: input.dispatch,
    execution: {
      tenant: input.execution.tenant,
      call: input.execution.call,
      instance: input.execution.instance,
      generation: input.execution.generation,
    },
    ...structuredClone({
      request: input.request,
      supplier: input.supplier,
      consumer: input.consumer,
      initiator: input.initiator,
    }),
  }
}
function sameDemand<P>(left: SendDemand<P>, right: SendDemand<P>): boolean {
  const data = (input: SendDemand<P>) => ({
    execution: {
      call: input.execution.call,
      instance: input.execution.instance,
      generation: input.execution.generation,
    },
    request: input.request,
    supplier: input.supplier,
    consumer: input.consumer,
    initiator: input.initiator,
  })
  return isDeepStrictEqual(data(left), data(right))
}

export function createModelSendBoundary<P>(
  options: ModelSendBoundaryOptions<P>,
): ModelSendBoundary<P> {
  const { coordinator, maxRetainedAttempts } = options
  if (!Number.isSafeInteger(maxRetainedAttempts) || maxRetainedAttempts <= 0)
    throw new RangeError('maxRetainedAttempts must be a positive safe integer')
  const attempts = new Map<string, SendAttempt<P>>()
  const perform = createAttemptRunner(options, attempts)
  const unknown = (attempt: SendAttempt<P>, diagnostic: string) => ({
    kind: 'unknown' as const,
    dispatch: attempt.input.dispatch,
    diagnostic,
  })
  return {
    async send(demand, signal) {
      let input: SendDemand<P>
      try {
        input = snapshot(demand)
      } catch {
        return refused({ kind: 'invalid', field: 'send', reason: 'snapshot' })
      }
      let access: Outcome<void, ModelFailure>
      try {
        access = coordinator.check(input)
      } catch {
        return refused(unavailable('model-send', 'qualification-unavailable'))
      }
      if ('failure' in access) return refused(access.failure)
      const tenant = tenantCodec.encode(input.tenant)
      if (!tenant.ok) return refused({ kind: 'denied', action: 'tenant' })
      const id = JSON.stringify([tenant.value, input.call, input.dispatch])
      let attempt = attempts.get(id)
      if (attempt) {
        if (!sameDemand(attempt.input, input))
          return refused({ kind: 'invalid', field: 'dispatch', reason: 'send-input-conflict' })
        if (attempt.busy) return unknown(attempt, 'original-send-busy')
      } else {
        if (attempts.size >= maxRetainedAttempts)
          return refused(unavailable('model-send', 'retained-attempt-capacity'))
        attempt = {
          input,
          signal,
          lifetime: new SendLifetime(),
          window: `receive_${randomUUID()}`,
          receipt: undefined,
          stage: { kind: 'acquire' },
          busy: false,
        }
        attempts.set(id, attempt)
      }
      attempt.busy = true
      return perform(id, attempt)
    },
  }
}

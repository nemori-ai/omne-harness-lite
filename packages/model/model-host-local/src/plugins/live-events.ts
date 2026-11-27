import type { TenantId } from '@omne-harness/legal-identity'
import type { LiveDeliveryAnswer, LiveEventPort } from '@omne-harness/model'
import type {
  ModelCallId,
  ModelDelivery,
  ModelDeliveryFailure,
  ModelInvocationRef,
  ModelResultReceiver,
} from '@omne-harness/model-contract'
import type { ModelHostAuthority } from '@omne-harness/model-contract/provider'
import { answerOf, frozen } from './push-values.ts'

type Target = Readonly<{ tenant: TenantId; call: ModelCallId }>

export type LiveEventsInput = Readonly<{
  authority: ModelHostAuthority<unknown>
  /** The reference of the call, from its durable origin; null when it cannot be read now. */
  reference(target: Target, principal: unknown): Promise<ModelInvocationRef | null>
  receiver(owner: string): ModelResultReceiver<unknown> | null
  /** The body of the call has gone: its result may be pushed now. */
  exited(target: Target): void
}>

function answerFor(failure: ModelDeliveryFailure): LiveDeliveryAnswer {
  switch (failure.kind) {
    case 'outcome-unknown':
      return 'unknown'
    case 'unavailable':
    case 'backpressured':
    case 'cancelled-before-accept':
      return 'waiting'
    case 'denied':
    case 'invalid':
    case 'conflict':
      return 'refused'
  }
}

/** Pushes a run of live events to the receiver of the consumer frozen at admission, keyed like its result. */
export function createLiveEvents(input: LiveEventsInput): LiveEventPort {
  return {
    async deliver({ tenant, call, consumer, from, to, frames }, signal) {
      const resolved = await input.authority.resolve({ tenant, call })
      if ('failure' in resolved) return 'waiting'
      const { principal } = resolved.ok
      const reference = await input.reference({ tenant, call }, principal)
      const receiver = input.receiver(consumer.owner)
      if (reference === null || receiver === null) return 'waiting'
      const delivery = frozen<ModelDelivery>({
        kind: 'live',
        key: { kind: 'live', reference, from, to },
        consumer,
        frames,
      })
      let outcome: Awaited<ReturnType<ModelResultReceiver<unknown>['push']>>
      try {
        outcome = await receiver.push({ access: { principal, tenant }, delivery, signal })
      } catch {
        return 'unknown'
      }
      const answer = answerOf(delivery, outcome)
      return 'saved' in answer ? 'saved' : answerFor(answer.failure)
    },
    exited: target => input.exited(target),
  }
}

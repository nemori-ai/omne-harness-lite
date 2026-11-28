import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelRuntimeProvider, SendResource } from '@omne-harness/model'
import type {
  ConsumerRef,
  LiveModelRequest,
  LlmModelRequest,
  ModelCallId,
  ModelOperationId,
  ModelRuntime,
} from '@omne-harness/model-contract'
import type { ConformanceLive } from '@omne-harness/model-contract/conformance'
import type {
  LiveFact,
  LiveSession,
  MaterializedLiveTransport,
} from '@omne-harness/model-contract/provider'

/** The one upstream session of a live call: the facts the test plays into it. */
export type LiveUpstream = Readonly<{
  opens(): number
  open(): LiveSession
  play(fact: LiveFact): void
  /** Whether the body has read every fact played so far and waits for the next. */
  drained(): boolean
}>

function liveUpstream(): LiveUpstream {
  const queue: (LiveFact | 'end')[] = []
  let wake = Promise.withResolvers<void>()
  let opens = 0
  let waiting = false
  const play = (fact: LiveFact | 'end') => {
    queue.push(fact)
    wake.resolve()
    wake = Promise.withResolvers<void>()
  }
  return {
    opens: () => opens,
    play,
    drained: () => queue.length === 0 && waiting,
    open() {
      opens += 1
      return {
        facts: {
          [Symbol.asyncIterator]: () => ({
            async next() {
              waiting = true
              while (queue.length === 0) await wake.promise
              waiting = false
              const fact = queue.shift()
              if (fact === 'end' || fact === undefined) return { done: true, value: undefined }
              return { done: false, value: fact }
            },
            async return() {
              play('end')
              return { done: true, value: undefined }
            },
          }),
        },
        input: { send: () => 'sent', media: () => 'sent', close: () => {} },
      }
    },
  }
}

export function liveUpstreams() {
  const made = new Map<ModelCallId, LiveUpstream>()
  return {
    of(call: ModelCallId): LiveUpstream {
      const known = made.get(call)
      if (known !== undefined) return known
      const created = liveUpstream()
      made.set(call, created)
      return created
    },
    /** Closes every session, so every live call can settle. */
    dispose() {
      for (const upstream of made.values()) upstream.play({ kind: 'closed' })
    },
  }
}

/** A send resource whose binding opens the call's upstream session instead of starting a request. */
export function liveResource(
  upstream: LiveUpstream,
  receipt: MaterializedLiveTransport['receipt'],
): SendResource {
  return {
    transport: {
      async prepare() {
        return {
          ok: {
            async materialize() {
              return { ok: { receipt, open: () => upstream.open(), close: async () => {} } }
            },
            close: async () => {},
          },
        }
      },
    },
    openWithCredential: (materialized, _secrets, signal) => materialized.open(signal),
    startWithCredential() {
      throw new Error('a live binding starts no request')
    },
    release: async () => {},
  }
}

/** A live request on the profile and suppliers of a chat request, taking text and voice in. */
export function liveRequestOf(request: LlmModelRequest): LiveModelRequest {
  const { profile, suppliers, retryPolicy, source } = request
  return {
    kind: 'live',
    profile,
    suppliers,
    fallback: false,
    retryPolicy,
    source,
    input: ['text', 'voice'],
    instructions: 'Answer the caller briefly.',
    history: [],
    voice: null,
    media: { via: 'link', audio: 'pcm16' },
  }
}

type Settled = (call: ModelCallId) => Promise<boolean>

/**
 * The live part of a conformance subject over a real runtime: the calls go to the process that holds
 * the body, and losing the body hands them to a successor over the same store, which holds none.
 */
export function liveSubjectPart(
  input: Readonly<{
    runtime: ModelRuntime<unknown>
    principal: unknown
    tenant: TenantId
    consumer: ConsumerRef
    request: LiveModelRequest
    upstreams: ReturnType<typeof liveUpstreams>
    process: ModelRuntimeProvider<unknown>
    successor(): ModelRuntimeProvider<unknown>
    settled: Settled
    callOf(label: string): ModelCallId
    operationOf(label: string): ModelOperationId
    until(check: () => boolean | Promise<boolean>, label: string): Promise<void>
  }>,
): ConformanceLive<unknown> {
  let current = input.process
  const { tenant } = input
  return {
    calls: {
      command: given => current.live.command(given),
      end: given => current.live.end(given),
      media: given => current.live.media(given),
    },
    async admit(label) {
      const call = input.callOf(`live-${label}`)
      const admitted = await input.runtime.calls.admit({
        principal: input.principal,
        tenant,
        call,
        operation: input.operationOf(`admit-live-${label}`),
        request: input.request,
        consumer: input.consumer,
      })
      if ('failure' in admitted)
        throw new Error(`live admission refused: ${JSON.stringify(admitted.failure)}`)
      await input.until(() => current.holdsLiveBody({ tenant, call }), `the live body of ${call}`)
      return { tenant, call }
    },
    async upstream({ call, step }) {
      const upstream = input.upstreams.of(call)
      upstream.play(step === 'open' ? { kind: 'opened', expiresAt: null } : { kind: 'closed' })
      if (step === 'open') await input.until(() => upstream.drained(), `the opening of ${call}`)
      else await input.until(() => input.settled(call), `the settlement of ${call}`)
    },
    async loseBody() {
      current = input.successor()
    },
  }
}

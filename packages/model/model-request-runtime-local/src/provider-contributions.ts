import type { Context } from '@deepseek-ai/cordis'
import type {
  CallConsumer,
  ModelFailureSource,
  ModelRuntimeHostLease,
} from '@omne-harness-lite/model-request-runtime'

/** The provider owns every borrow, including acquisition before a caller can receive a handle. */
export function createProviderContributions() {
  const pending = new Set<ReturnType<typeof borrow>>()
  let stopping = false

  function borrow(lease: ModelRuntimeHostLease, ctx?: Context) {
    const acquired = Promise.withResolvers<void>()
    let consumer: CallConsumer | undefined
    let source: ModelFailureSource | undefined
    let withdrawn = stopping
    let returned = false
    let requested = false
    let detach: (() => Promise<void>) | undefined
    let closing: Promise<void> | undefined
    function releaseLease() {
      if (returned) return
      lease.release()
      returned = true
      pending.delete(entry)
      const dispose = detach
      detach = undefined
      // Cordis returns void when this effect is already being disposed by its caller.
      // Schedule the unlink without re-entering that same close promise.
      if (dispose)
        void Promise.resolve()
          .then(() => dispose())
          .catch(() => ctx?.logger.error('model_runtime.caller_effect_failed'))
    }
    function releaseSource() {
      if (returned) return
      source?.release()
      releaseLease()
    }
    function close(): Promise<void> {
      withdrawn = true
      if (closing) return closing
      closing = acquired.promise
        .then(async () => {
          if (returned) return
          if (consumer) {
            requestConsumerStop()
            await consumer.stopped
          } else source?.release()
          releaseLease()
        })
        .finally(() => {
          closing = undefined
        })
      return closing
    }
    function requestConsumerStop() {
      if (requested) return
      consumer?.release()
      requested = true
    }
    const entry = {
      close,
      async complete(handle?: CallConsumer | ModelFailureSource) {
        if (handle && 'stopped' in handle) {
          consumer = handle
          void handle.stopped
            .then(releaseLease)
            .catch(() => ctx?.logger.error('model_runtime.caller_stop_unconfirmed'))
        } else source = handle
        acquired.resolve()
        if (!handle) releaseLease()
        else if (withdrawn) await close()
      },
      consumer(original: CallConsumer): CallConsumer {
        return Object.freeze({
          wait: (input: Parameters<CallConsumer['wait']>[0]) => original.wait(input),
          stopped: original.stopped,
          release() {
            if (returned) return
            // release requests stopping. Only the actual stopped observation returns the borrow.
            requestConsumerStop()
            void close().catch(() => ctx?.logger.error('model_runtime.caller_close_failed'))
          },
        })
      },
      source(original: ModelFailureSource): ModelFailureSource {
        return Object.freeze({
          subject: original.subject,
          verify: (...args: Parameters<ModelFailureSource['verify']>) => original.verify(...args),
          release: releaseSource,
        })
      },
      withdrawn: () => withdrawn,
    }
    pending.add(entry)
    if (ctx) {
      try {
        detach = ctx.effect(() => close, 'model-runtime.caller-borrow')
      } catch (error) {
        acquired.resolve()
        releaseLease()
        throw error
      }
    }
    return entry
  }

  return Object.freeze({
    borrow,
    closeAdmission() {
      stopping = true
    },
    async close() {
      stopping = true
      const outcomes = await Promise.allSettled([...pending].map(entry => entry.close()))
      const failure = outcomes.find(outcome => outcome.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
      if (pending.size) throw new Error('model runtime caller borrows retained')
    },
  })
}

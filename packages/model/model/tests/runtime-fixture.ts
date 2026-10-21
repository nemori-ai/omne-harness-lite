import {
  createModelRuntime,
  type ModelConfiguration,
  type SendResources,
} from '@omne-harness/model'
import { createTestModelDependencies, type MemoryModelEvidence } from '@omne-harness/model/testing'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'
import {
  decodeCredentialId,
  type ModelCommands,
  type ModelCallId,
  type Publication,
  type TransportFact,
  type ModelInstanceId,
} from '@omne-harness/model-contract'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

export const configuration: ModelConfiguration = {
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 1024,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 128,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
export async function eventually(predicate: () => boolean) {
  for (let i = 0; i < 3000; i++) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error('controlled runtime did not reach the expected boundary')
}
export function runtimeFixture(
  config: Partial<ModelConfiguration> = {},
  wrap?: (
    commands: ModelCommands<ReturnType<typeof fixture>['principal']>,
  ) => ModelCommands<ReturnType<typeof fixture>['principal']>,
  handoff?: MemoryModelEvidence['handoff'],
) {
  const f = fixture()
  const assembly = createTestModelDependencies({
    ...f.options,
    evidence: f.options.evidence.map(adapter => (handoff ? { ...adapter, handoff } : adapter)),
    start: '2026-10-19T00:00:00Z',
    maxWaiters: 100,
    maxQueued: 100,
    sends: [],
    sending: {
      maxRetainedAttempts: 100,
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'value', scope: 'factory', value: 'synthetic' }),
      },
      sources: [
        {
          profile: f.admit.request.profile,
          supplier: f.admit.request.suppliers[0].adoption,
          recipient: f.admit.request.suppliers[0].recipient,
          model: f.admit.request.suppliers[0].model,
          credential: {
            kind: 'factory',
            official: true,
            queryId: unbox(decodeCredentialId('runtime-query')),
          },
          current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
        },
      ],
    },
  })
  type Channel = {
    ready: ReturnType<typeof deferred<void>>
    reads: number
    starts: number
    returns: number
    closes: number
    releaseFails: boolean
    beforeRelease(): Promise<void>
    finish(): void
    fail(): void
    push(facts: readonly TransportFact[]): void
    iterable: AsyncIterable<TransportFact>
  }
  let disposing = false
  const channels = new Map<ModelCallId, Channel>()
  function channel(call: ModelCallId): Channel {
    let value = channels.get(call)
    if (!value) {
      const ready = deferred<void>()
      let waiter = deferred<void>()
      let done = false
      let failure = false
      const queue: TransportFact[] = []
      const made: Channel = {
        ready,
        reads: 0,
        starts: 0,
        returns: 0,
        closes: 0,
        releaseFails: false,
        beforeRelease: async () => {},
        finish() {
          done = true
          waiter.resolve()
        },
        fail() {
          failure = true
          done = true
          waiter.resolve()
        },
        push(facts) {
          queue.push(...structuredClone(facts))
          waiter.resolve()
        },
        iterable: {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                made.reads++
                while (!done && !queue.length) await waiter.promise
                if (failure) throw new Error('synthetic-transport-failure')
                const fact = queue.shift()
                if (!queue.length) waiter = deferred<void>()
                return fact
                  ? { done: false as const, value: fact }
                  : { done: true as const, value: undefined }
              },
              async return() {
                made.returns++
                done = true
                waiter.resolve()
                return { done: true as const, value: undefined }
              },
            }
          },
        },
      }
      if (disposing) {
        made.ready.resolve()
        made.push([{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }])
      }
      value = made
      channels.set(call, value)
    }
    return value
  }
  const preserveInputs: Parameters<typeof assembly.dependencies.commands.preserve>[0][] = []
  const openInputs: Parameters<typeof assembly.dependencies.commands.openReceiveWindow>[0][] = []
  const base = assembly.dependencies.commands
  const commands = wrap?.(base) ?? base
  const recorded = {
    ...commands,
    async preserve(input: Parameters<typeof commands.preserve>[0]) {
      preserveInputs.push(input)
      return commands.preserve(input)
    },
    async openReceiveWindow(input: Parameters<typeof commands.openReceiveWindow>[0]) {
      openInputs.push(input)
      return commands.openReceiveWindow(input)
    },
  }
  const resources: SendResources<typeof f.principal> = {
    async acquire(demand) {
      const stream = channel(demand.call)
      await stream.ready.promise
      const script = createScriptedTransport({
        receipt: {
          supplier: demand.supplier.adoption,
          representation: demand.request.representation,
          payloadDigest: 'a'.repeat(64),
        },
        facts: [],
        ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
        rejection: null,
      })
      return {
        ok: {
          transport: script.transport,
          startWithCredential() {
            stream.starts++
            return stream.iterable
          },
          async release() {
            await stream.beforeRelease()
            stream.closes++
            if (stream.releaseFails) throw new Error('synthetic-release-failure')
          },
        },
      }
    },
  }
  const send = assembly.controls.send.createSender({ resources, commands: recorded })
  const publications = new Map<ModelCallId, Publication>()
  const published = new Map<ModelCallId, ReturnType<typeof deferred<void>>>()
  const drives: Promise<unknown>[] = []
  const results = new Map<ModelCallId, unknown>()
  const instances = {
    ...assembly.dependencies.instances,
    async publish(...args: Parameters<typeof assembly.dependencies.instances.publish>) {
      const result = await assembly.dependencies.instances.publish(...args)
      if ('ok' in result) {
        publications.set(args[0].call, result.ok)
        published.get(args[0].call)?.resolve()
      }
      return result
    },
    async schedule(input: Parameters<typeof assembly.dependencies.instances.schedule>[0]) {
      const result = await assembly.dependencies.instances.schedule(input)
      if ('failure' in result || published.has(input.call)) return result
      const ready = deferred<void>()
      published.set(input.call, ready)
      const running = provider.driver
        .drive(
          {
            ...input,
            principal: f.principal,
            operation: op(`claim-${input.call}`),
            instance: instance(input.call),
            continuity: proof(input.call),
          },
          new AbortController().signal,
        )
        .then(value => {
          results.set(input.call, value)
          ready.resolve()
          return value
        })
      drives.push(running)
      await ready.promise
      return result
    },
  }
  const dependencies = { ...assembly.dependencies, commands: recorded, send, instances }
  const provider = createModelRuntime(dependencies, { ...configuration, ...config })
  return {
    ...f,
    ...assembly,
    provider,
    dependencies,
    channel,
    preserveInputs,
    openInputs,
    publications,
    results,
    drive(call: ModelCallId = f.admit.call) {
      return provider.driver.drive(
        {
          principal: f.principal,
          tenant: f.tenant,
          call,
          operation: op(`claim-${call}`),
          instance: instance(call),
          continuity: proof(call),
        },
        new AbortController().signal,
      )
    },
    async start(call: ModelCallId) {
      channel(call).ready.resolve()
      await eventually(() => channel(call).starts === 1)
    },
    async show(call: ModelCallId, facts: readonly TransportFact[]) {
      const before = preserveInputs.length
      channel(call).push(facts)
      await eventually(() => preserveInputs.length >= before + facts.length || results.has(call))
      // Let the real command receipt reach the observation projection.
      for (let i = 0; i < 100; i++) await Promise.resolve()
    },
    async replace(call: ModelCallId, next: ModelInstanceId) {
      const successor = createModelRuntime(dependencies, { ...configuration, ...config })
      return successor.driver.drive(
        {
          principal: f.principal,
          tenant: f.tenant,
          call,
          operation: op(`replacement-${call}`),
          instance: next,
          continuity: proof(call),
        },
        new AbortController().signal,
      )
    },
    async dispose() {
      disposing = true
      for (const stream of channels.values()) {
        stream.ready.resolve()
        stream.push([{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }])
      }
      await Promise.all(drives)
    },
  }
}

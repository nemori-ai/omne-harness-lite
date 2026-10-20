import { createModelRuntime, type SendResources } from '@omne-harness/model'
import { createTestModelDependencies, type MemorySendSource } from '@omne-harness/model/testing'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'
import {
  decodeCredentialId,
  type CredentialPort,
  type CredentialResolution,
  type ModelCommands,
  type SendDemand,
  type MaterializedTransport,
  type TransportFact,
} from '@omne-harness/model-contract'
import { fixture, identity, instance, op, proof, unbox } from './memory-fixture.ts'

export const factoryId = unbox(decodeCredentialId('official-query'))
export const tenantId = unbox(decodeCredentialId('tenant-key'))
export const synthetic = 'synthetic-send-credential'
export type Principal = ReturnType<typeof fixture>['principal']
export const signal = () => new AbortController().signal
export async function sendFixture(
  options: {
    tenant?: boolean
    credentials?: CredentialPort
    registered?: boolean
    max?: number
    facts?: Parameters<typeof createScriptedTransport>[0]['facts']
    configureSource?(source: MemorySendSource<Principal>): void
  } = {},
) {
  const f = fixture()
  const originalRequest = structuredClone(f.admit.request)
  const request = options.tenant
    ? {
        ...originalRequest,
        suppliers: [
          {
            ...originalRequest.suppliers[0],
            credential: { kind: 'tenant' as const, id: tenantId },
          },
        ] as const,
      }
    : originalRequest
  let sourceAuthorized = true,
    noTenantBinding = true
  const admit = { ...f.admit, request }
  const source: MemorySendSource<Principal> = {
    profile: structuredClone(request.profile),
    supplier: structuredClone(request.suppliers[0].adoption),
    recipient: request.suppliers[0].recipient,
    model: request.suppliers[0].model,
    credential: options.tenant
      ? { kind: 'tenant' }
      : { kind: 'factory', official: true, queryId: factoryId },
    current: () => ({ ok: { authorized: sourceAuthorized, noTenantBinding } }),
  }
  options.configureSource?.(source)
  const credentials: CredentialPort = options.credentials ?? {
    present: () => ({ kind: 'unavailable' }),
    resolve: () => ({
      kind: 'value',
      scope: options.tenant ? 'tenant' : 'factory',
      value: synthetic,
    }),
  }
  const assembly = createTestModelDependencies({
    ...f.options,
    start: '2026-10-19T00:00:00Z',
    maxWaiters: 2,
    maxQueued: 10,
    sends: [],
    sending: {
      credentials,
      sources: options.registered === false ? [] : [source],
      maxRetainedAttempts: options.max ?? 4,
    },
  })
  const provider = createModelRuntime(assembly.dependencies, {
    outputBatchBytes: 1024,
    outputBatchDelayMs: 0,
    observerBufferBytes: 1024,
    resultPageTargetBytes: 128,
    readIdleMs: 1000,
    retryBackoffMs: 0,
    cleanupRetryMs: 0,
  })
  unbox(await provider.runtime.calls.admit(admit))
  unbox(
    await provider.driver.drive(
      { ...admit, operation: op('claim'), instance: instance(), continuity: proof(admit.call) },
      signal(),
    ),
  )
  const recovery = unbox(await assembly.dependencies.commands.loadRecovery(admit))
  const dispatch = unbox(await provider.runtime.calls.dispatches(admit))[0]
  if (!dispatch || !recovery.execution) throw new Error('fixture prepared dispatch')
  const demand: SendDemand<Principal> = {
    ...admit,
    execution: recovery.execution,
    dispatch: dispatch.dispatch,
    supplier: dispatch.supplier,
    initiator: recovery.initiator,
  }
  const events: string[] = []
  const delivered: TransportFact[] = []
  let starts = 0,
    pulls = 0,
    returns = 0,
    acquired = 0
  let valueMatches = false,
    receivedSignal: AbortSignal | undefined
  let startThrows = false,
    streamThrows = false
  const releaseFailures = new Set<string>()
  const resources: SendResources<Principal> = {
    async acquire() {
      acquired += 1
      const transport = createScriptedTransport({
        receipt: {
          supplier: dispatch.supplier.adoption,
          representation: request.representation,
          payloadDigest: 'a'.repeat(64),
        },
        facts: options.facts ?? [
          { kind: 'block-open', index: 'one', mode: 'append', content: 'text' },
        ],
        ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
        rejection: null,
      })
      let materialization: MaterializedTransport | undefined
      const close = async (name: string) => {
        events.push(name)
        if (releaseFailures.has(name)) throw new Error(synthetic)
      }
      return {
        ok: {
          transport: {
            async prepare(input, supplier) {
              const prepared = await transport.transport.prepare(input, supplier)
              if ('failure' in prepared) return prepared
              return {
                ok: {
                  async materialize(abort) {
                    const result = await prepared.ok.materialize(abort)
                    if ('failure' in result) return result
                    materialization = { ...result.ok, close: () => close('materialized') }
                    return { ok: materialization }
                  },
                  close: () => close('prepared'),
                },
              }
            },
          },
          startWithCredential(actual, value, abort) {
            valueMatches = value === synthetic && actual === materialization
            starts += 1
            receivedSignal = abort
            if (startThrows) throw new Error(synthetic)
            const stream = actual.start(abort)
            const source = stream[Symbol.asyncIterator]()
            return {
              [Symbol.asyncIterator]() {
                return {
                  async next() {
                    pulls += 1
                    if (streamThrows) throw new Error(synthetic)
                    const result = await source.next()
                    if (!result.done) delivered.push(result.value)
                    return result
                  },
                  async return() {
                    returns += 1
                    return source.return ? source.return() : { done: true, value: undefined }
                  },
                }
              },
            }
          },
          release: () => close('resource'),
        },
      }
    },
  }
  const makeSender = (
    overrides: Partial<Parameters<typeof assembly.controls.send.createSender>[0]> = {},
  ) => assembly.controls.send.createSender({ resources, ...overrides })
  return {
    ...f,
    ...assembly,
    admit,
    request,
    source,
    credentials,
    provider,
    demand,
    resources,
    makeSender,
    events,
    delivered,
    releaseFailures,
    counts: () => ({ starts, pulls, returns, acquired, valueMatches, receivedSignal }),
    async additionalDemand() {
      const next = {
        ...admit,
        call: unbox(
          (await import('@omne-harness/model-contract')).decodeModelCallId('mcall_second'),
        ),
        operation: op('admit-second'),
      }
      unbox(await provider.runtime.calls.admit(next))
      unbox(
        await provider.driver.drive(
          {
            ...next,
            operation: op('claim-second'),
            instance: instance('second'),
            continuity: proof(next.call),
          },
          signal(),
        ),
      )
      const recovery = unbox(await assembly.dependencies.commands.loadRecovery(next))
      const dispatch = unbox(await assembly.dependencies.commands.dispatches(next))[0]
      if (!recovery.execution || !dispatch) throw new Error('additional prepared')
      return {
        ...next,
        execution: recovery.execution,
        dispatch: dispatch.dispatch,
        supplier: dispatch.supplier,
        initiator: recovery.initiator,
      }
    },
    throwStart: () => {
      startThrows = true
    },
    throwStream: () => {
      streamThrows = true
    },
    otherTenant: identity('6'),
    setSourceAuthorized: (value: boolean) => {
      sourceAuthorized = value
    },
    setNoTenantBinding: (value: boolean) => {
      noTenantBinding = value
    },
  }
}
export function credentialPort(result: CredentialResolution): CredentialPort {
  return { present: () => ({ kind: 'unavailable' }), resolve: () => result }
}
export async function collect(facts: AsyncIterable<TransportFact>) {
  const all = []
  for await (const fact of facts) all.push(fact)
  return all
}
export type SendWriteMethod = 'recordMaterialization' | 'openReceiveWindow' | 'recordSend'
export function faultCommands(
  f: Awaited<ReturnType<typeof sendFixture>>,
  method: SendWriteMethod,
  effect: 'applied' | 'not-applied',
) {
  let injected = false
  const inputs: unknown[] = []
  let original:
    | { tenant: typeof f.tenant; call: typeof f.admit.call; operation: typeof f.admit.operation }
    | undefined
  const commands: ModelCommands<Principal> = { ...f.dependencies.commands }
  // Each wrapper preserves the concrete method's public signature.
  const wrap =
    <A extends Parameters<ModelCommands<Principal>[SendWriteMethod]>[0], T>(
      run: (input: A) => Promise<T>,
    ) =>
    async (input: A) => {
      inputs.push(structuredClone({ ...input, tenant: undefined }))
      if (!injected) {
        injected = true
        original = input
        f.controls.commands.injectUnknown({ ...input, method, effect })
      }
      return run(input)
    }
  if (method === 'recordMaterialization')
    commands.recordMaterialization = wrap(commands.recordMaterialization)
  if (method === 'openReceiveWindow') commands.openReceiveWindow = wrap(commands.openReceiveWindow)
  if (method === 'recordSend') commands.recordSend = wrap(commands.recordSend)
  return {
    commands,
    inputs,
    reveal() {
      if (!original) throw new Error('write not observed')
      f.controls.commands.reveal({
        ...original,
        result: effect === 'applied' ? 'committed' : 'not-committed',
      })
    },
  }
}

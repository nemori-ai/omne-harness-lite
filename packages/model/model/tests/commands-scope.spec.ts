// The run scope that the shared commands core hands to its storage. A durable storage reads the
// tenant, call and operation of an attempt before it runs `work`, so every method names them.
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeResultVersion,
  decodeRevision,
  type ModelCallId,
} from '@omne-harness/model-contract'
import { decodeReadId, type ModelCommands } from '@omne-harness/model-contract/provider'
import { expect, it } from 'vitest'
import {
  createModelCommandsCore,
  hasRecoveryWork,
  modelCommands,
  MODEL_WRITE_METHODS,
  type ModelWriteMethod,
  type ModelCommandStorage,
  type RunScope,
} from '../src/commands/index.ts'
import { copyCall } from '../src/commands/state.ts'
import type { Binding, CallDocument, TenantDocuments } from '../src/commands/types.ts'
import { MemoryState } from '../src/testing/state.ts'
import { adoption, callId, fixture, instance, op, proof, request, unbox } from './memory-fixture.ts'

/** The memory storage, with every scope that the core hands to `run` kept in order. */
function recording(f: ReturnType<typeof fixture>) {
  const memory = new MemoryState(f.options)
  const scopes: (RunScope | undefined)[] = []
  const storage: ModelCommandStorage = {
    run: (work, scope) => {
      scopes.push(scope)
      return memory.run(work, scope)
    },
    documents: key => memory.documents(key),
    reserved: field => memory.reserved(field),
    commit: (key, write) => memory.commit(key, write),
    publish: (key, call) => memory.publish(key, call),
  }
  return { commands: modelCommands(createModelCommandsCore(f.options, storage)), scopes }
}

/** One call of every method: the input is valid in shape, and the call is not required to exist. */
function everyMethod(f: ReturnType<typeof fixture>) {
  const { principal, tenant } = f
  const call = callId()
  const access = { principal, tenant }
  const execution = { tenant, call, instance: instance(), generation: '1' }
  const write = (method: ModelWriteMethod) => ({
    ...execution,
    ...access,
    operation: op(method),
    expected: unbox(decodeRevision('0')),
  })
  const dispatch = unbox(decodeDispatchId('mdisp_one'))
  const [supplier] = request.suppliers
  const evidence = proof(call)
  const calls: Record<
    keyof ModelCommands<unknown>,
    (c: ModelCommands<typeof principal>) => unknown
  > = {
    admit: c => c.admit(f.admit),
    recall: c => c.recall({ ...access, call, admission: op('admit') }),
    scanPending: c => c.scanPending({ ...access, after: null, limit: 1 }),
    loadRecovery: c => c.loadRecovery({ ...access, call }),
    claim: c =>
      c.claim({
        ...access,
        call,
        instance: instance(),
        operation: op('claim'),
        continuity: evidence,
      }),
    prepareDispatch: c =>
      c.prepareDispatch({ ...write('prepareDispatch'), dispatch, supplier, policyDecision: null }),
    recordMaterialization: c =>
      c.recordMaterialization({
        ...write('recordMaterialization'),
        dispatch,
        receipt: { supplier: adoption, representation: adoption, payloadDigest: '0'.repeat(64) },
      }),
    recordSend: c => c.recordSend({ ...write('recordSend'), dispatch, state: 'started' }),
    openReceiveWindow: c =>
      c.openReceiveWindow({ ...write('openReceiveWindow'), dispatch, window: 'w' }),
    preserve: c => c.preserve({ ...write('preserve'), dispatch, window: 'w', facts: [] }),
    recordLateFact: c =>
      c.recordLateFact({
        ...access,
        call,
        dispatch,
        operation: op('recordLateFact'),
        source: evidence,
        fact: { kind: 'terminal', event: 'e', actual: { kind: 'completed', reason: 'stop' } },
      }),
    prepareRetry: c => c.prepareRetry({ ...write('prepareRetry'), dispatch }),
    decideRetry: c =>
      c.decideRetry({
        ...write('decideRetry'),
        position: {
          operation: op('retry'),
          dispatch,
          policy: adoption,
          consumer: f.admit.consumer,
        },
        decision: {
          kind: 'stop',
          fault: { cause: 'unclassified', diagnostic: 'fixture', upstreamStatus: null },
        },
        source: evidence,
      }),
    settle: c =>
      c.settle({ ...write('settle'), termination: { kind: 'completed', reason: 'stop' } }),
    control: c => c.control({ ...access, call, operation: op('control') }),
    acquireRead: c =>
      c.acquireRead({
        ...access,
        call,
        operation: op('acquireRead'),
        result: unbox(decodeResultVersion('mrver_one')),
      }),
    nextRead: c =>
      c.nextRead({ ...access, call, read: unbox(decodeReadId('mread_one')), after: '0' }),
    endRead: c => c.endRead({ ...access, call, read: unbox(decodeReadId('mread_one')) }),
    handoff: c =>
      c.handoff({
        ...access,
        call,
        operation: op('handoff'),
        result: unbox(decodeResultVersion('mrver_one')),
        evidence: { kind: 'processed', completion: evidence },
      }),
    advanceCleanup: c => c.advanceCleanup({ ...execution, operation: op('advanceCleanup') }),
    query: c => c.query({ ...access, call, operation: op('admit') }),
    dispatches: c => c.dispatches({ ...access, call }),
  }
  return calls
}

it('every one of the 22 methods runs its attempt under a scope that names the tenant and the call, and a write also names its operation', async () => {
  const f = fixture()
  const text = tenantCodec.encode(f.tenant)
  if (!text.ok) throw new Error('fixture tenant')
  const writes: readonly string[] = MODEL_WRITE_METHODS
  const calls = everyMethod(f)
  const methods = Object.keys(calls) as (keyof typeof calls)[]
  expect(methods).toHaveLength(22)
  for (const method of methods) {
    const { commands, scopes } = recording(f)
    await calls[method](commands)
    expect(scopes, method).toHaveLength(1)
    const scope = scopes[0]
    const call: ModelCallId = callId()
    if (method === 'scanPending') {
      // A scan reads across calls of the tenant: it names no call and no operation.
      expect(scope, method).toStrictEqual({ tenant: text.value })
    } else if (writes.includes(method)) {
      expect(scope?.tenant, method).toBe(text.value)
      expect(scope?.call, method).toBe(call)
      expect(scope?.operation, method).toBe(op(method))
    } else {
      expect(scope, method).toStrictEqual({ tenant: text.value, call })
    }
  }
})

/** Calls in the four states that decide pending work, over documents the storage returns as they are. */
async function pendingFixture() {
  const f = fixture()
  const memory = new MemoryState(f.options)
  const key = tenantCodec.encode(f.tenant)
  if (!key.ok) throw new Error('fixture tenant')
  unbox(await modelCommands(memory.core).admit(f.admit))
  const base = memory.documents(key.value).calls.get(f.admit.call)
  const binding = memory.documents(key.value).operations.get(f.admit.operation)
  if (!base || !binding) throw new Error('fixture admission')
  const acknowledged = (cleanup: 'pending' | 'released'): CallDocument['state']['custody'] => ({
    kind: 'acknowledged',
    operation: op('acknowledge'),
    receipt: proof('acknowledged'),
    cleanup,
    diagnostic: null,
  })
  const variant = (name: string, custody: CallDocument['state']['custody']): CallDocument => {
    const copy = copyCall(base)
    return { ...copy, state: { ...copy.state, call: callId(name), custody } }
  }
  const calls = [
    variant('accepted', base.state.custody),
    variant('cleanup', acknowledged('pending')),
    variant('released', acknowledged('released')),
    variant('unknown', acknowledged('released')),
  ]
  const unknown: Binding = {
    ...binding,
    call: callId('unknown'),
    status: 'unknown',
    effect: 'applied',
  }
  const documents: TenantDocuments = {
    calls: new Map(calls.map(call => [call.state.call, call])),
    operations: new Map([[op('unknown-write'), unknown]]),
  }
  const commands = modelCommands(
    createModelCommandsCore(f.options, {
      run: (work, scope) => memory.run(work, scope),
      documents: () => documents,
      reserved: field => memory.reserved(field),
      commit: (tenant, write) => memory.commit(tenant, write),
      publish: (tenant, call) => memory.publish(tenant, call),
    }),
  )
  return { f, calls, documents, commands }
}

it('the exported recovery-work judgment gives the answer that scanPending gives for each call', async () => {
  const { f, calls, documents, commands } = await pendingFixture()
  const scanned: ModelCallId[] = []
  let after: string | null = null
  do {
    const page: { calls: readonly ModelCallId[]; next: string | null } = unbox(
      await commands.scanPending({ principal: f.principal, tenant: f.tenant, after, limit: 2 }),
    )
    scanned.push(...page.calls)
    after = page.next
  } while (after !== null)
  const judged = calls.flatMap(call => {
    const pending = [...documents.operations]
      .filter(([, binding]) => binding.call === call.state.call && binding.status === 'unknown')
      .map(([id]) => id)
    return hasRecoveryWork(call, pending) ? [call.state.call] : []
  })
  expect(scanned).toEqual(judged.sort())
  // The four calls differ: a judgment that answers one way for all of them is wrong.
  expect(scanned).toEqual(['accepted', 'cleanup', 'unknown'].map(name => callId(name)).sort())
  const released = calls.find(call => call.state.call === callId('released'))
  expect(released && hasRecoveryWork(released)).toBe(false)
})

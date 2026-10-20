import { invocationReference } from './reference-input.ts'
import type { ModelHandle, Observation, Snapshot, VisibleBlock } from '@omne-harness/model-contract'
import type { ScriptedPrincipal } from '@omne-harness/model-contract/testing'
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CAPACITY,
  DEFAULT_CONSUMER,
  DEFAULT_REQUEST,
  variantOf,
} from '../src/testing/conformance-defaults.ts'
import {
  ackInput,
  accessOf,
  acknowledged,
  acknowledgedOperation,
  admitInput,
  blockAt,
  callId,
  copyOfAdmit,
  countOf,
  deltaFact,
  dispatchesOf,
  dispatchId,
  ended,
  endReason,
  ending,
  evidenceFor,
  growingState,
  hookOf,
  instanceId,
  isSealedToolCall,
  kindOf,
  liveHandle,
  mutationOf,
  observing,
  openFact,
  operationId,
  pageOf,
  placed,
  readId,
  readOf,
  refused,
  refusedAs,
  replaceFact,
  requestedOperation,
  resultBlocks,
  reservedOperationId,
  running,
  same,
  sealFact,
  show,
  snapshotOf,
  startedCount,
  stateOf,
  succeeded,
  targetOf,
  textBlock,
  toolCallBlock,
  transportOf,
  untilEnd,
  versionId,
  within,
  expect as verdict,
  type Watch,
} from '../src/testing/conformance-kit.ts'
import {
  ConformanceFailure,
  ConformanceSkip,
  type Scene,
} from '../src/testing/conformance-types.ts'
import { sceneOf } from './conformance-support.ts'

function thrownBy(step: () => unknown): unknown {
  try {
    step()
  } catch (error) {
    return error
  }
  throw new Error('the step did not throw')
}

async function rejectedBy(step: () => Promise<unknown>): Promise<unknown> {
  try {
    await step()
  } catch (error) {
    return error
  }
  throw new Error('the step did not reject')
}

const NEVER = new Promise<never>(() => undefined)

describe('the verdict helpers of the conformance kit', () => {
  it('lets a true condition pass and fails a false one with its message', () => {
    expect(() => verdict(true, 'unused')).not.toThrow()
    const error = thrownBy(() => verdict(false, 'the detail'))
    expect(error).toBeInstanceOf(ConformanceFailure)
    expect(error).toMatchObject({ name: 'ConformanceFailure', message: 'the detail' })
  })

  it('shows a value as JSON and compares values by content', () => {
    expect(show({ a: [1, 'b'] })).toBe('{"a":[1,"b"]}')
    expect(same({ a: [1] }, { a: [1] })).toBe(true)
    expect(same({ a: [1] }, { a: [2] })).toBe(false)
  })

  it('gives the value of a success and names the failure of a failed step', () => {
    expect(succeeded(succeed(7), 'the step')).toBe(7)
    expect(thrownBy(() => succeeded(fail({ kind: 'not-settled' }), 'the step'))).toMatchObject({
      message: 'the step failed with {"kind":"not-settled"}',
    })
  })

  it('gives the failure of a refusal and names the value of a step that succeeded', () => {
    expect(refused(fail('no'), 'the step')).toBe('no')
    expect(thrownBy(() => refused(succeed({ v: 1 }), 'the step'))).toMatchObject({
      message: 'the step succeeded where it must not: {"v":1}',
    })
  })

  it('gives a failure of the wanted kind and says which kind came instead', () => {
    expect(refusedAs(fail({ kind: 'not-settled' }), 'not-settled', 'the step')).toEqual({
      kind: 'not-settled',
    })
    expect(
      thrownBy(() => refusedAs(fail({ kind: 'not-settled' }), 'handoff-invalid', 'the step')),
    ).toMatchObject({
      message: 'the step failed with {"kind":"not-settled"}, not handoff-invalid',
    })
    expect(thrownBy(() => refusedAs(succeed(1), 'not-settled', 'the step'))).toMatchObject({
      message: 'the step succeeded where it must not: 1',
    })
  })
})

describe('the identities and blocks that the conformance kit makes', () => {
  it('gives each identity the prefix of its kind and the label', () => {
    expect(callId('a')).toBe('mcall_cf-a')
    expect(operationId('a')).toBe('mop_cf-a')
    expect(reservedOperationId('a')).toBe('mop_--cf-a')
    expect(instanceId('a')).toBe('minst_cf-a')
    expect(versionId('a')).toBe('mrver_cf-a')
    expect(readId('a')).toBe('mread_cf-a')
    expect(dispatchId('a')).toBe('mdisp_cf-a')
  })

  it('refuses a label that the package decoder does not accept, and says so', () => {
    expect(thrownBy(() => callId('bad label'))).toMatchObject({
      name: 'ConformanceFailure',
      message: 'the suite built an identity that the package decoder refuses',
    })
  })

  it('builds a text block that holds the text and a tool suggestion that holds the arguments', () => {
    expect(textBlock('t1', 'hello')).toMatchObject({
      kind: 'text',
      id: 't1',
      text: 'hello',
      visibility: { toHuman: true, toModel: true },
    })
    expect(toolCallBlock('c1', { kind: 'null' })).toMatchObject({
      kind: 'tool_call',
      id: 'c1',
      arguments: { kind: 'null' },
      visibility: { toHuman: false, toModel: true },
    })
  })

  it('says so when the judge refuses a block that the suite built', () => {
    expect(thrownBy(() => textBlock('', 'x'))).toMatchObject({
      message: 'the suite built a text block that is refused',
    })
    expect(thrownBy(() => toolCallBlock('', { kind: 'null' }))).toMatchObject({
      message: 'the suite built a tool call that is refused',
    })
  })

  it('builds the upstream facts that the checks play', () => {
    expect(openFact('0', 'text')).toEqual({
      kind: 'block-open',
      index: '0',
      mode: 'append',
      content: 'text',
    })
    expect(openFact('1', 'thinking', 'replace')).toEqual({
      kind: 'block-open',
      index: '1',
      mode: 'replace',
      content: 'thinking',
    })
    expect(deltaFact('0', 'x')).toEqual({ kind: 'block-delta', index: '0', delta: 'x' })
    expect(replaceFact('0', 'x')).toEqual({ kind: 'block-replace', index: '0', value: 'x' })
    const block = textBlock('s', 'x')
    expect(sealFact('0', block)).toEqual({ kind: 'block-seal', index: '0', block })
  })
})

describe('the scene helpers of the conformance kit', () => {
  it('names the hook that is missing, and finds the one that is given', () => {
    const scene = sceneOf()
    expect(hookOf(scene, 'startRun')).toBe(scene.subject.hooks?.startRun)
    const { hooks: _hooks, ...subjectWithoutHooks } = scene.subject
    const bare = { ...scene, subject: subjectWithoutHooks }
    expect(thrownBy(() => hookOf(bare, 'startRun'))).toMatchObject({
      message: 'the subject has no startRun hook',
    })
    const without = { ...scene, subject: { ...scene.subject, hooks: {} } }
    expect(thrownBy(() => hookOf(without, 'settleCall'))).toMatchObject({
      message: 'the subject has no settleCall hook',
    })
  })

  it('finds the transport that is given, and says so when there is none', () => {
    const scene = sceneOf()
    expect(transportOf(scene)).toBe(scene.subject.transport)
    const { transport: _transport, ...subjectWithoutTransport } = scene.subject
    const bare = { ...scene, subject: subjectWithoutTransport }
    expect(thrownBy(() => transportOf(bare))).toMatchObject({
      message: 'the subject has no transport',
    })
  })

  it('addresses a call in the tenant of the subject unless another tenant is named', () => {
    const scene = sceneOf()
    const call = callId('x')
    const { tenant, otherTenant, principal } = scene.subject
    expect(targetOf(scene, call)).toEqual({ tenant, call })
    const reference = invocationReference({ tenant, call, admission: operationId('admit-x') })
    expect(accessOf(scene, call)).toEqual({ principal, tenant, call, reference })
    expect(accessOf(scene, call, otherTenant)).toEqual({
      principal,
      tenant: otherTenant,
      call,
      reference,
    })
    expect(mutationOf(scene, call, operationId('o'))).toEqual({
      principal,
      tenant,
      call,
      operation: operationId('o'),
      reference,
    })
    expect(mutationOf(scene, call, operationId('o'), otherTenant).tenant).toBe(otherTenant)
  })

  it('makes an admission from the defaults of the scene, and lets the caller change a part', () => {
    const scene = sceneOf()
    const input = admitInput(scene, 'a')
    expect(input).toMatchObject({
      call: callId('a'),
      operation: operationId('admit-a'),
      request: DEFAULT_REQUEST,
      consumer: DEFAULT_CONSUMER,
      capacity: DEFAULT_CAPACITY,
    })
    const other = { bytes: '1', blocks: '1', attachmentBytes: '0' }
    expect(admitInput(scene, 'a', { capacity: other }).capacity).toBe(other)
  })

  it('copies the data of an admission and keeps its identities', () => {
    const input = admitInput(sceneOf(), 'a')
    const copy = copyOfAdmit(input)
    expect(copy).toEqual(input)
    expect(copy.request).not.toBe(input.request)
    expect(copy.consumer).not.toBe(input.consumer)
    expect(copy.capacity).not.toBe(input.capacity)
    expect(copy.call).toBe(input.call)
    expect(copy.operation).toBe(input.operation)
  })

  it('makes a request that differs from the given one in its source only', () => {
    const changed = variantOf(DEFAULT_REQUEST)
    expect(changed).not.toEqual(DEFAULT_REQUEST)
    expect(changed.source.digest).toBe(`${DEFAULT_REQUEST.source.digest}-variant`)
    expect({ ...changed, source: DEFAULT_REQUEST.source }).toEqual(DEFAULT_REQUEST)
    expect(changed.source.owner).toBe(DEFAULT_REQUEST.source.owner)
  })
})

describe('the calls that the conformance kit sets up', () => {
  it('accepts a call, which is then found and has not started', async () => {
    const scene = sceneOf()
    const call = await placed(scene, 'p')
    expect(call.operation).toBe(operationId('admit-p'))
    const state = await stateOf(scene, call)
    expect(state).toMatchObject({ call: callId('p'), phase: 'accepted' })
    expect(await dispatchesOf(scene, call.call)).toEqual([])
  })

  it('says so when a call that is not accepted is looked for', async () => {
    const scene = sceneOf()
    const never = { input: admitInput(scene, 'n'), call: callId('n'), operation: operationId('n') }
    expect(await rejectedBy(() => stateOf(scene, never))).toMatchObject({
      name: 'ConformanceFailure',
    })
    expect(await rejectedBy(() => stateOf(scene, never))).toMatchObject({
      message: expect.stringContaining('the accepted call mcall_cf-n is not found'),
    })
  })

  it('lets a call run, which then shows a send that started', async () => {
    const scene = sceneOf()
    const call = await running(scene, 'r')
    expect(await stateOf(scene, call)).toMatchObject({ phase: 'running' })
    const records = await dispatchesOf(scene, call.call)
    expect(records).toHaveLength(1)
    expect(startedCount(records)).toBe(1)
    expect(records[0]?.dispatch).toBe(dispatchId('first-r'))
  })

  it('counts only the sends that started', async () => {
    const scene = sceneOf()
    const call = await running(scene, 'r')
    const [started] = await dispatchesOf(scene, call.call)
    if (started === undefined) throw new Error('the run shows a send')
    expect(
      startedCount([started, { ...started, send: 'not-sent' }, { ...started, send: 'unknown' }]),
    ).toBe(1)
    expect(startedCount([{ ...started, send: 'prepared' }])).toBe(0)
    expect(startedCount([])).toBe(0)
  })

  it('ends a call with three blocks in pages of two and the completed stop, unless told otherwise', async () => {
    const scene = sceneOf()
    const call = await ended(scene, 'e')
    expect(call.state.settlement.termination).toEqual({ kind: 'completed', reason: 'stop' })
    expect(call.version).toBe(call.state.settlement.version)
    const { page } = await readOf(scene, call)
    expect(page.parts.flatMap(part => (part.kind === 'sealed' ? [part.block.id] : []))).toEqual([
      'b1',
      'b2',
    ])
    expect(page.next).not.toBeNull()
  })

  it('offers three text blocks as the default result', () => {
    expect(resultBlocks().map(block => (block.kind === 'text' ? block.text : null))).toEqual([
      'one',
      'two',
      'three',
    ])
  })

  it('ends a call with the termination, blocks and page size that the caller gives', async () => {
    const scene = sceneOf()
    const call = await running(scene, 'e')
    const termination = { kind: 'interrupted', control: operationId('c') } as const
    const done = await ending(scene, call, {
      termination,
      parts: [textBlock('x1', 'only')].map(block => ({
        kind: 'sealed' as const,
        block,
        trims: [],
      })),
      pageSize: 5,
      pageTargetBytes: 1024,
    })
    expect(done.state.settlement.termination).toEqual(termination)
    const { page } = await readOf(scene, done)
    expect(page.parts.flatMap(part => (part.kind === 'sealed' ? [part.block.id] : []))).toEqual([
      'x1',
    ])
    expect(page.next).toBeNull()
  })

  it('says so when the hook does not end the call', async () => {
    const scene = sceneOf()
    const call = await running(scene, 'e')
    const idle = { ...scene.subject.hooks, settleCall: async () => undefined }
    const stuck = { ...scene, subject: { ...scene.subject, hooks: idle } }
    expect(await rejectedBy(() => ending(stuck, call))).toMatchObject({
      message: expect.stringContaining('is not settled after the hook'),
    })
  })

  it('acknowledges an ended call with evidence of the label, and shows the custody', async () => {
    const scene = sceneOf()
    const call = await ended(scene, 'a')
    const { operation, receipt, evidence } = await acknowledged(scene, call, 'lab')
    expect(operation).toBe(operationId(`lab-${call.call}`))
    expect(evidence).toEqual(await evidenceFor(scene, call, 'lab'))
    expect(evidence.record).toBe(`${call.call}-lab`)
    expect(receipt).toMatchObject({ call: call.call, result: call.version })
    expect(receipt.custody).toMatchObject({ kind: 'acknowledged', operation, receipt: evidence })
    expect((await stateOf(scene, call)).custody.kind).toBe('acknowledged')
  })

  it('uses the label ack when none is given, and keeps evidence of other labels apart', async () => {
    const scene = sceneOf()
    const call = await ended(scene, 'a')
    const first = await acknowledged(scene, call)
    expect(first.operation).toBe(operationId(`ack-${call.call}`))
    expect(first.evidence.record).toBe(`${call.call}-ack`)
    expect((await evidenceFor(scene, call, 'other')).digest).not.toBe(first.evidence.digest)
  })

  it('makes the input of an acknowledgement from the result and the evidence', async () => {
    const scene = sceneOf()
    const call = await ended(scene, 'a')
    const evidence = await evidenceFor(scene, call, 'ack')
    expect(ackInput(scene, call, operationId('o'), evidence)).toEqual({
      ...mutationOf(scene, call.call, operationId('o')),
      result: call.version,
      evidence: { kind: 'processed', completion: evidence },
    })
  })

  it('starts a read with the first page, and says so when the read does not start or has no page', async () => {
    const scene = sceneOf()
    const call = await ended(scene, 'rd')
    const open = await readOf(scene, call, 'one')
    expect(open.read).toMatch(/^mread_/u)
    await acknowledged(scene, call)
    expect(await rejectedBy(() => readOf(scene, call, 'two'))).toMatchObject({
      message: expect.stringContaining('the read did not start'),
    })

    const bare = sceneOf()
    const next = await ended(bare, 'rd')
    const { consumption } = bare.subject.provider.runtime
    const endedRead = {
      ...bare.subject,
      provider: {
        ...bare.subject.provider,
        runtime: {
          ...bare.subject.provider.runtime,
          consumption: {
            ...consumption,
            beginRead: async () =>
              succeed({
                kind: 'started' as const,
                read: readId('x'),
                value: { kind: 'ended' as const, reason: 'closed' as const },
              }),
          },
        },
      },
    }
    expect(await rejectedBy(() => readOf({ ...bare, subject: endedRead }, next))).toMatchObject({
      message: expect.stringContaining('the read has no first page'),
    })
  })

  it('gives the page of a read that goes on and says so for one that ended', async () => {
    const scene = sceneOf()
    const { page } = await readOf(scene, await ended(scene, 'pg'))
    expect(pageOf({ kind: 'reading', page }, 'the read')).toBe(page)
    expect(thrownBy(() => pageOf({ kind: 'ended', reason: 'closed' }, 'the read'))).toMatchObject({
      message: 'the read gave no page: {"kind":"ended","reason":"closed"}',
    })
  })

  it('gives the handle of the live instance and says so when there is none', async () => {
    const scene = sceneOf()
    const call = await placed(scene, 'h')
    const handle = await liveHandle(scene, call)
    expect(handle.instance).toBe(instanceId('one'))
    await hookOf(scene, 'withdrawInstance')(targetOf(scene, call.call))
    expect(await rejectedBy(() => liveHandle(scene, call))).toMatchObject({
      message: 'mcall_cf-h has no live route: {"kind":"no-live-route"}',
    })
  })
})

function blocksOf(...blocks: VisibleBlock[]): Snapshot['blocks'] {
  return blocks
}

async function snapshotFrom(scene: Scene<ScriptedPrincipal>): Promise<Snapshot> {
  const call = await placed(scene, 'snap')
  return observing(scene, await liveHandle(scene, call), async watch => {
    const first = await watch.next()
    return snapshotOf(first, 'the first observation')
  })
}

describe('the observation helpers of the conformance kit', () => {
  it('names the kind of an item, and finished for the end of the stream', async () => {
    const snapshot = await snapshotFrom(sceneOf())
    expect(kindOf('finished')).toBe('finished')
    expect(kindOf({ kind: 'snapshot', value: snapshot })).toBe('snapshot')
    expect(kindOf({ kind: 'changed', value: snapshot })).toBe('changed')
    expect(kindOf({ kind: 'ended', reason: 'denied' })).toBe('ended')
  })

  it('gives the snapshot of a snapshot item and of a changed item, and refuses the others', async () => {
    const snapshot = await snapshotFrom(sceneOf())
    expect(snapshotOf({ kind: 'snapshot', value: snapshot }, 'the item')).toBe(snapshot)
    expect(snapshotOf({ kind: 'changed', value: snapshot }, 'the item')).toBe(snapshot)
    expect(
      thrownBy(() => snapshotOf({ kind: 'ended', reason: 'denied' }, 'the item')),
    ).toMatchObject({ message: 'the item is not a snapshot: {"kind":"ended","reason":"denied"}' })
    expect(thrownBy(() => snapshotOf('finished', 'the item'))).toMatchObject({
      message: 'the item is not a snapshot: "finished"',
    })
  })

  it('gives the reason of an item that ended and refuses the others', async () => {
    const snapshot = await snapshotFrom(sceneOf())
    expect(endReason({ kind: 'ended', reason: 'stale-instance' }, 'the item')).toBe(
      'stale-instance',
    )
    expect(
      thrownBy(() => endReason({ kind: 'changed', value: snapshot }, 'the item')),
    ).toMatchObject({
      message: expect.stringContaining('the item did not end: '),
    })
    expect(thrownBy(() => endReason('finished', 'the item'))).toMatchObject({
      message: 'the item did not end: "finished"',
    })
  })

  it('finds a block by its index', () => {
    const text = textBlock('s', 'x')
    const blocks = blocksOf(
      { kind: 'sealed', index: '0', block: text },
      { kind: 'growing', index: '1', mode: 'append', content: 'text', value: 'v' },
    )
    const snapshot = { blocks } as Snapshot
    expect(blockAt(snapshot, '1')).toBe(blocks[1])
    expect(blockAt(snapshot, '0')).toBe(blocks[0])
    expect(blockAt(snapshot, '2')).toBeUndefined()
  })

  it('shows what a block in flight holds, and nothing for any other block', () => {
    const sealed: VisibleBlock = { kind: 'sealed', index: '0', block: textBlock('s', 'x') }
    expect(
      growingState({ kind: 'growing', index: '0', mode: 'replace', content: 'text', value: 'v' }),
    ).toEqual({ content: 'text', mode: 'replace', value: 'v' })
    expect(
      growingState({ kind: 'growing', index: '0', mode: 'append', content: 'thinking', value: '' }),
    ).toEqual({ content: 'thinking', mode: 'append', value: '' })
    expect(growingState(sealed)).toBeNull()
    expect(growingState(undefined)).toBeNull()
  })

  it('names the two control-flow errors of a check', () => {
    expect(new ConformanceFailure('x')).toMatchObject({ name: 'ConformanceFailure', message: 'x' })
    expect(new ConformanceSkip('y')).toMatchObject({ name: 'ConformanceSkip', message: 'y' })
  })

  it('knows a sealed tool suggestion from every other block', () => {
    const call: VisibleBlock = {
      kind: 'sealed',
      index: '0',
      block: toolCallBlock('c', { kind: 'null' }),
    }
    expect(isSealedToolCall(call)).toBe(true)
    expect(isSealedToolCall({ kind: 'sealed', index: '0', block: textBlock('s', 'x') })).toBe(false)
    expect(
      isSealedToolCall({
        kind: 'growing',
        index: '0',
        mode: 'append',
        content: 'tool-arguments',
        value: '{}',
      }),
    ).toBe(false)
    expect(isSealedToolCall(undefined)).toBe(false)
  })

  it('names the operation of a control that was requested, and none for the absence of one', () => {
    const operation = operationId('c')
    expect(
      requestedOperation({
        kind: 'requested',
        operation,
        propagation: 'pending',
        upstream: 'unknown',
      }),
    ).toBe(operation)
    expect(requestedOperation({ kind: 'none' })).toBeNull()
  })

  it('names the operation of an acknowledgement that the custody shows, and none for the producer', () => {
    const operation = operationId('a')
    expect(
      acknowledgedOperation({
        kind: 'acknowledged',
        operation,
        receipt: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
        cleanup: 'pending',
        diagnostic: null,
      }),
    ).toBe(operation)
    expect(acknowledgedOperation({ kind: 'producer' })).toBeNull()
  })

  it('reads a count only from whole decimal digits without a leading zero', () => {
    expect(countOf('0')).toBe(0)
    expect(countOf('7')).toBe(7)
    expect(countOf('120')).toBe(120)
    for (const text of ['', '01', '-1', '1x', 'x1', '1.5', ' 1', '1 ', '+1', '1e2'])
      expect(countOf(text)).toBeNull()
  })

  it('takes the first snapshot of a new observer and releases the observation', async () => {
    const scene = sceneOf()
    const call = await placed(scene, 'f')
    const handle = await liveHandle(scene, call)
    const first = await observing(scene, handle, async watch => watch.next())
    expect(kindOf(first)).toBe('snapshot')
  })
})

type Seen = { signal?: AbortSignal; returned: number }

function handleOf(
  iterator: AsyncIterator<Observation>,
  seen: Seen,
): ModelHandle<ScriptedPrincipal> {
  return {
    instance: instanceId('h'),
    observe: input => {
      seen.signal = input.signal
      return { [Symbol.asyncIterator]: () => iterator }
    },
  }
}

function iteratorOf(
  items: readonly Observation[],
  seen: Seen,
  release: () => Promise<unknown> = async () => undefined,
): AsyncIterator<Observation> {
  let position = 0
  return {
    async next() {
      const value = items[position]
      position += 1
      return value === undefined ? { done: true, value: undefined } : { done: false, value }
    },
    async return() {
      seen.returned += 1
      await release()
      return { done: true, value: undefined }
    },
  }
}

describe('the observation of a handle by the conformance kit', () => {
  const ended1: Observation = { kind: 'ended', reason: 'denied' }

  it('gives the body its observations in order and finished at the end, then releases', async () => {
    const scene = sceneOf()
    const seen: Seen = { returned: 0 }
    const handle = handleOf(iteratorOf([ended1], seen), seen)
    const steps = await observing(scene, handle, async watch => [
      await watch.next(),
      await watch.next(),
    ])
    expect(steps).toEqual([ended1, 'finished'])
    expect(seen.returned).toBe(1)
    expect(seen.signal?.aborted).toBe(true)
  })

  it('hands the body a way to abort the signal while it reads', async () => {
    const scene = sceneOf()
    const seen: Seen = { returned: 0 }
    const handle = handleOf(iteratorOf([], seen), seen)
    await observing(scene, handle, async watch => {
      expect(seen.signal?.aborted).toBe(false)
      watch.abort()
      expect(seen.signal?.aborted).toBe(true)
    })
  })

  it('releases the observation and rethrows when the body fails, and the release failing adds nothing', async () => {
    const scene = sceneOf()
    const seen: Seen = { returned: 0 }
    const handle = handleOf(
      iteratorOf([], seen, async () => {
        throw new Error('release failed')
      }),
      seen,
    )
    const failure = new Error('body failed')
    const error = await rejectedBy(() =>
      observing(scene, handle, async () => {
        throw failure
      }),
    )
    expect(error).toBe(failure)
    expect(seen.returned).toBe(1)
  })

  it('reports a release that fails when the body went well', async () => {
    const scene = sceneOf()
    const seen: Seen = { returned: 0 }
    const handle = handleOf(
      iteratorOf([], seen, async () => {
        throw new Error('release failed')
      }),
      seen,
    )
    expect(await rejectedBy(() => observing(scene, handle, async () => 1))).toMatchObject({
      message: 'release failed',
    })
  })

  it('goes on when the iterator has no way to be released', async () => {
    const scene = sceneOf()
    const seen: Seen = { returned: 0 }
    const iterator: AsyncIterator<Observation> = {
      next: async () => ({ done: true, value: undefined }),
    }
    await expect(observing(scene, handleOf(iterator, seen), async () => 'ok')).resolves.toBe('ok')
  })

  it('fails an observation that does not arrive in the time given', async () => {
    const scene = sceneOf(30)
    const seen: Seen = { returned: 0 }
    const iterator: AsyncIterator<Observation> = {
      next: () => NEVER,
      return: async () => ({ done: true, value: undefined }),
    }
    expect(
      await rejectedBy(() => observing(scene, handleOf(iterator, seen), watch => watch.next())),
    ).toMatchObject({ message: 'an observation did not arrive within 30 ms' })
  })

  it('fails a release that does not finish in the time given', async () => {
    const scene = sceneOf(30)
    const seen: Seen = { returned: 0 }
    const iterator: AsyncIterator<Observation> = {
      next: async () => ({ done: true, value: undefined }),
      return: () => NEVER,
    }
    expect(
      await rejectedBy(() => observing(scene, handleOf(iterator, seen), async () => 'ok')),
    ).toMatchObject({ message: 'the release of an observation did not arrive within 30 ms' })
  })

  it('reads until the observation ends and gives its reason', async () => {
    const snapshot = await snapshotFrom(sceneOf())
    const items: Observation[] = [
      { kind: 'snapshot', value: snapshot },
      { kind: 'changed', value: snapshot },
      { kind: 'ended', reason: 'unavailable' },
    ]
    let taken = 0
    const watch: Watch = {
      abort: () => undefined,
      next: async () => items[taken++] ?? 'finished',
    }
    expect(await untilEnd(watch, 'the stream')).toBe('unavailable')
    expect(taken).toBe(3)
  })

  it('says so when the stream finishes before it ends', async () => {
    const watch: Watch = { abort: () => undefined, next: async () => 'finished' }
    expect(await rejectedBy(() => untilEnd(watch, 'the stream'))).toMatchObject({
      message: 'the stream finished without an ended item',
    })
  })

  it('gives up after ten items that are not an end, and takes an end that is the tenth', async () => {
    const snapshot = await snapshotFrom(sceneOf())
    const more: Observation = { kind: 'changed', value: snapshot }
    let taken = 0
    const endless: Watch = {
      abort: () => undefined,
      next: async () => {
        taken += 1
        return more
      },
    }
    expect(await rejectedBy(() => untilEnd(endless, 'the stream'))).toMatchObject({
      message: 'the stream did not end within ten items',
    })
    expect(taken).toBe(10)

    let step = 0
    const late: Watch = {
      abort: () => undefined,
      next: async () => {
        step += 1
        return step < 10 ? more : { kind: 'ended', reason: 'denied' }
      },
    }
    expect(await untilEnd(late, 'the stream')).toBe('denied')
  })
})

describe('the wait of the conformance kit', () => {
  it('gives the value of a promise that settles in time', async () => {
    await expect(within(50, Promise.resolve('v'), 'the value')).resolves.toBe('v')
  })

  it('rejects with the reason of a promise that fails in time', async () => {
    await expect(within(50, Promise.reject(new Error('inner')), 'the value')).rejects.toThrow(
      'inner',
    )
  })

  it('fails with the thing waited for and the time when the promise does not settle', async () => {
    expect(await rejectedBy(() => within(20, NEVER, 'the thing'))).toMatchObject({
      name: 'ConformanceFailure',
      message: 'the thing did not arrive within 20 ms',
    })
  })

  it('leaves no timer behind once the promise settled', async () => {
    vi.useFakeTimers()
    try {
      await within(50, Promise.resolve(1), 'the value')
      expect(vi.getTimerCount()).toBe(0)
      await within(50, Promise.reject(new Error('inner')), 'the value').catch(() => undefined)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

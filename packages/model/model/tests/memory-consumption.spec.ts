import { expect, it } from 'vitest'
import { decodeDispatchId, type ModelBlock, type TransportFact } from '@omne-harness/model-contract'
import { judgePart } from '@omne-harness/message'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

function blocks(): readonly ModelBlock[] {
  const text = judgePart({
    kind: 'text',
    id: 'text',
    visibility: { toHuman: true, toModel: true },
    text: 'x'.repeat(4096),
  })
  const tool = judgePart({
    kind: 'tool_call',
    id: 'tool',
    visibility: { toHuman: true, toModel: true },
    callId: 'tool-one',
    name: 'demo',
    arguments: { kind: 'string', value: 'x'.repeat(4096) },
  })
  if (
    'rejected' in text ||
    text.ok.kind !== 'text' ||
    'rejected' in tool ||
    tool.ok.kind !== 'tool_call'
  )
    throw new Error('fixture blocks')
  return [text.ok, tool.ok]
}
async function completed(firstText?: string, capacityBytes?: string, pageParts = 1) {
  const f = fixture()
  if (capacityBytes !== undefined)
    Object.assign(f.admit, { capacity: { ...f.admit.capacity, bytes: capacityBytes } })
  Object.assign(f.options.limits, { resultPageParts: pageParts })
  const memory = createMemoryModelCommands(f.options)
  const { commands } = memory
  unbox(await commands.admit(f.admit))
  const execution = unbox(
    await commands.claim({
      ...f.admit,
      operation: op('claim'),
      instance: instance(),
      continuity: proof(f.admit.call),
    }),
  )
  const dispatch = unbox(decodeDispatchId('mdisp_one'))
  let serial = 0
  const write = async () => ({
    ...execution,
    operation: op(`write-${++serial}`),
    expected: unbox(await commands.loadRecovery(f.admit)).state.revision,
  })
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: f.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  unbox(await commands.openReceiveWindow({ ...(await write()), dispatch, window: 'window' }))
  const body = blocks().map(block =>
    block.kind === 'text' && firstText !== undefined ? { ...block, text: firstText } : block,
  )
  const facts: TransportFact[] = []
  for (const [i, block] of body.entries()) {
    facts.push({
      kind: 'block-open',
      index: String(i),
      mode: 'append',
      content: block.kind === 'tool_call' ? 'tool-arguments' : 'text',
    })
    facts.push({
      kind: 'block-delta',
      index: String(i),
      delta: block.kind === 'text' ? block.text : JSON.stringify('x'.repeat(4096)),
    })
    facts.push({ kind: 'block-seal', index: String(i), block })
  }
  facts.push({ kind: 'ended', termination: { kind: 'completed', reason: 'tool-suggestions' } })
  unbox(await commands.preserve({ ...(await write()), dispatch, window: 'window', facts }))
  const settlement = unbox(
    await commands.settle({
      ...(await write()),
      termination: { kind: 'completed', reason: 'tool-suggestions' },
    }),
  )
  const readInput = { ...f.admit, operation: op('read'), result: settlement.version }
  const handoff = (kind: 'processed' | 'retained' = 'processed') => ({
    ...f.admit,
    operation: op('ack'),
    result: settlement.version,
    evidence:
      kind === 'processed'
        ? { kind, completion: proof(`${f.admit.call}/${settlement.version}`, 'consumer') }
        : { kind, custody: proof(`${f.admit.call}/${settlement.version}`, 'consumer') },
  })
  return { ...f, ...memory, execution, dispatch, write, settlement, body, readInput, handoff }
}
it('keeps whole 4KiB blocks, stable pages and old reads after ACK while denying new reads', async () => {
  const f = await completed()
  Object.assign(f.options.limits, { resultPageParts: 99, readIdleMs: 1 })
  const started = unbox(await f.commands.acquireRead(f.readInput))
  if (started.kind !== 'started' || started.value.kind !== 'reading')
    throw new Error('read fixture')
  expect(started.value.page.parts).toEqual([{ kind: 'sealed', block: f.body[0], trims: [] }])
  const next = started.value.page.next
  if (next === null) throw new Error('page fixture')
  const second = unbox(await f.commands.nextRead({ ...f.admit, read: started.read, after: next }))
  expect(second.kind === 'reading' && second.page.parts).toEqual([
    { kind: 'sealed', block: f.body[1], trims: [] },
  ])
  expect(await f.commands.nextRead({ ...f.admit, read: started.read, after: next })).toEqual({
    ok: second,
  })
  unbox(await f.commands.handoff(f.handoff()))
  expect(await f.commands.acquireRead(f.readInput)).toEqual({ ok: started })
  expect(
    unbox(await f.commands.acquireRead({ ...f.readInput, operation: op('new-read') })).kind,
  ).toBe('acknowledged')
  expect(
    unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('cleanup') })),
  ).toMatchObject({ kind: 'acknowledged', cleanup: 'blocked', diagnostic: 'active-read' })
  expect(await f.commands.endRead({ ...f.admit, read: started.read })).toEqual({
    ok: { kind: 'ended', reason: 'closed' },
  })
  expect(await f.commands.endRead({ ...f.admit, read: started.read })).toEqual({
    ok: { kind: 'ended', reason: 'closed' },
  })
  const ended = unbox(await f.commands.acquireRead(f.readInput))
  expect(ended.kind === 'started' && ended.value).toEqual({ kind: 'ended', reason: 'closed' })
  expect(
    unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('cleanup') })),
  ).toMatchObject({ cleanup: 'blocked' })
  expect(
    unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('cleanup-new') })),
  ).toMatchObject({ cleanup: 'released' })
  expect(unbox(await f.commands.handoff(f.handoff())).custody.cleanup).toBe('released')
  expect(await f.commands.loadRecovery(f.admit)).toEqual({
    failure: { kind: 'invalid', field: 'call', reason: 'recovery-material-released' },
  })
  expect(unbox(await f.commands.scanPending({ ...f.admit, after: null, limit: 2 })).calls).toEqual(
    [],
  )
})
for (const kind of ['processed', 'retained'] as const)
  it(`requires current valid ${kind} evidence and retains ACK across cleanup failure`, async () => {
    const f = await completed()
    const input = f.handoff(kind)
    f.setEvidenceAvailable(false)
    expect(await f.commands.handoff(input)).toMatchObject({ failure: { kind: 'unavailable' } })
    f.setEvidenceAvailable(true)
    expect(
      await f.commands.handoff({
        ...input,
        evidence: { kind: 'processed', completion: proof('forged', 'other-owner') },
      }),
    ).toMatchObject({ failure: { kind: 'handoff-invalid' } })
    const ack = unbox(await f.commands.handoff(input))
    f.control.setCleanupFailure({ ...f.execution, diagnostic: 'release-failed' })
    expect(
      unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('cleanup-fail') })),
    ).toMatchObject({ cleanup: 'blocked', diagnostic: 'release-failed' })
    f.control.setCleanupFailure({ ...f.execution, diagnostic: null })
    expect(
      unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('cleanup-ok') })),
    ).toMatchObject({ cleanup: 'released', receipt: ack.custody.receipt })
    f.denied.add('handoff')
    expect(await f.commands.handoff(input)).toMatchObject({ failure: { kind: 'denied' } })
  })
it('ends actual output resources on current denial or the fixed idle deadline', async () => {
  const f = await completed()
  const start = unbox(await f.commands.acquireRead(f.readInput))
  if (start.kind !== 'started') throw new Error('read')
  f.denied.add('content')
  expect(await f.commands.nextRead({ ...f.admit, read: start.read, after: '1' })).toMatchObject({
    failure: { kind: 'denied' },
  })
  f.denied.delete('content')
  expect(unbox(await f.commands.acquireRead(f.readInput))).toMatchObject({
    kind: 'started',
    value: { kind: 'ended', reason: 'denied' },
  })
  const other = unbox(await f.commands.acquireRead({ ...f.readInput, operation: op('other-read') }))
  if (other.kind !== 'started') throw new Error('read')
  f.advance('2026-10-19T00:00:01.000Z')
  expect(await f.commands.nextRead({ ...f.admit, read: other.read, after: '1' })).toEqual({
    ok: { kind: 'ended', reason: 'stalled' },
  })
})
it('unknown writes block release, reveal does not repeat effects, and cleanup uses a fresh operation', async () => {
  const f = await completed()
  const controlInput = { ...f.admit, operation: op('unknown-control') }
  f.control.injectUnknown({ ...controlInput, method: 'control', effect: 'not-applied' })
  expect(await f.commands.control(controlInput)).toMatchObject({
    failure: { kind: 'commit-unknown' },
  })
  unbox(await f.commands.handoff(f.handoff()))
  expect(
    unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('blocked') })),
  ).toMatchObject({ cleanup: 'blocked' })
  f.control.reveal({ ...controlInput, result: 'rolled-back' })
  expect(
    unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('release') })),
  ).toMatchObject({ cleanup: 'released' })
})
it('uses one fixed-result body for a tiny first page and a 4KiB next page within a tight reservation', async () => {
  const f = await completed('tiny', '45000')
  const started = unbox(await f.commands.acquireRead(f.readInput))
  if (
    started.kind !== 'started' ||
    started.value.kind !== 'reading' ||
    started.value.page.next === null
  )
    throw new Error('fixture read')
  expect(started.value.page.parts).toEqual([{ kind: 'sealed', block: f.body[0], trims: [] }])
  const next = { ...f.admit, read: started.read, after: started.value.page.next }
  const page = unbox(await f.commands.nextRead(next))
  expect(page.kind === 'reading' && page.page.parts).toEqual([
    { kind: 'sealed', block: f.body[1], trims: [] },
  ])
  expect(await f.commands.nextRead(next)).toEqual({ ok: page })
  expect(unbox(await f.commands.acquireRead(f.readInput))).toEqual(started)
})
it('releases the reservation after ACK and real resource completion without consuming capacity on a failed admission', async () => {
  const f = await completed()
  const other = {
    ...f.admit,
    call: unbox((await import('@omne-harness/model-contract')).decodeModelCallId('mcall_other')),
    operation: op('other-admission'),
    capacity: { ...f.admit.capacity, bytes: '950000' },
  }
  expect(await f.commands.admit(other)).toMatchObject({ failure: { kind: 'capacity' } })
  expect(unbox(await f.commands.query(other))).toEqual({ kind: 'not-committed' })
  unbox(await f.commands.handoff(f.handoff()))
  expect(
    unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('release-capacity') })),
  ).toMatchObject({ cleanup: 'released' })
  expect(unbox(await f.commands.admit(other)).recovered).toBe(false)
})

it('groups whole 4KiB text and tool calls by the byte target even when ten parts may fit', async () => {
  const f = await completed(undefined, undefined, 10)
  const read = unbox(await f.commands.acquireRead(f.readInput))
  if (read.kind !== 'started' || read.value.kind !== 'reading') throw new Error('read fixture')
  const second = unbox(await f.commands.nextRead({ ...f.admit, read: read.read, after: '1' }))
  if (second.kind !== 'reading') throw new Error('next fixture')
  expect([read.value.page.parts, second.page.parts]).toEqual(
    f.body.map(block => [{ kind: 'sealed', block, trims: [] }]),
  )
  for (const page of [read.value.page, second.page]) {
    expect(Buffer.byteLength(JSON.stringify(page.parts))).toBeGreaterThan(1024)
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(
      Number(f.admit.capacity.bytes),
    )
  }
})

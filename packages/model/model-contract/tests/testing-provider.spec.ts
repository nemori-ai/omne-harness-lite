import { describe, expect, it } from 'vitest'
import {
  decodeReadId,
  deriveGuardControlOperation,
  type ModelBlock,
  type TransportFact,
} from '@omne-harness/model-contract'
import {
  access,
  ackInput,
  admission,
  admitCall,
  alice,
  call,
  callRef,
  capacity,
  dispatch,
  evidence,
  failureOf,
  liveHandle,
  must,
  operation,
  request,
  scriptedProvider,
  settleCall,
  settleWithBlocks,
  tenantA,
  tenantB,
  textBlock,
  version,
  watch,
} from './scripted-support.ts'

const decodedRead = (text: string) => must(decodeReadId(text))

type ReservedMethod = 'admit' | 'inspect' | 'cancel' | 'beginRead' | 'acknowledge'

describe('the ordinary path of a scripted call', () => {
  it('takes a call from admission through observation, reading and acknowledgement to cleanup', async () => {
    const scripted = scriptedProvider()
    const { calls, consumption } = scripted.provider.runtime
    expect(must(await calls.admit(admission('n')))).toEqual({
      call: call('n'),
      revision: '1',
      recovered: false,
    })

    const watcher = watch(await liveHandle(scripted, 'n'))
    expect(await watcher.next()).toMatchObject({
      kind: 'snapshot',
      value: { call: call('n'), cursor: '1', blocks: [], state: { phase: 'accepted' } },
    })
    scripted.controller.start({
      ...callRef('n'),
      dispatch: dispatch('d1'),
      firstContent: 'none-proven',
    })
    expect(await watcher.next()).toMatchObject({
      kind: 'changed',
      value: {
        cursor: '2',
        state: { phase: 'running', dispatch: dispatch('d1'), firstContent: 'none-proven' },
      },
    })
    scripted.controller.emit({
      ...callRef('n'),
      blocks: [{ kind: 'growing', index: '0', mode: 'append', content: 'text', value: 'He' }],
    })
    expect(await watcher.next()).toMatchObject({
      kind: 'changed',
      value: {
        cursor: '3',
        blocks: [{ kind: 'growing', index: '0', mode: 'append', content: 'text', value: 'He' }],
      },
    })
    settleCall(scripted, 'n')
    expect(await watcher.next()).toMatchObject({
      kind: 'changed',
      value: {
        cursor: '4',
        state: {
          phase: 'settled',
          settlement: {
            version: version('n'),
            termination: { kind: 'completed', reason: 'stop' },
            cursor: '4',
            source: evidence('settlement-n'),
          },
        },
      },
    })
    watcher.close()
    expect(await watcher.next()).toEqual({ kind: 'ended', reason: 'observer-closed' })
    expect(await watcher.next()).toBe('finished')

    const started = must(
      await consumption.beginRead({
        ...access('n'),
        operation: operation('read-n'),
        result: version('n'),
      }),
    )
    if (started.kind !== 'started' || started.value.kind !== 'reading') throw new Error('read')
    expect(started.value.page.blocks).toEqual([textBlock('b1', 'one'), textBlock('b2', 'two')])
    expect(started.value.page.next).toBe('2')
    const second = must(
      await consumption.readNext({ ...access('n'), read: started.read, after: '2' }),
    )
    expect(second).toMatchObject({
      kind: 'reading',
      page: { blocks: [textBlock('b3', 'three')], next: null },
    })
    expect(must(await consumption.closeRead({ ...access('n'), read: started.read }))).toEqual({
      kind: 'ended',
      reason: 'complete',
    })

    const receipt = must(await consumption.acknowledge(ackInput('n')))
    expect(receipt).toEqual({
      call: call('n'),
      result: version('n'),
      custody: {
        kind: 'acknowledged',
        operation: operation('ack-n'),
        receipt: evidence('processed'),
        cleanup: 'pending',
        diagnostic: null,
      },
    })
    expect(
      must(
        await consumption.beginRead({
          ...access('n'),
          operation: operation('read-n-again'),
          result: version('n'),
        }),
      ),
    ).toEqual({ kind: 'acknowledged', custody: receipt.custody })

    scripted.controller.setCleanup({ ...callRef('n'), cleanup: 'released', diagnostic: null })
    const found = must(await calls.inspect({ ...access('n'), admission: operation('admit-n') }))
    expect(found).toMatchObject({
      kind: 'found',
      state: { custody: { kind: 'acknowledged', cleanup: 'released' } },
    })
  })

  it('keeps serving a read that began before the acknowledgement', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'k')
    settleCall(scripted, 'k')
    const started = must(
      await consumption.beginRead({
        ...access('k'),
        operation: operation('read-k'),
        result: version('k'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')
    must(await consumption.acknowledge(ackInput('k')))
    expect(
      must(await consumption.readNext({ ...access('k'), read: started.read, after: '2' })),
    ).toMatchObject({ kind: 'reading', page: { next: null } })
  })

  it('serves the same page for a repeated after and refuses an after it never issued', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'p')
    settleCall(scripted, 'p')
    const started = must(
      await consumption.beginRead({
        ...access('p'),
        operation: operation('read-p'),
        result: version('p'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')
    const input = { ...access('p'), read: started.read, after: '2' }
    expect(must(await consumption.readNext(input))).toEqual(must(await consumption.readNext(input)))
    expect(failureOf(await consumption.readNext({ ...input, after: '1' }))).toEqual({
      kind: 'invalid',
      field: 'after',
      reason: 'no page of this read ends there',
    })
  })

  it('finishes a read that was closed early as closed, and keeps that reason', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'q')
    settleCall(scripted, 'q')
    const started = must(
      await consumption.beginRead({
        ...access('q'),
        operation: operation('read-q'),
        result: version('q'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')
    const close = { ...access('q'), read: started.read }
    expect(must(await consumption.closeRead(close))).toEqual({ kind: 'ended', reason: 'closed' })
    expect(must(await consumption.closeRead(close))).toEqual({ kind: 'ended', reason: 'closed' })
    expect(must(await consumption.readNext({ ...close, after: '2' }))).toEqual({
      kind: 'ended',
      reason: 'closed',
    })
  })

  it('refuses a read of a result it has not settled or of another version', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'r')
    const input = { ...access('r'), operation: operation('read-r'), result: version('r') }
    expect(failureOf(await consumption.beginRead(input))).toEqual({ kind: 'not-settled' })
    settleCall(scripted, 'r')
    expect(failureOf(await consumption.beginRead({ ...input, result: version('other') }))).toEqual({
      kind: 'invalid',
      field: 'result',
      reason: 'the result version is not the settled one',
    })
  })

  it('answers a repeated read with the same read, and a changed one with a conflict', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 's')
    settleCall(scripted, 's')
    const input = { ...access('s'), operation: operation('read-s'), result: version('s') }
    const first = must(await consumption.beginRead(input))
    expect(must(await consumption.beginRead(input))).toEqual(first)
    expect(
      failureOf(await consumption.beginRead({ ...input, result: version('s-other') })),
    ).toEqual({ kind: 'conflict', operation: operation('read-s'), revision: '2' })
  })

  it('numbers the reads of a provider in the order they begin', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    settleCall(scripted, 'a')
    settleCall(scripted, 'b')
    const begin = async (name: string, label: string) =>
      must(
        await consumption.beginRead({
          ...access(name),
          operation: operation(label),
          result: version(name),
        }),
      )
    expect(await begin('a', 'read-1')).toMatchObject({ read: 'mread_scripted1' })
    expect(await begin('b', 'read-2')).toMatchObject({ read: 'mread_scripted2' })
    expect(await begin('a', 'read-3')).toMatchObject({ read: 'mread_scripted3' })
  })

  it('ends a page list when the blocks fill the last page exactly', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleWithBlocks(scripted, 'a', 4, 2)
    const started = must(
      await consumption.beginRead({
        ...access('a'),
        operation: operation('read-a'),
        result: version('a'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')
    expect(started.value).toMatchObject({ page: { next: '2' } })
    const last = must(
      await consumption.readNext({ ...access('a'), read: started.read, after: '2' }),
    )
    expect(last).toMatchObject({ kind: 'reading', page: { next: null } })
    if (last.kind !== 'reading') throw new Error('page')
    expect(last.page.blocks).toHaveLength(2)
  })

  it('serves the blocks across its pages in the order they were given, under rising indices', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'o')
    scripted.controller.start({
      ...callRef('o'),
      dispatch: dispatch('first'),
      firstContent: 'none-proven',
    })
    const given = ['zulu', 'alpha', 'mike', 'bravo', 'yankee'].map(id =>
      textBlock(id, `text ${id}`),
    )
    const facts = given.flatMap((block, at): TransportFact[] => [
      { kind: 'block-open', index: String(at), mode: 'append', content: 'text' },
      { kind: 'block-delta', index: String(at), delta: `text ${block.id}` },
      { kind: 'block-seal', index: String(at), block },
    ])
    scripted.controller.play({ ...callRef('o'), facts })
    const observation = watch(await liveHandle(scripted, 'o'))
    const first = await observation.next()
    await observation.stop()
    if (first === 'finished' || first.kind !== 'snapshot') throw new Error('no snapshot')
    expect(first.value.blocks.map(shown => [shown.index, shown.kind])).toEqual(
      given.map((_, at) => [String(at), 'sealed']),
    )
    expect(first.value.blocks.map(shown => (shown.kind === 'sealed' ? shown.block : null))).toEqual(
      given,
    )

    scripted.controller.settle({
      ...callRef('o'),
      version: version('o'),
      termination: { kind: 'completed', reason: 'stop' },
      blocks: given,
      source: evidence('settlement-o'),
      pageSize: 2,
    })
    const started = must(
      await consumption.beginRead({
        ...access('o'),
        operation: operation('read-o'),
        result: version('o'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')
    const read: ModelBlock[] = []
    let page = started.value
    for (let turn = 0; turn < given.length; turn += 1) {
      if (page.kind !== 'reading') throw new Error('the read ended before its last page')
      read.push(...page.page.blocks)
      if (page.page.next === null) break
      page = must(
        await consumption.readNext({ ...access('o'), read: started.read, after: page.page.next }),
      )
    }
    expect(read).toEqual(given)
    expect(page).toMatchObject({ kind: 'reading', page: { next: null } })
  })

  it('serves an empty result as one empty page', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleWithBlocks(scripted, 'a', 0, 2)
    const started = must(
      await consumption.beginRead({
        ...access('a'),
        operation: operation('read-a'),
        result: version('a'),
      }),
    )
    expect(started).toMatchObject({ value: { page: { blocks: [], next: null } } })
  })

  it('keeps the reason a read ended with when the access is revoked later', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    const started = must(
      await consumption.beginRead({
        ...access('a'),
        operation: operation('read-a'),
        result: version('a'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')
    const close = { ...access('a'), read: started.read }
    expect(must(await consumption.closeRead(close))).toEqual({ kind: 'ended', reason: 'closed' })
    scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: 'all' })
    expect(must(await consumption.readNext({ ...close, after: '2' }))).toEqual({
      kind: 'ended',
      reason: 'closed',
    })
    expect(must(await consumption.closeRead(close))).toEqual({ kind: 'ended', reason: 'closed' })
  })

  it('refuses to close a read the call never gave, and a read of another tenant', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    const started = must(
      await consumption.beginRead({
        ...access('a'),
        operation: operation('read-a'),
        result: version('a'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')
    expect(
      failureOf(await consumption.closeRead({ ...access('a'), read: decodedRead('mread_other') })),
    ).toEqual({ kind: 'invalid', field: 'read', reason: 'the call has no such read' })
    expect(
      failureOf(
        await consumption.closeRead({ ...access('a'), tenant: tenantB, read: started.read }),
      ),
    ).toEqual({ kind: 'denied', action: 'read' })
  })

  it('refuses a read id that the call never gave', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 't')
    await admitCall(scripted, 'u')
    settleCall(scripted, 'u')
    const started = must(
      await consumption.beginRead({
        ...access('u'),
        operation: operation('read-u'),
        result: version('u'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')
    expect(
      failureOf(await consumption.readNext({ ...access('t'), read: started.read, after: '2' })),
    ).toEqual({ kind: 'invalid', field: 'read', reason: 'the call has no such read' })
  })

  it('refuses an acknowledgement before the call ended and one for another result version', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'v')
    expect(failureOf(await consumption.acknowledge(ackInput('v')))).toEqual({
      kind: 'not-settled',
    })
    settleCall(scripted, 'v')
    expect(
      failureOf(await consumption.acknowledge({ ...ackInput('v'), result: version('other') })),
    ).toEqual({
      kind: 'handoff-invalid',
      reason: 'the result version is not the settled one',
    })
  })

  it('takes a retained handoff as the evidence of custody', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'w')
    settleCall(scripted, 'w')
    const receipt = must(
      await scripted.provider.runtime.consumption.acknowledge({
        ...ackInput('w'),
        evidence: { kind: 'retained', custody: evidence('kept') },
      }),
    )
    expect(receipt.custody.receipt).toEqual(evidence('kept'))
  })

  it('reports the dispatches of a call as a copy, keeping a late result in place', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'x')
    const { calls } = scripted.provider.runtime
    expect(must(await calls.dispatches(access('x')))).toEqual([])
    const first = {
      dispatch: dispatch('first'),
      supplier: request.suppliers[0],
      intent: operation('intent-first'),
      send: 'started' as const,
      firstContent: 'observed' as const,
      terminal: null,
      account: null,
      materialization: null,
    }
    scripted.controller.recordDispatch({ ...callRef('x'), record: first })
    scripted.controller.recordDispatch({
      ...callRef('x'),
      record: { ...first, dispatch: dispatch('second') },
    })
    scripted.controller.recordDispatch({
      ...callRef('x'),
      record: { ...first, terminal: { kind: 'completed', reason: 'stop' } },
    })
    const listed = must(await calls.dispatches(access('x')))
    expect(listed.map(record => [record.dispatch, record.terminal?.kind ?? null])).toEqual([
      [dispatch('first'), 'completed'],
      [dispatch('second'), null],
    ])
  })
})

describe('recognising an operation', () => {
  it('returns the original admission for the same operation and parameters', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    expect(must(await calls.admit(admission('a')))).toEqual({
      call: call('a'),
      revision: '1',
      recovered: true,
    })
  })

  it('answers a conflict when the operation comes back with other parameters', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    expect(
      failureOf(await calls.admit(admission('a', { capacity: { ...capacity, bytes: '999' } }))),
    ).toEqual({ kind: 'conflict', operation: operation('admit-a'), revision: '1' })
  })

  it('treats a different key order of the parameters as no difference', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    const reordered = {
      bytes: capacity.bytes,
      attachmentBytes: capacity.attachmentBytes,
      blocks: capacity.blocks,
    }
    expect(must(await calls.admit(admission('a', { capacity: reordered }))).recovered).toBe(true)
  })

  it('reports the revision the call has now when an admission conflicts', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    scripted.controller.start({
      ...callRef('a'),
      dispatch: dispatch('d'),
      firstContent: 'none-proven',
    })
    const other = admission('a', { capacity: { ...capacity, bytes: '999' } })
    expect(failureOf(await calls.admit(other))).toEqual({
      kind: 'conflict',
      operation: operation('admit-a'),
      revision: '2',
    })
    expect(
      failureOf(await calls.admit({ ...other, operation: operation('admit-a-again') })),
    ).toEqual({ kind: 'conflict', operation: operation('admit-a-again'), revision: '2' })
  })

  it('answers a conflict for a second operation on a call that is already admitted', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    expect(
      failureOf(await calls.admit(admission('a', { operation: operation('admit-a-again') }))),
    ).toEqual({ kind: 'conflict', operation: operation('admit-a-again'), revision: '1' })
  })

  it('does not let an operation of one method be used for another', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    await calls.admit(admission('b'))
    expect(
      failureOf(await calls.cancel({ ...access('b'), operation: operation('admit-a') })),
    ).toEqual({ kind: 'conflict', operation: operation('admit-a'), revision: '1' })
  })

  it('does not let an admission operation be used to read or acknowledge', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    const reuse = operation('admit-a')
    expect(
      failureOf(
        await consumption.beginRead({ ...access('a'), operation: reuse, result: version('a') }),
      ),
    ).toEqual({ kind: 'conflict', operation: reuse, revision: '2' })
    expect(
      failureOf(await consumption.acknowledge({ ...ackInput('a'), operation: reuse })),
    ).toEqual({ kind: 'conflict', operation: reuse, revision: '2' })
    expect(
      must(await scripted.provider.runtime.calls.inspect({ ...access('a'), admission: reuse })),
    ).toMatchObject({ state: { custody: { kind: 'producer' } } })
  })

  it('keeps one operation space per tenant', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    const other = must(await calls.admit(admission('a', { tenant: tenantB })))
    expect(other.recovered).toBe(false)
  })

  async function refusesReserved(method: ReservedMethod, field: string) {
    const scripted = scriptedProvider()
    const { calls, consumption } = scripted.provider.runtime
    await calls.admit(admission('a'))
    const reserved = deriveGuardControlOperation(call('a'))
    const target = access('a')
    const outcomes = {
      admit: () => calls.admit(admission('c', { operation: reserved })),
      inspect: () => calls.inspect({ ...target, admission: reserved }),
      cancel: () => calls.cancel({ ...target, operation: reserved }),
      beginRead: () =>
        consumption.beginRead({ ...target, operation: reserved, result: version('a') }),
      acknowledge: () => consumption.acknowledge({ ...ackInput('a'), operation: reserved }),
    }
    expect(failureOf(await outcomes[method]())).toEqual({
      kind: 'invalid',
      field,
      reason: 'operation values that start with -- are reserved',
    })
  }

  it('refuses a reserved operation on admit', () => refusesReserved('admit', 'operation'))
  it('refuses a reserved operation on inspect', () => refusesReserved('inspect', 'admission'))
  it('refuses a reserved operation on cancel', () => refusesReserved('cancel', 'operation'))
  it('refuses a reserved operation on beginRead', () => refusesReserved('beginRead', 'operation'))
  it('refuses a reserved operation on acknowledge', () =>
    refusesReserved('acknowledge', 'operation'))
})

describe('who may see a call', () => {
  it('answers not-accepted for a call of another tenant, as for a call that does not exist', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    const foreign = { ...access('a'), tenant: tenantB, admission: operation('admit-a') }
    expect(must(await calls.inspect(foreign))).toEqual({
      kind: 'not-accepted',
      operation: operation('admit-a'),
    })
    expect(failureOf(await calls.cancel({ ...foreign, operation: operation('c') }))).toEqual({
      kind: 'denied',
      action: 'cancel',
    })
    expect(failureOf(await calls.dispatches({ ...foreign }))).toEqual({
      kind: 'denied',
      action: 'dispatches',
    })
  })

  it('answers not-accepted for an admission operation the call was not admitted with', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    expect(
      must(await calls.inspect({ ...access('a'), admission: operation('someone-else') })),
    ).toEqual({ kind: 'not-accepted', operation: operation('someone-else') })
  })

  it('shows the state of an admitted call with the consumer it was admitted for', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await calls.admit(admission('a'))
    const found = must(await calls.inspect({ ...access('a'), admission: operation('admit-a') }))
    expect(found).toMatchObject({
      kind: 'found',
      state: {
        call: call('a'),
        revision: '1',
        phase: 'accepted',
        consumer: { work: 'work-1' },
        control: { kind: 'none' },
        custody: { kind: 'producer' },
      },
    })
  })

  it('denies a tenant value that did not come from the legal-identity package', async () => {
    const scripted = scriptedProvider()
    const forged = { ...tenantA }
    expect(
      failureOf(await scripted.provider.runtime.calls.admit(admission('a', { tenant: forged }))),
    ).toEqual({ kind: 'denied', action: 'admit' })
    expect(
      failureOf(await scripted.provider.recover({ principal: alice, tenant: forged })),
    ).toEqual({
      kind: 'denied',
      action: 'recover',
    })
  })
})

describe('recovery and quiescence', () => {
  it('counts the calls of the tenant that have not ended', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    must(await scripted.provider.runtime.calls.admit(admission('c', { tenant: tenantB })))
    settleCall(scripted, 'b')
    expect(must(await scripted.provider.recover({ principal: alice, tenant: tenantA }))).toEqual({
      scheduled: '1',
    })
  })

  it('reports pending and running separately, and leaves out the calls that ended', async () => {
    const scripted = scriptedProvider()
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) await admitCall(scripted, name)
    for (const name of ['b', 'c'])
      scripted.controller.start({
        ...callRef(name),
        dispatch: dispatch('d'),
        firstContent: 'observed',
      })
    for (const name of ['d', 'e', 'f']) settleCall(scripted, name)
    expect(must(await scripted.provider.quiesce())).toEqual({ pending: '1', running: '2' })
  })

  it('stops accepting new calls but recognises an admission it already has, and reports what is left', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    scripted.controller.start({
      ...callRef('b'),
      dispatch: dispatch('d1'),
      firstContent: 'observed',
    })
    expect(must(await scripted.provider.quiesce())).toEqual({ pending: '1', running: '1' })
    expect(failureOf(await calls.admit(admission('c')))).toEqual({
      kind: 'unavailable',
      dependency: 'model-provider',
      diagnostic: 'the provider is quiescing and accepts no new calls',
    })
    expect(must(await calls.admit(admission('a'))).recovered).toBe(true)
    expect(must(await scripted.provider.quiesce())).toEqual({ pending: '1', running: '1' })
  })
})

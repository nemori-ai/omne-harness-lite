import { expect, it } from 'vitest'
import {
  decodeDispatchId,
  type TransportFact,
  type WriteContext,
} from '@omne-harness/model-contract'
import { judgeContentBlock } from '@omne-harness/content-block'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { digest } from '../src/testing/value.ts'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

export function textBlock(text = 'hello', id = 'text-one') {
  const judged = judgeContentBlock({
    kind: 'text',
    id,
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if ('rejected' in judged) throw new Error('fixture block')
  return judged.ok
}
export async function running() {
  const f = fixture()
  const memory = createMemoryModelCommands(f.options)
  const store = { control: memory.control }
  const commands = memory.commands
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
  async function write(): Promise<WriteContext> {
    return {
      ...execution,
      operation: op(`write-${++serial}`),
      expected: unbox(await commands.loadRecovery(f.admit)).state.revision,
    }
  }
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: f.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  return { ...f, store, commands, execution, dispatch, write }
}
it('records materialization once, preserves original revisions and rejects stale writes or regression of started', async () => {
  const f = await running()
  const input = {
    ...(await f.write()),
    dispatch: f.dispatch,
    receipt: {
      supplier: f.admit.request.suppliers[0].adoption,
      representation: f.admit.request.representation,
      payloadDigest: 'a'.repeat(64),
    },
  }
  const receipt = unbox(await f.commands.recordMaterialization(input))
  expect(unbox(await f.commands.recordMaterialization(input))).toEqual(receipt)
  const sent = { ...(await f.write()), dispatch: f.dispatch, state: 'started' as const }
  unbox(await f.commands.recordSend(sent))
  expect(unbox(await f.commands.recordMaterialization(input))).toEqual(receipt)
  expect(
    await f.commands.recordSend({ ...(await f.write()), dispatch: f.dispatch, state: 'not-sent' }),
  ).toMatchObject({ failure: { field: 'state' } })
  expect(await f.commands.recordSend({ ...sent, operation: op('stale-expected') })).toMatchObject({
    failure: { kind: 'conflict' },
  })
  f.setTrustedExecution(false)
  expect(await f.commands.recordSend(sent)).toMatchObject({
    failure: { kind: 'denied', action: 'execution-channel' },
  })
})
it('rejects an entire malformed batch without publishing its earlier content', async () => {
  const f = await running()
  unbox(
    await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'window',
    }),
  )
  const input = {
    ...(await f.write()),
    dispatch: f.dispatch,
    window: 'window',
    facts: [
      { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '0', delta: 'hello' },
      { kind: 'block-delta', index: '2', delta: 'bad' },
    ] satisfies TransportFact[],
  }
  const before = unbox(await f.commands.loadRecovery(f.admit))
  expect(await f.commands.preserve(input)).toMatchObject({ failure: { kind: 'invalid' } })
  expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
  const facts: TransportFact[] = [
    { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
    { kind: 'block-delta', index: '0', delta: 'hello' },
    { kind: 'block-seal', index: '0', block: textBlock() },
    { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
  ]
  const accepted = { ...input, facts }
  const snapshot = unbox(await f.commands.preserve(accepted))
  expect(snapshot.state.phase === 'running' && snapshot.state.firstContent).toBe('observed')
  expect(unbox(await f.commands.preserve(accepted))).toEqual(snapshot)
  const termination = { kind: 'completed', reason: 'stop' } as const
  const settlementInput = { ...(await f.write()), termination }
  const settlement = unbox(await f.commands.settle(settlementInput))
  expect(unbox(await f.commands.settle(settlementInput))).toEqual(settlement)
  expect(
    await f.commands.settle({
      ...(await f.write()),
      termination: {
        kind: 'failed',
        fault: { cause: 'stream-lost', diagnostic: 'late', upstreamStatus: null },
      },
    }),
  ).toMatchObject({ failure: { kind: 'conflict' } })
})
it('does not turn an empty batch into proof of no first content; a registered complete window can do so', async () => {
  const f = await running()
  unbox(
    await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'empty',
    }),
  )
  const empty = unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'empty',
      facts: [],
    }),
  )
  expect(empty.state.phase === 'running' && empty.state.firstContent).toBe('uncertain')
  const confirmedFixture = await running()
  unbox(
    await confirmedFixture.commands.openReceiveWindow({
      ...(await confirmedFixture.write()),
      dispatch: confirmedFixture.dispatch,
      window: 'confirmed',
    }),
  )
  confirmedFixture.completeWindows.add(`${confirmedFixture.admit.call}/confirmed/${digest([])}`)
  const confirmed = unbox(
    await confirmedFixture.commands.preserve({
      ...(await confirmedFixture.write()),
      dispatch: confirmedFixture.dispatch,
      window: 'confirmed',
      facts: [],
    }),
  )
  expect(confirmed.state.phase === 'running' && confirmed.state.firstContent).toBe('none-proven')
})
it('stores a retry position and bounds its decision to the original policy and attempt count', async () => {
  const f = await running()
  unbox(
    await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'failure',
    }),
  )
  const facts = [
    {
      kind: 'ended',
      termination: {
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic: 'offline', upstreamStatus: '503' },
      },
    },
  ] satisfies [TransportFact]
  f.completeWindows.add(`${f.admit.call}/failure/${digest(facts)}`)
  const failed = unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'failure',
      facts,
    }),
  )
  expect(failed.state).toMatchObject({
    phase: 'running',
    dispatch: f.dispatch,
    firstContent: 'none-proven',
  })
  expect(
    await f.commands.settle({
      ...(await f.write()),
      termination: { kind: 'completed', reason: 'stop' },
    }),
  ).toMatchObject({ failure: { field: 'termination' } })
  const positionInput = { ...(await f.write()), dispatch: f.dispatch }
  const position = unbox(await f.commands.prepareRetry(positionInput))
  expect(unbox(await f.commands.prepareRetry(positionInput))).toEqual(position)
  const decision = {
    kind: 'retry',
    supplier: f.admit.request.suppliers[0],
    notBefore: '2026-10-19T00:00:00Z',
    basis: f.admit.request.retryPolicy,
  } as const
  const decisionInput = {
    ...(await f.write()),
    position,
    decision,
    source: proof(position.operation, 'retry'),
  }
  unbox(await f.commands.decideRetry(decisionInput))
  expect(unbox(await f.commands.decideRetry(decisionInput))).toBe(
    unbox(await f.commands.query({ ...f.admit, operation: decisionInput.operation })).kind ===
      'committed'
      ? unbox(await f.commands.loadRecovery(f.admit)).state.revision
      : '',
  )
  expect(unbox(await f.commands.loadRecovery(f.admit)).retry).toEqual(decision)
  const retryDispatch = unbox(decodeDispatchId('mdisp_retry'))
  unbox(
    await f.commands.prepareDispatch({
      ...(await f.write()),
      dispatch: retryDispatch,
      supplier: decision.supplier,
      policyDecision: decisionInput.source,
    }),
  )
  for (const window of ['still-open', 'proven-empty'])
    unbox(
      await f.commands.openReceiveWindow({
        ...(await f.write()),
        dispatch: retryDispatch,
        window,
      }),
    )
  f.completeWindows.add(`${f.admit.call}/proven-empty/${digest([])}`)
  const mixed = unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: retryDispatch,
      window: 'proven-empty',
      facts: [],
    }),
  )
  expect(mixed.state).toMatchObject({
    phase: 'running',
    dispatch: retryDispatch,
    firstContent: 'uncertain',
  })
  expect(unbox(await f.commands.loadRecovery(f.admit)).state).toEqual(mixed.state)
  expect(unbox(await f.commands.dispatches(f.admit))).toMatchObject([
    { dispatch: f.dispatch, firstContent: 'none-proven', terminal: facts[0].termination },
    { dispatch: retryDispatch, firstContent: 'uncertain', terminal: null },
  ])
})
it('input-over-limit cannot prepare a retry and late terminal facts preserve logical settlement', async () => {
  const f = await running()
  unbox(
    await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'limit',
    }),
  )
  const termination = {
    kind: 'failed',
    fault: {
      cause: 'input-over-limit',
      diagnostic: 'limit',
      upstreamStatus: '400',
      reported: { metric: null, actual: null, limit: null },
    },
  } as const
  const facts: TransportFact[] = [{ kind: 'ended', termination }]
  f.completeWindows.add(`${f.admit.call}/limit/${digest(facts)}`)
  unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'limit',
      facts,
    }),
  )
  expect(
    await f.commands.prepareRetry({ ...(await f.write()), dispatch: f.dispatch }),
  ).toMatchObject({ failure: { kind: 'invalid' } })
  const settlement = unbox(await f.commands.settle({ ...(await f.write()), termination }))
  const late = {
    ...f.admit,
    operation: op('late'),
    dispatch: f.dispatch,
    source: proof(`${f.admit.call}/${f.dispatch}`, 'supplier'),
    fact: { kind: 'terminal', event: 'terminal', actual: termination } as const,
  }
  unbox(await f.commands.recordLateFact(late))
  expect(unbox(await f.commands.recordLateFact(late)).recovered).toBe(true)
  const record = unbox(await f.commands.loadRecovery(f.admit))
  expect(record.state.phase === 'settled' && record.state.settlement).toEqual(settlement)
})
it('counts historical confirmation material and refuses the whole batch when the reservation would be exceeded', async () => {
  const f = await running()
  unbox(
    await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'open',
    }),
  )
  unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'open',
      facts: [{ kind: 'block-open', index: '0', mode: 'append', content: 'text' }],
    }),
  )
  let refused = false
  for (let i = 0; i < 30; i += 1) {
    const window = `delta-${i}`
    const open = await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window,
    })
    if ('failure' in open) {
      refused = open.failure.kind === 'capacity'
      break
    }
    const before = unbox(await f.commands.loadRecovery(f.admit))
    const input = {
      ...(await f.write()),
      dispatch: f.dispatch,
      window,
      facts: [
        { kind: 'block-delta', index: '0', delta: 'x'.repeat(1000) },
      ] satisfies TransportFact[],
    }
    const result = await f.commands.preserve(input)
    if ('failure' in result) {
      expect(result.failure.kind).toBe('capacity')
      expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
      expect(await f.commands.preserve(input)).toEqual(result)
      refused = true
      break
    }
  }
  expect(refused).toBe(true)
})
for (const kind of ['text', 'thinking', 'voice'] as const)
  it(`counts actual ${kind} content but not its empty opening`, async () => {
    const f = await running()
    unbox(
      await f.commands.openReceiveWindow({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'modality',
      }),
    )
    const value = kind === 'voice' ? 'YWJj' : 'body'
    const judged = judgeContentBlock({
      kind,
      id: `block-${kind}`,
      visibility: { toHuman: true, toModel: true },
      ...(kind === 'voice' ? { mediaType: 'audio/wav', inline: value } : { text: value }),
    })
    if ('rejected' in judged) throw new Error('fixture')
    const snapshot = unbox(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'modality',
        facts: [
          { kind: 'block-open', index: '0', mode: 'append', content: kind },
          { kind: 'block-delta', index: '0', delta: value },
          { kind: 'block-seal', index: '0', block: judged.ok },
        ],
      }),
    )
    expect(snapshot.state.phase === 'running' && snapshot.state.firstContent).toBe('observed')
  })
for (const kind of ['image', 'file'] as const)
  it(`accepts a whole ${kind} and never retries after actual content`, async () => {
    const f = await running()
    unbox(
      await f.commands.openReceiveWindow({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'whole',
      }),
    )
    const block = judgeContentBlock({
      kind,
      id: kind,
      visibility: { toHuman: true, toModel: true },
      ...(kind === 'image'
        ? { mediaType: 'image/png', inline: 'image' }
        : { storage: 'test', key: 'file', mediaType: 'application/test' }),
    })
    if ('rejected' in block) throw new Error('fixture')
    const facts: TransportFact[] = [
      { kind: 'block-seal', index: '0', block: block.ok },
      {
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: { cause: 'stream-lost', diagnostic: 'lost', upstreamStatus: null },
        },
      },
    ]
    const saved = unbox(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'whole',
        facts,
      }),
    )
    expect(saved.state.phase === 'running' && saved.state.firstContent).toBe('observed')
    expect(
      await f.commands.prepareRetry({ ...(await f.write()), dispatch: f.dispatch }),
    ).toMatchObject({ failure: { field: 'firstContent' } })
  })
for (const kind of ['image', 'file'] as const)
  it(`preserves a whole ${kind} reference through the real shared assembler and settles without changing it`, async () => {
    const f = await running()
    unbox(
      await f.commands.openReceiveWindow({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'reference',
      }),
    )
    const reference = judgeContentBlock({
      kind,
      id: `ref-${kind}`,
      visibility: { toHuman: true, toModel: true },
      ref: {
        storage: 'test',
        key: kind,
        mediaType: 'test/media',
        bytes: '123',
        digest: 'test-digest',
      },
      transcript: 'kept transcript',
    })
    if ('rejected' in reference) throw new Error('fixture')
    const facts: TransportFact[] = [
      { kind: 'block-seal', index: '0', block: reference.ok },
      { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
    ]
    const input = { ...(await f.write()), dispatch: f.dispatch, window: 'reference', facts }
    const snapshot = unbox(await f.commands.preserve(input))
    expect(snapshot.blocks).toEqual([{ kind: 'sealed', index: '0', block: reference.ok }])
    expect(snapshot.state.phase === 'running' && snapshot.state.firstContent).toBe('observed')
    expect(unbox(await f.commands.preserve(input))).toEqual(snapshot)
    const result = unbox(
      await f.commands.settle({
        ...(await f.write()),
        termination: { kind: 'completed', reason: 'stop' },
      }),
    )
    expect(result.termination).toEqual({ kind: 'completed', reason: 'stop' })
  })
it('rejects malformed whole-media batches atomically and keeps the original window available', async () => {
  const f = await running()
  unbox(
    await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'invalid-ref',
    }),
  )
  const ref = judgeContentBlock({
    kind: 'image',
    id: 'image',
    visibility: { toHuman: true, toModel: true },
    ref: { storage: 'test', key: 'key', mediaType: 'image/png', bytes: '123', digest: 'digest' },
    transcript: null,
  })
  if ('rejected' in ref) throw new Error('fixture')
  const before = unbox(await f.commands.loadRecovery(f.admit))
  const facts: TransportFact[] = [
    { kind: 'block-seal', index: '0', block: ref.ok },
    { kind: 'block-delta', index: '0', delta: 'after-seal' },
  ]
  const input = { ...(await f.write()), dispatch: f.dispatch, window: 'invalid-ref', facts }
  expect(await f.commands.preserve(input)).toMatchObject({ failure: { kind: 'invalid' } })
  expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
  expect(
    unbox(
      await f.commands.preserve({
        ...input,
        facts: [{ kind: 'block-seal', index: '0', block: ref.ok }],
      }),
    ).blocks,
  ).toEqual([{ kind: 'sealed', index: '0', block: ref.ok }])
})
it('does not admit unopened voice or discard prior voice fragments in a reference conversion', async () => {
  const f = await running()
  unbox(
    await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'voice-ref',
    }),
  )
  const voice = judgeContentBlock({
    kind: 'voice',
    id: 'voice',
    visibility: { toHuman: true, toModel: true },
    ref: { storage: 'test', key: 'voice', mediaType: 'audio/wav', bytes: '123', digest: 'digest' },
    transcript: null,
  })
  if ('rejected' in voice) throw new Error('fixture')
  const input = { ...(await f.write()), dispatch: f.dispatch, window: 'voice-ref' }
  expect(
    await f.commands.preserve({
      ...input,
      facts: [{ kind: 'block-seal', index: '0', block: voice.ok }],
    }),
  ).toMatchObject({ failure: { field: 'block' } })
  expect(
    await f.commands.preserve({
      ...input,
      facts: [
        { kind: 'block-open', index: '0', mode: 'replace', content: 'voice' },
        { kind: 'block-replace', index: '0', value: 'audio' },
        { kind: 'block-replace', index: '0', value: '' },
        { kind: 'block-seal', index: '0', block: voice.ok },
      ],
    }),
  ).toMatchObject({ failure: { kind: 'invalid' } })
})
for (const bad of ['window', 'batchDigest', 'paused', 'noPrefetch'])
  it(`does not close an unproven receive window after mismatched ${bad} evidence`, async () => {
    const f = await running()
    const adapter = f.options.evidence[0]
    if (!adapter) throw new Error('fixture adapter')
    const normal = adapter.receive.bind(adapter)
    Object.assign(adapter, {
      receive(input: Parameters<typeof normal>[0]) {
        if (input.window !== 'bad-proof') return normal(input)
        const proof = {
          window: input.window,
          batchDigest: input.batchDigest,
          paused: true,
          noPrefetch: true,
        }
        Object.assign(proof, { [bad]: bad === 'window' || bad === 'batchDigest' ? 'wrong' : false })
        return { ok: proof }
      },
    })
    unbox(
      await f.commands.openReceiveWindow({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'bad-proof',
      }),
    )
    const badSnapshot = unbox(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'bad-proof',
        facts: [],
      }),
    )
    expect(badSnapshot.state.phase === 'running' && badSnapshot.state.firstContent).toBe(
      'uncertain',
    )
    unbox(
      await f.commands.openReceiveWindow({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'good-proof',
      }),
    )
    f.completeWindows.add(`${f.admit.call}/good-proof/${digest([])}`)
    const goodSnapshot = unbox(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'good-proof',
        facts: [],
      }),
    )
    expect(goodSnapshot.state.phase === 'running' && goodSnapshot.state.firstContent).toBe(
      'uncertain',
    )
  })
it('atomically saves supplier accounts, recognizes events and rejects wrong subjects or regressing revisions', async () => {
  const f = await running()
  const account = {
    subject: { kind: 'model_call', id: f.admit.call },
    usage: [{ name: 'output', state: 'known', lexeme: '1', unit: 'token' }],
    cost: [],
    trimmed: { state: 'known', lexeme: '0', unit: 'token' },
    place: 'supplier',
    duration: { state: 'unknown' },
    receipt: 'received',
    revision: '1',
  } satisfies import('@omne-harness/call-account').CallAccount
  const window = 'account'
  unbox(await f.commands.openReceiveWindow({ ...(await f.write()), dispatch: f.dispatch, window }))
  const before = await f.commands.loadRecovery(f.admit)
  for (const subject of [
    { kind: 'model_call', id: 'mcall_other' },
    { kind: 'tool_execution', id: f.admit.call },
  ] as const) {
    expect(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch: f.dispatch,
        window,
        facts: [
          { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
          { kind: 'block-delta', index: '0', delta: 'must not commit' },
          { kind: 'account', event: 'original', value: { ...account, subject } },
        ],
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'account' } })
    expect(await f.commands.loadRecovery(f.admit)).toEqual(before)
    expect(unbox(await f.commands.dispatches(f.admit))[0]?.account).toBeNull()
  }
  const facts: readonly TransportFact[] = [{ kind: 'account', event: 'original', value: account }]
  f.completeWindows.add(`${f.admit.call}/${window}/${digest(facts)}`)
  const input = { ...(await f.write()), dispatch: f.dispatch, window, facts }
  const saved = unbox(await f.commands.preserve(input))
  expect(unbox(await f.commands.preserve(input))).toEqual(saved)
  const late = {
    ...f.admit,
    operation: op('account-late'),
    dispatch: f.dispatch,
    source: proof(`${f.admit.call}/${f.dispatch}`, 'supplier'),
    fact: { kind: 'account', event: 'original', value: account },
  } satisfies Parameters<typeof f.commands.recordLateFact>[0]
  unbox(await f.commands.recordLateFact(late))
  const revision = unbox(await f.commands.loadRecovery(f.admit)).state.revision
  expect(
    unbox(await f.commands.recordLateFact({ ...late, operation: op('account-replay') })).recovered,
  ).toBe(true)
  expect(unbox(await f.commands.loadRecovery(f.admit)).state.revision).toEqual(revision)
  for (const fact of [
    { ...late.fact, value: { ...account, revision: '2' } },
    { ...late.fact, event: 'stale', value: { ...account, revision: '0' } },
    { ...late.fact, event: 'equal', value: account },
    { ...late.fact, event: 'malformed', value: { ...account, revision: '2', duration: 'invalid' } },
  ]) {
    const state = await f.commands.loadRecovery(f.admit)
    expect(
      await f.commands.recordLateFact({ ...late, operation: op(`bad-${fact.event}`), fact }),
    ).toMatchObject({ failure: { kind: 'invalid' } })
    expect(await f.commands.loadRecovery(f.admit)).toEqual(state)
    expect(unbox(await f.commands.dispatches(f.admit))[0]?.account).toEqual(account)
  }
  const updated = { ...account, revision: '2', receipt: 'late' } as const
  unbox(
    await f.commands.recordLateFact({
      ...late,
      operation: op('account-update'),
      fact: { kind: 'account', event: 'update', value: updated },
    }),
  )
  expect(unbox(await f.commands.dispatches(f.admit))[0]?.account).toEqual(updated)
})

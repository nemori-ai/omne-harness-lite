import { it, expect } from 'vitest'
import { decodeActionId, decodePassageId, type Passage } from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { judgeMessage } from '@omne-harness/message'
import { assistantMessage } from '@omne-harness/session-contract/testing'
import { scene, ok, operation, evidence, instance } from './fixtures/common-journal.ts'
import { take, handed, end } from './fixtures/progression.ts'

it('detach and attach fence the former Authority while preserving the original operation answers', async () => {
  const s = await scene('attachments'),
    detached = ok(
      await s.view.journal.detach({
        ...s.access,
        execution: s.execution,
        operation: operation('detach'),
        authority: s.opened.authority,
        reason: evidence('detach'),
      }),
    )
  expect(
    ok(await s.view.journal.load({ ...s.access, execution: s.execution })).executionAttachment,
  ).toBeNull()
  const attached = ok(
    await s.view.journal.attach({
      ...s.access,
      execution: s.execution,
      operation: operation('attach'),
      instance: instance('second'),
      grant: s.input.runtime.grant,
      recovery: detached,
      takeover: null,
    }),
  )
  expect(attached.authority.generation).toBe('2')
  expect(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('former'),
      authority: s.opened.authority,
      expected: attached.receipt.revision,
      checkpoint: s.checkpoint,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  ).toMatchObject({ failure: { kind: 'stale-advance' } })
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('current'),
      authority: attached.authority,
      expected: attached.receipt.revision,
      checkpoint: s.checkpoint,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  expect(
    ok(
      await s.view.journal.query({
        ...s.access,
        execution: s.execution,
        operation: operation('detach'),
      }),
    ).kind,
  ).toBe('committed')
})
it('reply admissions page the actual original decisions and output acknowledgement never acknowledges a Model', async () => {
  const s = await scene('admissions'),
    model = sampleReceivedModelResult(s.access.tenant, 'admission')
  if (model.delivery.producer !== 'model') throw new Error('model fixture expected')
  const call = ok(resolveModelInvocationRef(model.delivery.key.reference, s.access.tenant)).call
  let receipt = s.opened.receipt
  for (const [index, decision] of ['rejected', 'admitted', 'rejected'].entries())
    receipt = ok(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(`reply-${index}`),
        authority: s.opened.authority,
        expected: receipt.revision,
        checkpoint: s.checkpoint,
        state: { kind: 'advancing' },
        // One Agent-owned event per commit, so that the acknowledgement below has sequence '3'
        // to reach; the Model reply itself is not an Agent event.
        events: [
          {
            kind: 'message',
            message: assistantMessage(`reply-${index}`),
            source: evidence(`message-${index}`),
          },
        ],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: {
          step: s.checkpoint.step,
          action: ok(decodeActionId(`action-${index}`)),
          call,
          resultVersion: String(index),
          decision: decision as 'admitted' | 'rejected',
          source: evidence(`reply-${index}`),
        },
        handoff: null,
        finish: null,
      }),
    )
  const snapshot = ok(await s.view.journal.load({ ...s.access, execution: s.execution })),
    first = ok(
      await s.view.journal.readReplyAdmissions({
        ...s.access,
        execution: s.execution,
        through: snapshot.replyAdmissions.through,
        after: null,
        limit: 2,
      }),
    )
  expect(first.kind === 'page' && first.items.map(item => item.fact.decision)).toEqual([
    'rejected',
    'admitted',
  ])
  if (first.kind !== 'page') throw new Error('page expected')
  expect(
    ok(
      await s.view.journal.readReplyAdmissions({
        ...s.access,
        execution: s.execution,
        through: first.through,
        after: first.next,
        limit: 2,
      }),
    ),
  ).toMatchObject({ kind: 'page', complete: true, items: [{ sequence: '3' }] })
  ok(
    await s.view.journal.acknowledge({
      ...s.access,
      execution: s.execution,
      operation: operation('ack'),
      through: '3',
      receipt: evidence('consumer-ack'),
    }),
  )
  const after = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  expect(after.output.acknowledgedThrough).toBe('3')
  expect(after.results).toEqual([])
})
it('commit refuses an entry or ended event body as invalid events, because the Journal allocates those', async () => {
  const s = await scene('journal-allocated-events')
  const bodies = [
    { kind: 'entry', entry: sampleReceivedModelResult(s.access.tenant, 'bypassed') },
    { kind: 'ended', conclusion: { kind: 'complete' }, disposition: evidence('bypassed') },
  ] as const
  for (const body of bodies) {
    const refused = await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(`bypass-${body.kind}`),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: s.checkpoint,
      state: { kind: 'advancing' },
      // The type already excludes these bodies; the cast is the caller bypassing it.
      events: [body] as unknown as Parameters<typeof s.view.journal.commit>[0]['events'],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    })
    expect(refused).toMatchObject({
      failure: { kind: 'invalid', field: 'events', reason: expect.stringContaining(body.kind) },
    })
  }
  const snapshot = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  expect(snapshot.revision).toBe(s.opened.receipt.revision)
  expect(
    ok(
      await s.view.journal.output.read({
        ...s.access,
        execution: s.execution,
        after: null,
        limit: 10,
      }),
    ),
  ).toMatchObject({ kind: 'page', events: [] })
})
it('a context transition and the original Agent answer publish together and recover together', async () => {
  const s = await scene('context-joint'),
    rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session),
    last = rows.findIndex(row => row.kind === 'run.started') - 1
  const judged = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'compaction',
    blocks: [
      {
        kind: 'text',
        id: 'summary',
        text: 'summary',
        visibility: { toHuman: true, toModel: true },
      },
    ],
    covers: { from: rows[0]!.id, to: rows[last]!.id },
    retained: rows.filter(row => row.kind.startsWith('message.')).map(row => row.id),
    derivation: evidence('summary'),
  })
  if (!('ok' in judged)) throw new Error('valid compaction message required')
  const message = judged.ok
  const request = {
    ...s.access,
    execution: s.execution,
    operation: operation('compact'),
    authority: s.opened.authority,
    expected: s.opened.receipt.revision,
    checkpoint: s.checkpoint,
    state: { kind: 'advancing' as const },
    events: [],
    effects: [],
    replyAdmission: null,
    handoff: null,
    finish: null,
    caller: {
      kind: 'context-transition' as const,
      value: {
        preparation: ok(decodeActionId('compact')),
        message,
        source: evidence('model-summary'),
        derivation: evidence('derivation'),
        commitment: evidence('commitment'),
        candidate: evidence('transition-candidate'),
        plan: evidence('transition-plan'),
        basis: {
          schema: { owner: 'test', name: 'basis', revision: '1', digest: 'test:basis' },
          value: { kind: 'null' as const },
        },
        epoch: '1',
      },
      admission: evidence('admitted-summary'),
    },
  }
  s.view.controls.faultWrite(request, 'commit', 'after-publish')
  expect(await s.view.journal.commit(request)).toMatchObject({
    failure: { kind: 'commit-unknown' },
  })
  expect(
    s.backend.controls
      .entriesOf(s.access.tenant, s.access.session)
      .filter(row => row.kind === 'message.compaction'),
  ).toHaveLength(1)
  const root = s.view.controls.root()
  ok(await s.view.journal.commit(request))
  expect(s.view.controls.root()).toBe(root)
})
it('terminal observers use the original passage after finish and cannot add execution events', async () => {
  const s = await scene('terminal-observer')
  ok(await handed(s))
  await take(s)
  const passage: Passage = {
    id: ok(decodePassageId('after-terminal')),
    position: 'after_terminal',
    dimension: null,
    purpose: null,
    action: null,
    ordinal: 0,
    declaration: {
      name: 'observe',
      position: 'after_terminal',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: 'observe' },
    },
    implementation: s.checkpoint.schema,
    input: evidence('observer-input'),
    effective: evidence('observer-effective'),
    operations: [],
    progress: { kind: 'requested', mode: { kind: 'fresh' } },
  }
  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('observer'),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, passages: [passage] },
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  const terminal = ok(await end(s))
  expect(terminal.kind).toBe('ended')
  if (terminal.kind !== 'ended') throw new Error('ended expected')
  const request = {
    ...s.access,
    execution: s.execution,
    operation: operation('observe'),
    terminal: terminal.receipt.evidence,
    passage: passage.id,
    implementation: passage.implementation,
    observed: evidence('observed'),
  }
  ok(await s.view.journal.recordTerminalObservation(request))
  expect(
    ok(await s.view.journal.load({ ...s.access, execution: s.execution })).output.emittedThrough,
  ).toBe('2')
  const root = s.view.controls.root()
  ok(await s.view.journal.recordTerminalObservation(request))
  expect(s.view.controls.root()).toBe(root)
  expect(
    await s.view.journal.recordTerminalObservation({
      ...request,
      operation: operation('different'),
      observed: evidence('different'),
    }),
  ).toMatchObject({ failure: { kind: 'conflict' } })
})

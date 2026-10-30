import { it, expect } from 'vitest'
import {
  decodePassageId,
  decodeCardRoundId,
  decodeActionId,
  type Passage,
  type PassageCard,
} from '@omne-harness/agent-contract'
import { scene, ok, operation, operationId, evidence } from './fixtures/common-journal.ts'

function passage(response: PassageCard['response']): Passage {
  const id = ok(decodePassageId('startup-passage')),
    implementation = { owner: 'test', name: 'ask', revision: '1', digest: 'ask-v1' },
    card = evidence('card-1')
  return {
    id,
    position: 'execution_started',
    dimension: null,
    purpose: null,
    action: null,
    ordinal: 0,
    declaration: {
      name: 'ask',
      position: 'execution_started',
      power: 'veto',
      implementation: { kind: 'builtin', builtinName: 'ask' },
    },
    implementation,
    input: evidence('input'),
    effective: evidence('effective'),
    operations: [],
    progress: {
      kind: 'asked',
      rounds: [
        {
          round: ok(decodeCardRoundId('round-1')),
          ask: {
            position: 'execution_started',
            passage: id,
            extension: 'ask',
            implementation,
            power: 'veto',
            at: '1',
            output: {
              kind: 'ask',
              card: {
                explanation: 'Choose',
                options: [{ id: 'yes', label: 'Yes' }],
                about: { position: 'execution_started' },
              },
            },
          },
          requests: [
            { identity: 'card-identity', schema: implementation, value: { kind: 'null' } },
          ],
          progress: {
            kind: 'presented',
            cards: [{ identity: 'card-identity', card, response, processed: null }],
          },
        },
      ],
    },
  }
}
for (const response of [
  null,
  { kind: 'chosen', option: 'yes', value: null, evidence: evidence('yes') },
  { kind: 'declined', evidence: evidence('no') },
  { kind: 'invalidated', evidence: evidence('invalidated') },
] as const) {
  it(`keeps original actionless human waiting through later checkpoint deletion: ${response?.kind ?? 'pending'}`, async () => {
    const { backend, view, access, execution, opened, checkpoint } = await scene(
      `human-${response?.kind ?? 'pending'}`,
    )
    const original = passage(response),
      wait = { kind: 'human' as const, passage: original.id, cards: [evidence('card-1')] }
    const committed = ok(
      await view.journal.commit({
        ...access,
        execution,
        operation: operation('human'),
        authority: opened.authority,
        expected: opened.receipt.revision,
        checkpoint: { ...checkpoint, passages: [original] },
        state: { kind: 'waiting', waits: [wait] },
        events: [{ kind: 'waiting', waits: [wait] }],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    ok(
      await view.journal.commit({
        ...access,
        execution,
        operation: operation('delete-checkpoint'),
        authority: opened.authority,
        expected: committed.revision,
        checkpoint: checkpoint,
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    expect(ok(await view.journal.load({ ...access, execution })).checkpoint.passages).toEqual([])
    ok(
      await backend.controls.interpret({
        ...access,
        execution,
        sequence: '1',
        operation: operationId('interpret-human'),
      }),
    )
    const state = ok(await backend.transactions.readWork(access))
    expect(state.waiting).toEqual([
      {
        kind: 'extension-passage',
        passage: original.id,
        position: 'execution_started',
        members: [
          {
            card: evidence('card-1'),
            decision:
              response?.kind === 'chosen' || response?.kind === 'declined'
                ? response.evidence
                : null,
          },
        ],
      },
    ])
    const count = backend.controls.entriesOf(access.tenant, access.session).length
    ok(
      await backend.controls.interpret({
        ...access,
        execution,
        sequence: '1',
        operation: operationId('interpret-human'),
      }),
    )
    expect(backend.controls.entriesOf(access.tenant, access.session)).toHaveLength(count)
  })
}

it('registers a remark reply as the decision of the human card, like chosen and declined', async () => {
  const { backend, view, access, execution, opened, checkpoint } = await scene('human-remark')
  const original = passage({ kind: 'remark', text: 'later, please', evidence: evidence('remark') }),
    wait = { kind: 'human' as const, passage: original.id, cards: [evidence('card-1')] }
  ok(
    await view.journal.commit({
      ...access,
      execution,
      operation: operation('human'),
      authority: opened.authority,
      expected: opened.receipt.revision,
      checkpoint: { ...checkpoint, passages: [original] },
      state: { kind: 'waiting', waits: [wait] },
      events: [{ kind: 'waiting', waits: [wait] }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  ok(
    await backend.controls.interpret({
      ...access,
      execution,
      sequence: '1',
      operation: operationId('interpret-human-remark'),
    }),
  )
  expect(ok(await backend.transactions.readWork(access)).waiting).toEqual([
    {
      kind: 'extension-passage',
      passage: original.id,
      position: 'execution_started',
      members: [{ card: evidence('card-1'), decision: evidence('remark') }],
    },
  ])
})

it('retains selected cards from several original rounds without taking later responses from a replacement checkpoint', async () => {
  const s = await scene('human-rounds'),
    original = passage(null)
  if (original.progress.kind !== 'asked') throw new Error('asked expected')
  const first = original.progress.rounds[0]!,
    second = {
      ...first,
      round: ok(decodeCardRoundId('round-2')),
      progress: {
        kind: 'presented' as const,
        cards: [
          {
            identity: 'card-2',
            card: evidence('card-2'),
            response: { kind: 'declined' as const, evidence: evidence('declined-2') },
            processed: null,
          },
        ],
      },
    }
  const before = {
      ...original,
      progress: { kind: 'asked' as const, rounds: [first, second] as const },
    },
    wait = {
      kind: 'human' as const,
      passage: original.id,
      cards: [evidence('card-1'), evidence('card-2')],
    }
  const committed = ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('human'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, passages: [before] },
      state: { kind: 'waiting', waits: [wait] },
      events: [{ kind: 'waiting', waits: [wait] }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('later-response'),
      authority: s.opened.authority,
      expected: committed.revision,
      checkpoint: {
        ...s.checkpoint,
        passages: [
          passage({ kind: 'chosen', option: 'yes', value: null, evidence: evidence('later') }),
        ],
      },
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('original'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).waiting).toMatchObject([
    {
      kind: 'extension-passage',
      members: [
        { card: evidence('card-1'), decision: null },
        { card: evidence('card-2'), decision: evidence('declined-2') },
      ],
    },
  ])
})

it('uses extension-batch for an original before-action ask, retaining the original action', async () => {
  const s = await scene('human-action'),
    base = passage(null),
    action = ok(decodeActionId('action'))
  if (base.progress.kind !== 'asked') throw new Error('asked expected')
  const original: Passage = {
    ...base,
    position: 'before_action',
    action,
    declaration: { ...base.declaration, position: 'before_action' },
    progress: {
      kind: 'asked',
      rounds: [
        {
          ...base.progress.rounds[0],
          ask: {
            passage: base.id,
            extension: 'ask',
            implementation: base.implementation,
            power: 'veto',
            at: '1',
            position: 'before_action',
            action,
            output: {
              kind: 'ask',
              card: {
                explanation: 'Choose',
                options: [{ id: 'yes', label: 'Yes' }],
                about: { position: 'before_action', action },
              },
            },
          },
        },
      ],
    },
  }
  const wait = { kind: 'human' as const, passage: original.id, cards: [evidence('card-1')] }
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('human'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, passages: [original] },
      state: { kind: 'waiting', waits: [wait] },
      events: [{ kind: 'waiting', waits: [wait] }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('original'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).waiting).toMatchObject([
    { kind: 'extension-batch', members: [{ action, card: evidence('card-1'), decision: null }] },
  ])
})

for (const loss of ['temporary', 'permanent'] as const)
  it(`does not fabricate a waiting interpretation when original material is ${loss}`, async () => {
    const s = await scene(`human-${loss}`),
      original = passage(null),
      wait = { kind: 'human' as const, passage: original.id, cards: [evidence('card-1')] }
    ok(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('human'),
        authority: s.opened.authority,
        expected: s.opened.receipt.revision,
        checkpoint: { ...s.checkpoint, passages: [original] },
        state: { kind: 'waiting', waits: [wait] },
        events: [{ kind: 'waiting', waits: [wait] }],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    if (loss === 'temporary') s.view.controls.historyAvailable(s.execution, false)
    else s.view.controls.loseHumanMaterial(s.execution, '1')
    const root = s.view.controls.root(),
      input = {
        ...s.access,
        execution: s.execution,
        sequence: '1',
        operation: operationId('original'),
      }
    expect(await s.backend.controls.interpret(input)).toMatchObject({
      failure: { kind: loss === 'temporary' ? 'unavailable' : 'quarantined' },
    })
    expect(s.view.controls.root()).toBe(root)
    if (loss === 'temporary') {
      s.view.controls.historyAvailable(s.execution, true)
      ok(await s.backend.controls.interpret(input))
    } else
      expect(await s.view.journal.load({ ...s.access, execution: s.execution })).toMatchObject({
        failure: { kind: 'unavailable' },
      })
  })

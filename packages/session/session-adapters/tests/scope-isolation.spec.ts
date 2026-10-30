import { it, expect } from 'vitest'
import { decodeAgentExecutionId, decodeInputId } from '@omne-harness/agent-contract'
import {
  createMemoryInitializationSource,
  createPolicySessionAccessCheck,
  memoryAccess,
  memoryOtherAccess,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { createMemorySessionJournal } from '../src/testing.ts'
import { originalScope } from './fixtures/original-scope.ts'
import {
  ok,
  operation,
  instance,
  checkpoint,
  evidence,
  openInput,
} from './fixtures/common-journal.ts'

it('keeps identical original execution, input and operation IDs isolated in three roots of one backend', async () => {
  const initialization = createMemoryInitializationSource(),
    backend = createMemorySessionJournal({
      initialization,
      accessCheck: createPolicySessionAccessCheck(request => ({
        kind: 'allowed',
        evidence: evidence(`access/${request.operation}`),
      })),
      authorize: () => 'allowed',
    }),
    execution = ok(decodeAgentExecutionId('same-execution'))
  const scopes = [
    memoryAccess('one', 'same-session'),
    { ...memoryOtherAccess('two'), session: sessionId('same-session') },
    memoryAccess('one', 'other-session'),
  ]
  const views = []
  for (const access of scopes) {
    const seed = await originalScope(initialization, access, execution)
    ok(backend.controls.loadHistory(seed))
    const initial = seed.command.input.creation.initial!
    const view = backend.forSession(access)
    const opening = checkpoint()
    const input = openInput({
      access,
      execution,
      operation: operation('same-open'),
      instance: instance(),
      grant: ok(backend.controls.originalGrant({ ...access, execution })),
      initial: {
        id: ok(decodeInputId(initial.input)),
        content: initial.message,
        source: initial.origin,
        priority: 'ordinary' as const,
      },
      checkpoint: opening,
    })
    const opened = ok(await view.journal.open(input))
    views.push({ access, view, input, opened, checkpoint: opening })
  }
  const before = views.map(item => item.view.controls.root()),
    first = views[0]!
  const watermark = ok(
      await first.view.journal.load({ ...first.access, execution }),
    ).inputWatermark,
    page = ok(await first.view.journal.inputs({ ...first.access, execution, watermark }))
  ok(
    await first.view.journal.commit({
      ...first.access,
      execution,
      operation: operation('same-commit'),
      authority: first.opened.authority,
      expected: first.opened.receipt.revision,
      checkpoint: { ...first.checkpoint, inputBatch: page.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: page.batch }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
    }),
  )
  for (const [i, item] of views.entries())
    if (i !== 0) {
      expect(item.view.controls.root()).toBe(before[i])
      expect(
        ok(await item.view.journal.load({ ...item.access, execution })).output.emittedThrough,
      ).toBeNull()
      expect(
        await item.view.journal.inputs({ ...item.access, execution, watermark }),
      ).toMatchObject({ failure: { kind: 'invalid' } })
    }
  expect(await first.view.journal.load({ ...scopes[1]!, execution })).toMatchObject({
    failure: { kind: 'denied' },
  })
  expect(new Set(views.map(item => item.opened.receipt.evidence.record)).size).toBe(3)
})
it('trusted original history cannot overwrite a root or admit incomplete and foreign history', async () => {
  const initialization = createMemoryInitializationSource(),
    backend = createMemorySessionJournal({
      initialization,
      accessCheck: createPolicySessionAccessCheck(request => ({
        kind: 'allowed',
        evidence: evidence(`access/${request.operation}`),
      })),
      authorize: () => 'allowed',
    }),
    access = memoryAccess('one', 'seed'),
    execution = ok(decodeAgentExecutionId('seed'))
  const seed = await originalScope(initialization, access, execution)
  const incomplete = { ...seed, batches: [seed.batches[1]!] }
  expect(backend.controls.loadHistory(incomplete)).toMatchObject({ failure: { kind: 'invalid' } })
  const foreign = await originalScope(
    initialization,
    { ...memoryOtherAccess('two'), session: access.session },
    execution,
  )
  expect(backend.controls.loadHistory({ ...seed, batches: foreign.batches })).toHaveProperty(
    'failure',
  )
  ok(backend.controls.loadHistory(seed))
  const root = backend.forSession(access).controls.root()
  expect(backend.controls.loadHistory(seed)).toMatchObject({ failure: { kind: 'conflict' } })
  expect(backend.forSession(access).controls.root()).toBe(root)
})
it('a preselected evidence strategy is bound to full input and scope before actual open', async () => {
  const initialization = createMemoryInitializationSource(),
    backend = createMemorySessionJournal({
      initialization,
      accessCheck: createPolicySessionAccessCheck(request => ({
        kind: 'allowed',
        evidence: evidence(`access/${request.operation}`),
      })),
      authorize: () => 'allowed',
    }),
    execution = ok(decodeAgentExecutionId('planned'))
  for (const access of [memoryAccess('one', 'plan-one'), memoryAccess('one', 'plan-two')]) {
    const seed = await originalScope(initialization, access, execution)
    ok(backend.controls.loadHistory(seed))
    const original = seed.command.input.creation.initial!,
      view = backend.forSession(access)
    const fields = {
        access,
        execution,
        operation: operation('open'),
        instance: instance(),
        grant: ok(backend.controls.originalGrant({ ...access, execution })),
        initial: {
          id: ok(decodeInputId(original.input)),
          content: original.message,
          source: original.origin,
          priority: 'ordinary' as const,
        },
        checkpoint: checkpoint(),
      },
      input = openInput(fields),
      proof = evidence('same-preselected-text')
    ok(view.controls.planEvidence(input, 'open', proof))
    expect(
      view.controls.planEvidence({ ...input, operation: operation('other') }, 'open', proof),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    const changed = openInput({
      ...fields,
      initial: { ...fields.initial, source: evidence('different') },
    })
    expect(view.controls.planEvidence(changed, 'open', proof)).toMatchObject({
      failure: { kind: 'conflict' },
    })
    const opened = ok(await view.journal.open(input))
    expect(opened.receipt.evidence).toEqual(proof)
    expect(view.controls.planEvidence(input, 'open', evidence('replacement'))).toMatchObject({
      failure: { kind: 'conflict' },
    })
    expect(ok(await view.journal.open(input))).toEqual(opened)
  }
})

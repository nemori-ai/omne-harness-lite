import { expect, it } from 'vitest'
import { decodeAgentExecutionId, decodeStepId } from '@omne-harness/agent-contract'
import {
  fold,
  emptyExecutionView,
  emptySessionView,
  type PublishedBatch,
} from '../src/journal/index.ts'
import { ok, operation } from './fixtures/common-journal.ts'

it('continues event identities from the durable high-water mark after acknowledged bodies leave the working view', () => {
  const execution = ok(decodeAgentExecutionId('current-event-sequence'))
  const seed = {
    ...emptyExecutionView(execution),
    head: 10,
    revision: 10,
    emitted: 10,
    acknowledged: 10,
    events: [],
  }
  const view = { ...emptySessionView(), head: 10, executions: new Map([[execution, seed]]) }
  const batch: PublishedBatch = {
    execution,
    pub: 11,
    envelope: { op: operation('next-event'), digest: 'commit:next', rev: 11, gen: '1', kinds: [] },
    facts: [
      {
        kind: 'wait.entered',
        step: ok(decodeStepId('step-current')),
        waits: { digest: 'waits', size: 2 },
      },
    ],
  }
  const next = fold(view, batch).executions.get(execution)!
  expect(next.events.map(event => event.eseq)).toEqual([11])
  expect(next).toHaveProperty('emitted', 11)
  expect(next.acknowledged).toBe(10)
})

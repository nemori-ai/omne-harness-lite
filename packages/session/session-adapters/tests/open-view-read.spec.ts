import { expect, it } from 'vitest'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import { readOpenView } from '../src/cordis/item-read.ts'
import type { Reader } from '../src/cordis/journal-read.ts'
import { emptyExecutionView, viewItems, type ExecutionView } from '../src/journal/index.ts'
import { SharedMap } from '../src/journal/shared-map.ts'

const EXECUTION = 'run_1/execution' as AgentExecutionId
const holds = { actions: [], consumptions: [], handoffs: [], admissionsFrom: 0 }

const rows = (view: ExecutionView, closed: readonly string[] = []) =>
  viewItems(view).map(item => ({
    family: item.family,
    item: item.item,
    open: !closed.includes(item.family),
    pub: '1',
    body: JSON.parse(JSON.stringify(item.body)) as never,
  }))

it('an execution that left finishing between the two reads is read as its open items only', async () => {
  const empty = emptyExecutionView(EXECUTION)
  const settling: ExecutionView = { ...empty, cursor: { state: 'settling', holds } }
  // The same execution one batch later: back to advancing, the intent of its settled call closed.
  const intent = { action: 'a1', step: 's1', pending: {}, authority: {}, request: null, pub: 1 }
  const advancing: ExecutionView = {
    ...empty,
    cursor: { state: 'advancing', holds },
    intents: new SharedMap([['a1', intent]]) as never,
  }
  const asked: boolean[] = []
  const read: Reader = async (_handler, input) => {
    const all = (input as { all?: boolean }).all === true
    asked.push(all)
    return {
      kind: 'read',
      output: all
        ? { kind: 'open', published: '6', items: rows(advancing, ['intent']), next: null }
        : { kind: 'open', published: '5', items: rows(settling), next: null },
    }
  }
  const found = await readOpenView(read, { tenant: 't', session: 's' }, [EXECUTION], 0)
  if (found.kind !== 'read') throw new Error(found.diagnostic)
  expect(asked).toEqual([false, true])
  expect(found.published).toBe(6)
  expect(found.full).toEqual([])
  expect(found.views.map(view => [view.cursor.state, view.intents.size])).toEqual([
    ['advancing', 0],
  ])
})

it('an execution that still finishes is held in full, with its open view beside it', async () => {
  const empty = emptyExecutionView(EXECUTION)
  const intent = { action: 'a1', step: 's1', pending: {}, authority: {}, request: null, pub: 1 }
  const settling: ExecutionView = {
    ...empty,
    cursor: { state: 'settling', holds },
    intents: new SharedMap([['a1', intent]]) as never,
  }
  const read: Reader = async (_handler, input) => ({
    kind: 'read',
    output: {
      kind: 'open',
      published: '5',
      items:
        (input as { all?: boolean }).all === true
          ? rows(settling, ['intent'])
          : rows(settling, ['intent']).filter(row => row.open),
      next: null,
    },
  })
  const found = await readOpenView(read, { tenant: 't', session: 's' }, [EXECUTION], 0)
  if (found.kind !== 'read') throw new Error(found.diagnostic)
  expect(found.full.map(view => view.intents.size)).toEqual([1])
  expect(found.views.map(view => view.intents.size)).toEqual([0])
})

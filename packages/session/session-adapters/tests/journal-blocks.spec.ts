import { expect, it } from 'vitest'
import { decodeAgentExecutionId, type Passage } from '@omne-harness/agent-contract'
import { blobRowDigest } from '../src/cordis/journal-batch.ts'
import { fetchNamed, type BlockRead } from '../src/cordis/journal-blocks.ts'
import {
  blobOf,
  blobsOf,
  cursorOf,
  emptyExecutionView,
  type Blob,
  type ExecutionView,
} from '../src/journal/index.ts'
import { canonical } from '../src/testing/canonical.ts'
import { checkpoint as sampleCheckpoint } from './fixtures/common-journal.ts'
import { evidence } from './fixtures/journal-facts.ts'

const execution = (() => {
  const decoded = decodeAgentExecutionId('execution-1')
  if ('failure' in decoded) throw new Error('the execution id did not decode')
  return decoded.ok
})()

function call(id: string, builtinName: string): Passage {
  return {
    id,
    position: 'before_terminal',
    dimension: null,
    purpose: null,
    action: null,
    ordinal: 0,
    declaration: {
      name: id,
      position: 'before_terminal',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName },
    },
    implementation: sampleCheckpoint().schema,
    input: evidence(`${id}-input`),
    effective: evidence(`${id}-effective`),
    operations: [],
    progress: { kind: 'requested', mode: { kind: 'fresh' } },
  } as never as Passage
}

/** An execution whose current cursor holds one extension call and whose candidate cursor holds another. */
function scene() {
  const current = { ...sampleCheckpoint(), passages: [call('pass/current', 'current-builtin')] }
  const earlier = { ...sampleCheckpoint(), passages: [call('pass/candidate', 'candidate-builtin')] }
  const candidateCursor = blobOf({ members: cursorOf(earlier, { kind: 'settling' }) })
  const blocks: Blob[] = [...blobsOf(current), ...blobsOf(earlier), candidateCursor]
  const view = {
    ...emptyExecutionView(execution),
    cursor: cursorOf(current, { kind: 'settling' }),
    finish: {
      ...emptyExecutionView(execution).finish,
      candidates: [{ cursor: { digest: candidateCursor[0], size: 1 } }],
    },
  } as never as ExecutionView
  const store = new Map(blocks.map(([digest, value]) => [blobRowDigest(digest), canonical(value)]))
  const rowOf = (text: string) =>
    [...store].find(([, payload]) => payload.includes(text) && payload.includes('builtin'))![0]
  return { view, store, rowOf }
}

const readFrom =
  (store: ReadonlyMap<string, string>): BlockRead =>
  async row =>
    store.get(row) ?? null

it('reads the calls and the declarations that the cursor of a candidate names, beside those of the current cursor', async () => {
  const { view, store } = scene()
  const into = new Map<string, string>()
  expect(await fetchNamed(readFrom(store), [view], into)).toBeNull()
  const read = [...into.values()].join('\n')
  for (const text of ['pass/current', 'current-builtin', 'pass/candidate', 'candidate-builtin'])
    expect(read).toContain(text)
})

it.each(['current-builtin', 'candidate-builtin'])(
  'names the declaration block that is not readable: %s',
  async text => {
    const { view, store, rowOf } = scene()
    const missing = rowOf(text)
    store.delete(missing)
    expect(await fetchNamed(readFrom(store), [view], new Map())).toBe(missing)
  },
)

it('answers the row of a block the storage could not read, and does not hold it as read', async () => {
  const { view, store, rowOf } = scene()
  const unread = rowOf('candidate-builtin')
  const into = new Map<string, string>()
  const read: BlockRead = async row => (row === unread ? 'unavailable' : (store.get(row) ?? null))
  expect(await fetchNamed(read, [view], into)).toBe(unread)
  expect(into.has(unread)).toBe(false)
})

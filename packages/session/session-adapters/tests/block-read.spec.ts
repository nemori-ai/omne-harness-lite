import { expect, it } from 'vitest'
import {
  decodeAgentExecutionId,
  type ExtensionChain,
  type LoopExtensionDeclaration,
  type Passage,
} from '@omne-harness/agent-contract'
import { fetchBlobClosure, fetchNamed } from '../src/cordis/block-read.ts'
import { ContentRefs, keepNamed } from '../src/cordis/content-refs.ts'
import { blobRowDigest } from '../src/cordis/journal-batch.ts'
import type { Reader } from '../src/cordis/journal-read.ts'
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

const unread: Reader = async () => ({ kind: 'unread', reason: 'closing' })

it('a block the store does not answer is not readable, and nothing is kept for it', async () => {
  const into = new Map<string, string>()
  expect(await fetchBlobClosure(unread, 'tenant', ['row-1'], into)).toBe('row-1')
  expect(into.size).toBe(0)
})

const execution = (() => {
  const decoded = decodeAgentExecutionId('execution-1')
  if ('failure' in decoded) throw new Error('the execution id did not decode')
  return decoded.ok
})()

const declarationOf = (name: string, builtinName: string): LoopExtensionDeclaration => ({
  name,
  position: 'before_terminal',
  power: 'observe',
  implementation: { kind: 'builtin', builtinName },
})

function call(id: string, builtinName: string): Passage {
  return {
    id,
    position: 'before_terminal',
    dimension: null,
    purpose: null,
    action: null,
    ordinal: 0,
    declaration: declarationOf(id, builtinName),
    implementation: sampleCheckpoint().schema,
    input: evidence(`${id}-input`),
    effective: evidence(`${id}-effective`),
    operations: [],
    progress: { kind: 'requested', mode: { kind: 'fresh' } },
  } as never as Passage
}

/** An execution whose current cursor holds one extension call and a chain with a member not called yet, and whose candidate cursor holds another call. */
function scene() {
  const chain: ExtensionChain = {
    pass: 'pass',
    position: 'before_terminal',
    dimension: null,
    purpose: null,
    basis: null,
    members: [
      {
        source: 'tenant',
        declaration: declarationOf('pass/current', 'current-builtin'),
        implementation: sampleCheckpoint().schema,
      },
      {
        source: 'tenant',
        declaration: declarationOf('pass/later', 'later-builtin'),
        implementation: sampleCheckpoint().schema,
      },
    ],
  } as never as ExtensionChain
  const current = {
    ...sampleCheckpoint(),
    passages: [call('pass/current', 'current-builtin')],
    chain,
  }
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
    [...store].find(([, payload]) => payload.includes(text) && !payload.includes('"id"'))![0]
  return { view, store, rowOf }
}

const readFrom =
  (store: ReadonlyMap<string, string>, unread?: string): Reader =>
  async (_handler, input) => {
    const digest = (input as { digest: string }).digest
    const payload = digest === unread ? undefined : store.get(digest)
    return payload === undefined
      ? { kind: 'unread', reason: 'absent' }
      : {
          kind: 'read',
          output: { kind: 'blob', digest, media: 'application/json', size: '1', payload },
        }
  }

it('reads the calls and declarations both cursors reach, and the declaration of a chain member not called yet', async () => {
  const { view, store } = scene()
  const into = new Map<string, string>()
  expect(await fetchNamed(readFrom(store), 'tenant', [view], into)).toBeNull()
  const read = [...into.values()].join('\n')
  for (const text of [
    'pass/current',
    'current-builtin',
    'pass/candidate',
    'candidate-builtin',
    'later-builtin',
  ])
    expect(read).toContain(text)
})

it.each(['current-builtin', 'candidate-builtin', 'later-builtin'])(
  'names the declaration block that is not readable, and keeps nothing for it: %s',
  async text => {
    const { view, store, rowOf } = scene()
    const missing = rowOf(text)
    const into = new Map<string, string>()
    expect(await fetchNamed(readFrom(store, missing), 'tenant', [view], into)).toBe(missing)
    expect(into.has(missing)).toBe(false)
  },
)

it('counts the blocks a cursor reaches as named while its item is open', async () => {
  const { view, store } = scene()
  const caches = { blobs: new Map(store), parsed: new Map<string, unknown>() }
  const journal = { head: 1, executions: new Map([[view.execution, view]]) } as never
  keepNamed(new ContentRefs(), journal, caches)
  const kept = [...caches.blobs.values()].join('\n')
  for (const text of ['pass/current', 'current-builtin', 'later-builtin', 'candidate-builtin'])
    expect(kept).toContain(text)
})

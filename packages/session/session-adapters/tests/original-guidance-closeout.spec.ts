import { expect, it, vi } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { HistoryEntry, HistoryPage } from '@omne-harness/session-contract'
import { evidence, memoryAccess } from '@omne-harness/session-contract/testing'
import { readGuidanceOriginals, type OriginalHistory } from '../src/cordis/guidance-originals.ts'
import { guidanceBlocks } from '../src/cordis/guidance-window.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

const access = memoryAccess('originals-reader', 'bounded-originals')
const partition = 'tenant/session'
function entry(id: number, kind: string, payload: unknown): HistoryEntry {
  const decoded = readJsonText(JSON.stringify(payload), {
    maxBytes: 100_000_000,
    maxDepth: 100,
    maxItems: 1_000_000,
    maxMembers: 1_000_000,
    maxStringLength: 100_000_000,
    maxNumberLength: 100,
  })
  if (decoded.kind !== 'ok') throw new Error('invalid test JSON')
  return {
    id: String(id) as HistoryEntry['id'],
    revision: '1' as HistoryEntry['revision'],
    kind,
    schema: { owner: 'test', name: 'history', revision: '1', digest: 'history/1' },
    payload: decoded.value,
    origin: { owner: 'test', via: null, source: evidence('entry') },
  }
}
const created = (fork = false) =>
  entry(1, 'session.created', { creation: fork ? { fork: {} } : {} })
const plain = (id: number) =>
  entry(id, 'message.system_reminder', {
    message: {
      id: 'msg_abcdefghijklmnopqrstuv',
      role: 'system_reminder',
      blocks: [
        {
          kind: 'text',
          id: 'ordinary',
          text: 'ordinary fact',
          visibility: { toModel: true, toHuman: true },
        },
      ],
    },
  })
function page(
  entries: readonly HistoryEntry[],
  next: string | null = null,
  from?: string,
): HistoryPage {
  return {
    source: 'history',
    interpreter: { owner: 'test', name: 'history', revision: '1', digest: 'history/1' },
    upper: '1' as HistoryPage['upper'],
    entries,
    scannedThrough: '0',
    next,
    exhausted: next === null,
    annotations: [],
    ...(from === undefined ? {} : { from: from as NonNullable<HistoryPage['from']> }),
  }
}
function reader(pages: readonly HistoryPage[], prefix?: HistoryPage): OriginalHistory<string> {
  let at = 0
  return {
    begin: vi.fn(async input => ({
      ok: input.kinds?.[0] === 'message.compaction' ? (prefix ?? page([])) : pages[0]!,
    })),
    next: vi.fn(async () => ({ ok: pages[++at]! })),
  }
}
const read = (history: OriginalHistory<string>, before?: string) =>
  readGuidanceOriginals(history, access, partition, before)

it('preserves old no-guidance origins and stops before an unreadable later reminder', async () => {
  const h = reader([page([created(), entry(9, 'message.system_reminder', {})], 'unused')])
  expect(await read(h, '9')).toMatchObject({ ok: { scopes: [] } })
  expect(h.next).not.toHaveBeenCalled()
})

it('remembers both original workspace authors without deciding their current qualification', async () => {
  const tenant = tenantCodec.encode(access.tenant)
  if (!tenant.ok) throw new Error('tenant')
  const ref = 'session-scope:original-guidance'
  const scope = (workspace: string) => ({
    state: 'attached' as const,
    workspace,
    instance: workspace,
    root: '/' + workspace,
    sources: [{ path: 'AGENTS.md', digest: 'digest', text: 'same original body' }],
  })
  const author = JSON.stringify([tenant.value, ref])
  const blocks = ['A', 'B'].map(name => guidanceBlocks(scope(name), [], author))
  const reminders = blocks.map((parts, index) =>
    entry(index + 2, 'message.system_reminder', {
      message: { id: 'msg_abcdefghijklmnopqrstuv', role: 'system_reminder', blocks: parts },
      source: { owner: 'runtime-context', record: ref + '/view/1/at/1' },
    }),
  )
  const answer = await read(reader([page([created(), ...reminders])]))
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  expect(answer.ok.scopes.map(scope => scope.workspace)).toEqual(['A', 'B'])
  expect(answer.ok.blocks.size).toBe(4)
})

it('does not accept an original guidance block whose author hash no longer covers its bytes', async () => {
  const parts = guidanceBlocks(
    {
      state: 'attached',
      workspace: 'A',
      instance: 'A',
      root: '/A',
      sources: [{ path: 'AGENTS.md', digest: 'digest', text: 'body' }],
    },
    [],
    partition,
  )
  const forged = parts.map(part => ({ ...part, text: part.text + ' altered' }))
  const original = entry(2, 'message.system_reminder', {
    message: { id: 'msg_abcdefghijklmnopqrstuv', role: 'system_reminder', blocks: forged },
  })
  expect(await read(reader([page([created(), original])]))).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'the original guidance author cannot be verified' },
  })
})

it.each([undefined, 'parent'] as const)(
  'fork origin keeps its inherited-summary boundary (%s)',
  async from => {
    const h = reader(
      [page([created(true)])],
      page(from === undefined ? [] : [entry(2, 'message.compaction', {})], null, from),
    )
    const result = await read(h)
    expect(result).toMatchObject(
      from === undefined
        ? { ok: { scopes: [] } }
        : {
            failure: {
              kind: 'unavailable',
              diagnostic: 'the session cannot verify the original inputs of an inherited summary',
            },
          },
    )
  },
)

it('allows legitimate empty inherited pages and later own creation', async () => {
  const h = reader([page([], 'p1', 'parent'), page([], 'p2', 'parent'), page([created()])])
  expect(await read(h)).toMatchObject({ ok: { scopes: [] } })
  expect(h.next).toHaveBeenCalledTimes(2)
})

it('keeps denied distinct from unavailable and rejects a repeated cursor', async () => {
  const denied: OriginalHistory<string> = {
    begin: async () => ({ failure: { kind: 'denied', action: 'history.begin' } }),
    next: vi.fn(),
  }
  expect(await read(denied)).toEqual({ failure: { kind: 'denied' } })
  expect(await read(reader([page([created()], 'same'), page([], 'same')]))).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'the original guidance history is incomplete' },
  })
})

it('bounds changing cursors even if every filtered page is empty', async () => {
  let calls = 0
  const h: OriginalHistory<string> = {
    begin: async () => ({ ok: page([created()], 'p0') }),
    next: async () => ({ ok: ++calls <= 100_001 ? page([], 'p' + String(calls)) : page([]) }),
  }
  expect(await read(h)).toMatchObject({
    failure: {
      kind: 'unavailable',
      diagnostic: 'the original guidance history exceeds the recovery bound',
    },
  })
  expect(calls).toBeLessThanOrEqual(100_000)
})

it('bounds an exceptional history with more than 100000 original records', async () => {
  const h = reader([
    page([created(), ...Array.from({ length: 100_000 }, (_, index) => plain(index + 2))]),
  ])
  expect(await read(h)).toMatchObject({
    failure: {
      kind: 'unavailable',
      diagnostic: 'the original guidance history exceeds the recovery bound',
    },
  })
})

it('bounds the cursor bytes retained by the legacy scan', async () => {
  const h = reader([page([created()], 'p'.repeat(64 * 1024 * 1024 + 1)), page([])])
  expect(await read(h)).toMatchObject({
    failure: {
      kind: 'unavailable',
      diagnostic: 'the original guidance history exceeds the recovery bound',
    },
  })
  expect(h.next).not.toHaveBeenCalled()
})

it('proves the current fork prefix once even when several original creations name a fork', async () => {
  const h = reader([page([created(true), created(true)])])
  expect(await read(h)).toMatchObject({ ok: { scopes: [] } })
  expect(h.begin).toHaveBeenCalledTimes(2)
})

function forkReader(prefix: readonly HistoryPage[]): OriginalHistory<string> {
  return {
    begin: vi.fn(async input => ({
      ok: input.kinds?.[0] === 'message.compaction' ? prefix[0]! : page([created(true)]),
    })),
    next: vi.fn(async input => {
      const previous = prefix.findIndex(value => value.next === input.cursor)
      return { ok: prefix[previous + 1]! }
    }),
  }
}

it('proves a fork after several empty inherited summary-filter pages reach its own page', async () => {
  const h = forkReader([page([], 'proof1', 'parent'), page([], 'proof2', 'grandparent'), page([])])
  expect(await read(h)).toMatchObject({ ok: { scopes: [] } })
  expect(h.next).toHaveBeenCalledTimes(2)
})

it('rejects the inherited summary found after several empty inherited pages', async () => {
  const h = forkReader([
    page([], 'proof1', 'parent'),
    page([], 'proof2', 'grandparent'),
    page([entry(2, 'message.compaction', {})], null, 'ancestor'),
  ])
  expect(await read(h)).toMatchObject({
    failure: {
      kind: 'unavailable',
      diagnostic: 'the session cannot verify the original inputs of an inherited summary',
    },
  })
  expect(h.next).toHaveBeenCalledTimes(2)
})

it('does not turn a missing inherited cursor into proof that no summary exists', async () => {
  const h = forkReader([{ ...page([], null, 'parent'), exhausted: false }])
  expect(await read(h)).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'the original guidance history is incomplete' },
  })
})

it.each(['denied', 'unavailable'] as const)(
  'preserves %s while following inherited empty pages',
  async kind => {
    const h = forkReader([page([], 'proof1', 'parent')])
    h.next = async () =>
      kind === 'denied'
        ? { failure: { kind: 'denied', action: 'history.next' } }
        : { failure: { kind: 'unavailable', owner: 'test-history', diagnostic: 'source lost' } }
    expect(await read(h)).toMatchObject({ failure: { kind } })
  },
)

it('charges inherited empty pages to the same finite scan budget', async () => {
  let calls = 0
  const h = forkReader([page([], 'proof0', 'parent')])
  h.next = async () => ({
    ok: ++calls <= 100_001 ? page([], 'proof' + String(calls), 'parent') : page([]),
  })
  expect(await read(h)).toMatchObject({
    failure: {
      kind: 'unavailable',
      diagnostic: 'the original guidance history exceeds the recovery bound',
    },
  })
  expect(calls).toBeLessThan(100_000)
})

it(
  'real SQLite outward history preserves an empty inherited filtered page and can prove a no-summary fork',
  { tags: ['slow'] },
  async () => {
    const s = await sqlScene('originals-fork-filter', { storage: 'real', forked: true })
    try {
      const first = await s.port.history.begin({
        ...s.access,
        kinds: ['message.compaction'],
        inherited: true,
        from: null,
        direction: 'forward',
        pageBytes: 1,
      })
      if ('failure' in first) throw new Error(JSON.stringify(first.failure))
      expect(first.ok.from).toBeDefined()
      expect(first.ok.entries).toEqual([])
      expect(first.ok.exhausted).toBe(false)
      expect(first.ok.next).not.toBeNull()
      if (first.ok.next === null) throw new Error('missing real inherited cursor')
      const own = await s.port.history.next({ ...s.access, cursor: first.ok.next })
      expect(own).toMatchObject({ ok: { entries: [], exhausted: true } })
      if ('failure' in own) throw new Error(JSON.stringify(own.failure))
      expect(own.ok.from).toBeUndefined()
      expect(await readGuidanceOriginals(s.port.history, s.access, partition)).toMatchObject({
        ok: { scopes: [] },
      })
    } finally {
      await s.close()
    }
  },
)

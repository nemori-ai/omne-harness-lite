import { expect, test, vi } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  checkAppendInput,
  checkSourceToken,
  messageLogPayload,
  compareInteger,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import {
  materializeMessages,
  projectMessages,
  type ProjectionRules,
} from '@omne-harness-lite/model-message-projection'
import { createSessionMessageProjections } from '../src/message-projection.ts'
import type { BorrowedRunJournal } from '../src/run-journal-types.ts'

const rules: ProjectionRules = {
  version: 'history-1',
  external: null,
  system: [],
  pendingCardBlocks: [],
  lastModelRequestPrefixLength: 0,
}
const policy = { maxSessions: 2, limits: { entries: 100, blocks: 100, bytes: 100000 } }
function fixture(session = 'session') {
  const parsed = checkSourceToken({
    tenant: { organization: 'org', account: 'account' },
    session,
    journalGeneration: 'generation',
    tail: 0,
  })
  if ('failure' in parsed) throw new Error('invalid fixture')
  const scope = { tenant: parsed.ok.tenant, session: parsed.ok.session }
  let source = parsed.ok,
    available = true
  const entries: LogEntry[] = []
  const readProjection = vi.fn<BorrowedRunJournal['readProjection']>(async previous => {
    if (!available) return { failure: 'unavailable' }
    const suffix =
      previous &&
      previous.journalGeneration === source.journalGeneration &&
      compareInteger(previous.tail, source.tail) <= 0
    return {
      kind: suffix ? 'suffix' : 'prefix',
      source,
      entries: suffix
        ? entries.filter(e => compareInteger(e.position, previous.tail) > 0)
        : [...entries],
    }
  })
  function append(text: string) {
    const position = entries.length + 1
    const message = judgeMessage({
      id: `message-${position}`,
      type: 'user',
      createdAt: '2026-10-10T00:00:00Z',
      blocks: [
        {
          kind: 'text',
          id: `block-${position}`,
          text,
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if ('rejected' in message) throw new Error('invalid message')
    const input = checkAppendInput(
      scope.session,
      [{ tenant: scope.tenant, readKeys: [], payload: messageLogPayload(message.ok) }],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in input || !input.ok.entries[0]) throw new Error('invalid fixture message')
    entries.push({ ...input.ok.entries[0], session: scope.session, position })
    source = { ...source, tail: position }
  }
  return {
    scope,
    readProjection,
    append,
    entries,
    source: () => source,
    deny: () => {
      available = false
    },
    replace: () => {
      source = { ...source, journalGeneration: 'replacement' }
    },
  }
}
function messages(
  result: Awaited<ReturnType<ReturnType<typeof createSessionMessageProjections>['read']>>,
) {
  if (!('projected' in result)) throw new Error(JSON.stringify(result))
  return materializeMessages(result.projected)
}

test('different Run borrows reuse the same Session prefix and process only appended entries', async () => {
  const f = fixture(),
    cache = createSessionMessageProjections(policy),
    identity = {}
  const input = { rules, cache: { identity } }
  f.append('first')
  const first = await cache.read({ scope: f.scope, readProjection: f.readProjection }, input)
  expect(f.readProjection.mock.calls.map(c => c[0]?.tail ?? null)).toEqual([null])
  f.append('second')
  const second = await cache.read(
    { scope: f.scope, readProjection: f.readProjection.bind(null) },
    input,
  )
  expect(f.readProjection.mock.calls.map(c => c[0]?.tail ?? null)).toEqual([null, 1])
  expect(messages(second)).toEqual(
    messages(projectMessages({ source: f.source(), entries: f.entries, rules })),
  )
  if (!('projected' in first) || !('projected' in second)) throw new Error('missing projections')
  expect(second.projected.segments?.previous).toBe(first.projected.segments)
  expect(first.projected.source.tail).toBe(1)
  expect(messages(await cache.read(f, input))).toEqual(messages(second))
  expect(f.readProjection.mock.calls.at(-1)?.[0]?.tail).toBe(2)
  f.deny()
  expect(await cache.read(f, input)).toEqual({ failure: 'unavailable' })
  await cache.close()
  expect(await cache.read(f, input)).toEqual({ failure: 'unavailable' })
})

test('changed codec policy and generation rebuild instead of serving a stale prefix', async () => {
  const f = fixture(),
    cache = createSessionMessageProjections(policy)
  f.append('first')
  await cache.read(f, { rules, cache: { identity: {} } })
  const identity = {}
  await cache.read(f, { rules, cache: { identity } })
  expect(f.readProjection.mock.calls.at(-1)?.[0]).toBeNull()
  f.replace()
  expect(messages(await cache.read(f, { rules, cache: { identity } }))).toEqual(
    messages(projectMessages({ source: f.source(), entries: f.entries, rules })),
  )
  await cache.close()
})

test('capacity falls back to complete cold output and idle Session entries are evicted', async () => {
  const cache = createSessionMessageProjections({ ...policy, maxSessions: 1 }),
    input = { rules, cache: { identity: {} } }
  const a = fixture('a'),
    b = fixture('b')
  a.append('a')
  b.append('b')
  await cache.read(a, input)
  await cache.read(b, input)
  await cache.read(a, input)
  expect(a.readProjection.mock.calls.map(c => c[0])).toEqual([null, null])
  await cache.close()
  const limited = createSessionMessageProjections({
    ...policy,
    limits: { ...policy.limits, bytes: 1 },
  })
  expect(messages(await limited.read(a, input))).toEqual(
    messages(projectMessages({ source: a.source(), entries: a.entries, rules })),
  )
  await limited.close()
})

test('close waits for an admitted read and rejects later reads', async () => {
  const f = fixture(),
    cache = createSessionMessageProjections(policy),
    input = { rules, cache: { identity: {} } }
  f.append('first')
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const read = cache.read(
    {
      scope: f.scope,
      readProjection: async previous => {
        await gate
        return f.readProjection(previous)
      },
    },
    input,
  )
  let closed = false
  const closing = cache.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  expect(await cache.read(f, input)).toEqual({ failure: 'unavailable' })
  release()
  expect(messages(await read)).toEqual(
    messages(projectMessages({ source: f.source(), entries: f.entries, rules })),
  )
  await closing
  expect(closed).toBe(true)
})

test('a foreign source fails before publication and cannot poison the next read', async () => {
  const f = fixture('a'),
    foreign = fixture('b'),
    cache = createSessionMessageProjections(policy),
    input = { rules, cache: { identity: {} } }
  f.append('own')
  foreign.append('foreign')
  await expect(
    cache.read({ scope: f.scope, readProjection: foreign.readProjection }, input),
  ).rejects.toThrow('foreign projection')
  expect(messages(await cache.read(f, input))).toEqual(
    messages(projectMessages({ source: f.source(), entries: f.entries, rules })),
  )
  expect(f.readProjection.mock.calls[0]?.[0]).toBeNull()
  await cache.close()
})

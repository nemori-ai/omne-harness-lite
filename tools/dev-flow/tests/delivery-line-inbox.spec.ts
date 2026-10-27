import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commentDigest, encodeRecordComment } from '../src/delivery/collaboration-comments.ts'
import type {
  LineConsumptionRecord,
  LineDeltaRecord,
} from '../src/delivery/collaboration-records.ts'
import { lineInbox } from '../src/delivery/line-inbox.ts'
import { publishLineDelta } from '../src/delivery/line-delta.ts'
import { publishLineState } from '../src/delivery/line-state.ts'
import { executeLineCommand } from '../src/delivery/line-inbox-cli.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { backend, policy, rawComment, taskBinding } from './fixtures/collaboration-authority.ts'
import { context, delta, NEXT_UUID, TIME, UUID } from './fixtures/collaboration.ts'

const roots: string[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(TIME))
})
afterEach(() => {
  vi.useRealTimers()
  roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }))
})
function fixture() {
  const journalRoot = realpathSync(mkdtempSync(join(tmpdir(), 'line-journal-')))
  roots.push(journalRoot)
  const source = backend()
  const comments: ReturnType<typeof rawComment>[] = []
  let actor = 'owner',
    posts = 0,
    drop = false,
    lose = false,
    incomplete = false
  const make = (record: LineDeltaRecord | LineConsumptionRecord, id: number, author = 'owner') => ({
    ...rawComment(id, encodeRecordComment(record), TIME, author),
    issue_url: 'https://api.github.com/repos/owner/repo/issues/10',
    html_url: `https://github.com/owner/repo/issues/10#issuecomment-${id}`,
  })
  const call: GhCommand = (args, timeout) => {
    const path = args.find(arg => arg.startsWith('repos/')) ?? args.at(-1)
    if (path === 'user') return { login: actor, type: 'User' }
    if (args[2] === 'POST') {
      posts++
      const body = args.at(-1)?.slice(5) ?? ''
      if (!drop)
        comments.push({
          ...rawComment(1000 + posts, body, TIME, actor),
          issue_url: 'https://api.github.com/repos/owner/repo/issues/10',
          html_url: `https://github.com/owner/repo/issues/10#issuecomment-${1000 + posts}`,
        })
      if (lose) throw new Error('lost response')
      return { id: 1000 + posts }
    }
    if (path === 'repos/owner/repo/issues/10')
      return {
        number: 10,
        html_url: 'https://github.com/owner/repo/issues/10',
        body: '',
        state: 'open',
        comments: comments.length + (incomplete ? 1 : 0),
        updated_at: TIME,
        milestone: { number: 1 },
      }
    const page = /issues\/10\/comments\?per_page=100&page=(\d+)/.exec(path ?? '')
    if (page !== null) return comments.slice((Number(page[1]) - 1) * 100, Number(page[1]) * 100)
    return source.read(args, timeout)
  }
  const record = delta()
  record.writer.authorization = taskBinding().dispatch
  const common = { call, journalRoot, authority: () => ({ policy }) }
  return {
    record,
    comments,
    common,
    make,
    source,
    inbox: (since?: number) =>
      lineInbox({
        repo: context.repo,
        milestone: 1,
        parent: 10,
        ...(since === undefined ? {} : { since }),
        read: call,
        authority: common.authority,
      }),
    publish: (value = record) => publishLineDelta({ ...common, record: value }),
    posts: () => posts,
    actor: (value: string) => {
      actor = value
    },
    lost: (absent = false) => {
      lose = true
      drop = absent
    },
    incomplete: () => {
      incomplete = true
    },
  }
}
function consumption(record: LineDeltaRecord, id: number): LineConsumptionRecord {
  return {
    schemaVersion: 1,
    kind: 'consumption',
    context: record.context,
    lineParent: 10,
    operationId: NEXT_UUID,
    revision: 1,
    previousRecordId: null,
    writer: 'line-owner',
    consumedDelta: { issue: 10, commentId: id, sha256: commentDigest(encodeRecordComment(record)) },
    consumedRevision: record.revision,
    recordedAt: TIME,
  }
}

describe('line inbox and durable delta/state commands', () => {
  it('reads all pages, selects by marker, orders revisions and deduplicates retry aliases', () => {
    const f = fixture()
    f.comments.push(
      ...Array.from({ length: 103 }, (_, i) => ({
        ...f.make(f.record, i + 1),
        body: 'ordinary human comment',
      })),
    )
    const second = { ...f.record, operationId: NEXT_UUID, revision: 2, previousRecordId: 200 }
    f.comments.push(f.make(second, 202), f.make(f.record, 201), f.make(f.record, 200))
    expect(f.inbox().deltas.map(item => item.id)).toEqual([200, 202])
    expect(f.inbox(201).deltas.map(item => item.record.revision)).toEqual([2])
    expect(f.posts()).toBe(0)
  })
  it('keeps marker selection separate from authority validation', () => {
    const f = fixture()
    f.comments.push(f.make(f.record, 20, 'stranger'))
    expect(() => f.inbox()).toThrow('writer-untrusted')
  })
  it('rejects incomplete pagination and an event/non-delta cursor', () => {
    const f = fixture()
    expect(() => f.inbox(20)).toThrow('cursor-not-comment')
    f.incomplete()
    expect(() => f.inbox()).toThrow('comments-incomplete')
  })
  it.each(['gap', 'fork', 'predecessor'])(
    'refuses the entire %s stream, including records before since',
    kind => {
      const f = fixture()
      f.comments.push(f.make(f.record, 20))
      f.comments.push(
        f.make(
          {
            ...f.record,
            operationId: NEXT_UUID,
            revision: kind === 'gap' ? 3 : kind === 'fork' ? 1 : 2,
            previousRecordId: kind === 'fork' ? null : kind === 'predecessor' ? 19 : 20,
          },
          21,
        ),
      )
      expect(() => f.inbox(20)).toThrow(
        kind === 'gap'
          ? 'revision-gap'
          : kind === 'fork'
            ? 'revision-conflict'
            : 'predecessor-mismatch',
      )
    },
  )
  it('publishes exactly the next revision and recovers a response loss without another POST', () => {
    const f = fixture()
    f.lost()
    expect(f.publish().kind).toBe('confirmed')
    expect(f.publish().kind).toBe('confirmed')
    expect(f.posts()).toBe(1)
    const second = { ...f.record, operationId: NEXT_UUID, revision: 2, previousRecordId: 1001 }
    expect(f.publish(second).kind).toBe('confirmed')
    expect(f.inbox().deltas.map(item => item.record.revision)).toEqual([1, 2])
  })
  it('never reposts an absent unknown write and rejects changed intent under the same ID', () => {
    const f = fixture()
    f.lost(true)
    expect(f.publish().kind).toBe('unknown')
    expect(f.publish().kind).toBe('unknown')
    expect(f.posts()).toBe(1)
    expect(() => f.publish({ ...f.record, rolePolicyVersion: 'different' })).toThrow(
      'intent-conflict',
    )
  })
  it('refuses a stale revision and unauthorized writes before POST', () => {
    const f = fixture()
    f.actor('stranger')
    expect(() => f.publish()).toThrow('writer-untrusted')
    expect(f.posts()).toBe(0)
    f.actor('owner')
    f.comments.push(f.make({ ...f.record, operationId: NEXT_UUID }, 20))
    expect(() => f.publish()).toThrow('revision-conflict')
    expect(f.posts()).toBe(0)
  })
  it('writes line-state with a trusted exact delta reference, and inbox then excludes it', () => {
    const f = fixture()
    f.comments.push(f.make(f.record, 20))
    const record = consumption(f.record, 20)
    f.actor('line-owner')
    expect(publishLineState({ ...f.common, record }).kind).toBe('confirmed')
    expect(publishLineState({ ...f.common, record }).kind).toBe('confirmed')
    expect(f.inbox().deltas).toEqual([])
    expect(f.posts()).toBe(1)
    expect(f.comments.at(-1)?.body.startsWith('<!-- line-state -->')).toBe(true)
  })
  it('records idle consumption without a task and can recover an older operation after later consumption', () => {
    const f = fixture()
    const idle: LineDeltaRecord = {
      ...f.record,
      continuation: {
        kind: 'idle',
        next: { ...context, wave: 2, reduceIssue: 200 },
        reason: 'No task this wave',
      },
    }
    const second: LineDeltaRecord = {
      ...idle,
      operationId: NEXT_UUID,
      revision: 2,
      previousRecordId: 20,
    }
    f.comments.push(f.make(idle, 20), f.make(second, 21))
    f.actor('line-owner')
    const firstState = {
      ...consumption(idle, 20),
      operationId: '33333333-3333-4333-8333-333333333333',
    }
    expect(publishLineState({ ...f.common, record: firstState }).kind).toBe('confirmed')
    const nextState = {
      ...consumption(second, 21),
      operationId: '44444444-4444-4444-8444-444444444444',
      revision: 2,
      previousRecordId: 1001,
    }
    expect(publishLineState({ ...f.common, record: nextState }).kind).toBe('confirmed')
    expect(publishLineState({ ...f.common, record: firstState }).kind).toBe('confirmed')
    expect(f.posts()).toBe(2)
    expect(f.inbox()).toMatchObject({ consumedRevision: 2, deltas: [] })
  })
  it('does not treat a wrong digest or a rewind as consumption', () => {
    const f = fixture()
    const second = { ...f.record, operationId: NEXT_UUID, revision: 2, previousRecordId: 20 }
    f.comments.push(f.make(f.record, 20), f.make(second, 21))
    const bad = consumption(second, 21)
    bad.consumedDelta.sha256 = 'f'.repeat(64)
    expect(() => publishLineState({ ...f.common, record: bad })).toThrow('consumed-delta-mismatch')
    const state = consumption(second, 21)
    f.comments.push(f.make(state, 30, 'line-owner'))
    expect(() =>
      publishLineState({
        ...f.common,
        record: {
          ...consumption(f.record, 20),
          operationId: UUID,
          revision: 2,
          previousRecordId: 30,
        },
      }),
    ).toThrow('consumption-rewind')
    expect(f.posts()).toBe(0)
  })
  it('reports a concurrent writer conflict after POST and never retries that side effect', () => {
    const f = fixture()
    const call: GhCommand = (args, timeout) => {
      const result = f.common.call(args, timeout)
      if (args[2] === 'POST') f.comments.push(f.make({ ...f.record, operationId: NEXT_UUID }, 999))
      return result
    }
    const input = { ...f.common, record: f.record, call }
    expect(() => publishLineDelta(input)).toThrow('revision-conflict')
    expect(() => publishLineDelta(input)).toThrow('revision-conflict')
    expect(f.posts()).toBe(1)
  })
  it('rejects unknown schemas and foreign repo records instead of returning a partial inbox', () => {
    const f = fixture()
    f.comments.push({
      ...f.make(f.record, 20),
      body: encodeRecordComment(f.record).replace('"schemaVersion":1', '"schemaVersion":99'),
    })
    expect(() => f.inbox()).toThrow('schemaVersion')
    f.comments.splice(0, 1, {
      ...f.make(f.record, 20),
      body: encodeRecordComment(f.record).replaceAll('owner/repo', 'foreign/repo'),
    })
    expect(() => f.inbox()).toThrow('context-mismatch')
  })
  it('accepts an ordinary parent comment as a query filter without advancing consumption', () => {
    const f = fixture()
    const second = { ...f.record, operationId: NEXT_UUID, revision: 2, previousRecordId: 20 }
    f.comments.push(
      f.make(f.record, 20),
      { ...f.make(f.record, 21), body: 'ordinary comment' },
      f.make(second, 22),
    )
    expect(f.inbox(21)).toMatchObject({ consumedRevision: 0, deltas: [{ id: 22 }] })
    expect(f.inbox().deltas.map(item => item.id)).toEqual([20, 22])
    expect(f.posts()).toBe(0)
  })
  it('routes canonical writes through the command adapter and refuses repo or parent disagreement', () => {
    const f = fixture()
    const command = {
      kind: 'delta' as const,
      repo: context.repo,
      parent: 10,
      record: f.record,
      journalRoot: f.common.journalRoot,
    }
    expect(executeLineCommand(command, f.common)).toMatchObject({
      operation: 'delta',
      status: 'confirmed',
      operationId: UUID,
    })
    expect(() => executeLineCommand({ ...command, parent: 11 }, f.common)).toThrow(
      'context-mismatch',
    )
    expect(
      executeLineCommand({ kind: 'inbox', repo: context.repo, parent: 10, milestone: 1 }, f.common),
    ).toMatchObject({ status: 'read', consumedRevision: 0 })
  })
})

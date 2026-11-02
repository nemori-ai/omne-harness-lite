import { spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  commentMarker,
  matchedMember,
  matchEvent,
  normalizeGithubEvent,
  parseEventLine,
  repositoryFromRemote,
  type EventRecord,
} from '../src/delivery/events.ts'
import { forwardArgv, githubReconcile, type Reconcile } from '../src/delivery/events-gh.ts'
import { createReceiverServer, serveReceiver } from '../src/delivery/events-receiver.ts'
import { waitForEvent, WaitTimeout } from '../src/delivery/events-wait.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { InputError } from '../src/delivery/protocol.ts'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))
function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'delivery-events-')))
  dirs.push(dir)
  return dir
}
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const REPO_URL = 'https://github.com/owner/repo'
const issuePayload = (action: string, number: number, state = 'open') => ({
  action,
  issue: { number, state, html_url: `${REPO_URL}/issues/${number}` },
})
const HEAD_A = 'a'.repeat(40),
  HEAD_B = 'b'.repeat(40)
const pullPayload = (action: string, draft: boolean, base: string, head = HEAD_A, number = 41) => ({
  action,
  number,
  pull_request: {
    number,
    state: 'open',
    draft,
    base: { ref: base },
    head: { sha: head.toUpperCase() },
    html_url: `${REPO_URL}/pull/41`,
  },
})
const commentPayload = (number: number, body: string) => ({
  action: 'created',
  issue: { number, state: 'open', html_url: `${REPO_URL}/issues/${number}` },
  comment: { body, html_url: `${REPO_URL}/issues/${number}#issuecomment-9` },
})
const T0 = '2026-10-26T18:00:00.000Z'
function record(event: string, payload: unknown, delivery: string, at = T0): EventRecord {
  return normalizeGithubEvent(
    { 'x-github-event': event, 'x-github-delivery': delivery },
    payload,
    at,
  )
}
const line = (value: EventRecord) => `${JSON.stringify(value)}\n`

describe('normalizeGithubEvent', () => {
  it('reads an issues delivery', () => {
    expect(record('issues', issuePayload('closed', 812, 'closed'), 'd-1')).toEqual({
      delivery: 'd-1',
      event: 'issues',
      action: 'closed',
      number: 812,
      state: 'closed',
      draft: null,
      base: null,
      head: null,
      marker: null,
      html_url: `${REPO_URL}/issues/812`,
      receivedAt: T0,
    })
  })

  it('reads the draft flag and base branch of a pull request delivery', () => {
    expect(record('pull_request', pullPayload('opened', false, 'main'), 'd-2')).toMatchObject({
      event: 'pull_request',
      action: 'opened',
      number: 41,
      state: 'open',
      draft: false,
      base: 'main',
      head: HEAD_A,
      html_url: `${REPO_URL}/pull/41`,
    })
  })

  it('reads the issue number and the marker of a comment delivery', () => {
    expect(
      record('issue_comment', commentPayload(7, '<!-- line-delta -->\n## line-delta 2'), 'd-3'),
    ).toMatchObject({
      event: 'issue_comment',
      number: 7,
      marker: 'line-delta',
      html_url: `${REPO_URL}/issues/7#issuecomment-9`,
    })
  })

  it('accepts header names in any case and a ping without an issue', () => {
    expect(
      normalizeGithubEvent(
        { 'X-GitHub-Event': 'ping', 'X-GitHub-Delivery': 'd-0' },
        { zen: 'x' },
        T0,
      ),
    ).toMatchObject({ event: 'ping', action: null, number: null, delivery: 'd-0' })
  })

  it('refuses a delivery without the event header or with a payload that is not an object', () => {
    expect(() => normalizeGithubEvent({}, {})).toThrow(InputError)
    expect(() => normalizeGithubEvent({ 'x-github-event': 'issues' }, [])).toThrow(InputError)
  })
})

describe('commentMarker', () => {
  it('reads the name in the comment on the first line only', () => {
    expect(commentMarker('<!-- line-delta -->')).toBe('line-delta')
    expect(commentMarker('<!-- line-delta 3 -->\nbody')).toBe('line-delta')
    expect(commentMarker('<!--line-delta-->')).toBe('line-delta')
    expect(commentMarker('text\n<!-- line-delta -->')).toBeNull()
    expect(commentMarker('plain')).toBeNull()
  })
})

describe('matchEvent', () => {
  it('matches the close of the named issue only', () => {
    const closed = record('issues', issuePayload('closed', 5, 'closed'), 'a')
    expect(matchEvent(closed, { kind: 'issue-closed', issue: 5 })).toBe(true)
    expect(matchEvent(closed, { kind: 'issue-closed', issue: 6 })).toBe(false)
    expect(
      matchEvent(record('issues', issuePayload('labeled', 5), 'b'), {
        kind: 'issue-closed',
        issue: 5,
      }),
    ).toBe(false)
    expect(
      matchEvent(record('issues', issuePayload('reopened', 5), 'c'), {
        kind: 'issue-closed',
        issue: 5,
      }),
    ).toBe(false)
  })

  it('matches a ready pull request on the base branch, not a draft', () => {
    const predicate = { kind: 'pr-ready', base: 'main' } as const
    expect(
      matchEvent(
        record('pull_request', pullPayload('ready_for_review', false, 'main'), 'a'),
        predicate,
      ),
    ).toBe(true)
    expect(
      matchEvent(record('pull_request', pullPayload('opened', false, 'main'), 'b'), predicate),
    ).toBe(true)
    expect(
      matchEvent(record('pull_request', pullPayload('opened', true, 'main'), 'c'), predicate),
    ).toBe(false)
    expect(
      matchEvent(
        record('pull_request', pullPayload('ready_for_review', false, 'dev'), 'd'),
        predicate,
      ),
    ).toBe(false)
    expect(
      matchEvent(record('pull_request', pullPayload('synchronize', true, 'main'), 'e'), predicate),
    ).toBe(false)
    expect(
      matchEvent(record('pull_request', pullPayload('closed', false, 'main'), 'f'), predicate),
    ).toBe(false)
  })

  it('counts a new head of a ready pull request, unless the number and head are ignored', () => {
    const pushed = record('pull_request', pullPayload('synchronize', false, 'main', HEAD_B), 'a')
    const ignoring = (...ignore: { number: number; head: string }[]) =>
      ({ kind: 'pr-ready', base: 'main', ignore }) as const
    expect(matchEvent(pushed, { kind: 'pr-ready', base: 'main' })).toBe(true)
    expect(matchEvent(pushed, ignoring({ number: 41, head: HEAD_A }))).toBe(true)
    expect(matchEvent(pushed, ignoring({ number: 41, head: HEAD_B }))).toBe(false)
    expect(matchEvent(pushed, ignoring({ number: 41, head: HEAD_B.toUpperCase() }))).toBe(false)
    expect(matchEvent(pushed, ignoring({ number: 42, head: HEAD_B }))).toBe(true)
    const ready = record('pull_request', pullPayload('ready_for_review', false, 'main'), 'b')
    expect(matchEvent(ready, ignoring({ number: 41, head: HEAD_A }))).toBe(false)
  })

  it('matches an any predicate through its first satisfied member', () => {
    const predicate = {
      kind: 'any',
      of: [
        { kind: 'issue-closed', issue: 5 },
        { kind: 'comment', issue: 7, marker: 'line-return' },
      ],
    } as const
    expect(
      matchedMember(record('issues', issuePayload('closed', 5, 'closed'), 'a'), predicate),
    ).toMatchObject({ kind: 'issue-closed' })
    expect(
      matchedMember(
        record('issue_comment', commentPayload(7, '<!-- line-return -->'), 'b'),
        predicate,
      ),
    ).toMatchObject({ kind: 'comment' })
    expect(
      matchEvent(record('issue_comment', commentPayload(7, '<!-- line-delta -->'), 'c'), predicate),
    ).toBe(false)
    expect(matchEvent(record('issues', issuePayload('closed', 6, 'closed'), 'd'), predicate)).toBe(
      false,
    )
  })

  it('matches a new comment with the marker on the named issue only', () => {
    const predicate = { kind: 'comment', issue: 7, marker: 'line-delta' } as const
    const delta = record('issue_comment', commentPayload(7, '<!-- line-delta -->'), 'a')
    expect(matchEvent(delta, predicate)).toBe(true)
    expect(
      matchEvent(record('issue_comment', commentPayload(8, '<!-- line-delta -->'), 'b'), predicate),
    ).toBe(false)
    expect(
      matchEvent(record('issue_comment', commentPayload(7, '<!-- line-state -->'), 'c'), predicate),
    ).toBe(false)
    expect(
      matchEvent(record('issue_comment', commentPayload(7, 'no marker'), 'd'), predicate),
    ).toBe(false)
    expect(matchEvent({ ...delta, action: 'edited' }, predicate)).toBe(false)
  })
})

describe('parseEventLine', () => {
  it('reads back what the receiver writes and skips lines that are not events', () => {
    const value = record('pull_request', pullPayload('opened', false, 'main'), 'x')
    expect(parseEventLine(JSON.stringify(value))).toEqual(value)
    expect(parseEventLine('{"half":')).toBeUndefined()
    expect(parseEventLine('{"event":"issues"}')).toBeUndefined()
  })
})

describe('repositoryFromRemote', () => {
  it('reads owner and name from the GitHub remote forms', () => {
    for (const url of [
      'https://github.com/owner/repo.git\n',
      'https://github.com/owner/repo',
      'git@github.com:owner/repo.git',
      'ssh://git@github.com/owner/repo.git',
    ])
      expect(repositoryFromRemote(url)).toBe('owner/repo')
    expect(repositoryFromRemote('https://example.com/owner/repo.git')).toBeUndefined()
  })
})

describe('waitForEvent', () => {
  const closed = (delivery: string, at = T0, issue = 5) =>
    record('issues', issuePayload('closed', issue, 'closed'), delivery, at)
  const predicate = { kind: 'issue-closed', issue: 5 } as const

  it('returns a matching line that is already in the file, without a GitHub read', async () => {
    const file = join(tempDir(), 'events.jsonl')
    writeFileSync(file, line(record('issues', issuePayload('labeled', 5), 'a')) + line(closed('b')))
    const reconcile = vi.fn<Reconcile>()
    const result = await waitForEvent({ file, predicate, reconcile, timeoutMs: 2000 })
    expect(result).toMatchObject({ delivery: 'b', source: 'event' })
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('reads the lines that exist, then waits for an appended line, and reads GitHub once', async () => {
    const file = join(tempDir(), 'events.jsonl')
    writeFileSync(file, line(record('issues', issuePayload('labeled', 5), 'a')))
    const reconcile = vi.fn<Reconcile>(() => undefined)
    const pending = waitForEvent({ file, predicate, reconcile, timeoutMs: 5000 })
    await sleep(100)
    appendFileSync(file, line(closed('other', T0, 9)))
    await sleep(50)
    appendFileSync(file, line(closed('b')))
    expect(await pending).toMatchObject({ delivery: 'b', source: 'event' })
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it('waits for a file that does not exist yet, in a directory that does not exist yet', async () => {
    const file = join(tempDir(), 'later', 'events.jsonl')
    const pending = waitForEvent({ file, predicate, timeoutMs: 5000 })
    await sleep(100)
    writeFileSync(file, line(closed('b')))
    expect(await pending).toMatchObject({ delivery: 'b' })
  })

  it('parses a line only after its newline has arrived', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const text = line(closed('b'))
    writeFileSync(file, text.slice(0, 40))
    const pending = waitForEvent({ file, predicate, timeoutMs: 5000 })
    await sleep(100)
    appendFileSync(file, text.slice(40))
    expect(await pending).toMatchObject({ delivery: 'b' })
  })

  it('rejects with WaitTimeout when nothing matches before the timeout', async () => {
    const file = join(tempDir(), 'events.jsonl')
    writeFileSync(file, line(closed('b', T0, 6)))
    await expect(waitForEvent({ file, predicate, timeoutMs: 150 })).rejects.toBeInstanceOf(
      WaitTimeout,
    )
  })

  it('returns at once with source reconcile when the start-up read finds the state', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const reconcile = vi.fn<Reconcile>((_predicate, _since) =>
      record('issues', issuePayload('closed', 5, 'closed'), 'x'),
    )
    const result = await waitForEvent({
      file,
      predicate,
      since: '2026-10-26T17:00:00Z',
      reconcile,
      timeoutMs: 2000,
    })
    expect(result).toMatchObject({ source: 'reconcile', number: 5, action: 'closed' })
    expect(reconcile).toHaveBeenCalledWith(predicate, '2026-10-26T17:00:00.000Z', new Set())
  })

  it('fails when the start-up read fails instead of waiting on', async () => {
    const file = join(tempDir(), 'events.jsonl')
    await expect(
      waitForEvent({
        file,
        predicate,
        reconcile: () => {
          throw new Error('gh failed')
        },
        timeoutMs: 2000,
      }),
    ).rejects.toThrow('gh failed')
  })

  it('counts only events after an ISO since time', async () => {
    const file = join(tempDir(), 'events.jsonl')
    writeFileSync(file, line(closed('old', '2026-10-26T10:00:00.000Z')))
    await expect(
      waitForEvent({ file, predicate, since: '2026-10-26T12:00:00Z', timeoutMs: 150 }),
    ).rejects.toBeInstanceOf(WaitTimeout)
    appendFileSync(file, line(closed('new', '2026-10-26T13:00:00.000Z')))
    expect(
      await waitForEvent({ file, predicate, since: '2026-10-26T12:00:00Z', timeoutMs: 2000 }),
    ).toMatchObject({ delivery: 'new' })
  })

  it('counts an event received at the ISO since time itself', async () => {
    const file = join(tempDir(), 'events.jsonl')
    writeFileSync(file, line(closed('edge', '2026-10-26T12:00:00.000Z')))
    expect(
      await waitForEvent({ file, predicate, since: '2026-10-26T12:00:00Z', timeoutMs: 2000 }),
    ).toMatchObject({ delivery: 'edge' })
  })

  it('counts only lines after the since delivery id and refuses an unknown id', async () => {
    const file = join(tempDir(), 'events.jsonl')
    writeFileSync(
      file,
      line(closed('first')) +
        line(record('issues', issuePayload('labeled', 5), 'mark')) +
        line(closed('after')),
    )
    expect(await waitForEvent({ file, predicate, since: 'mark', timeoutMs: 2000 })).toMatchObject({
      delivery: 'after',
    })
    await expect(
      waitForEvent({ file, predicate, since: 'missing', timeoutMs: 2000 }),
    ).rejects.toBeInstanceOf(InputError)
  })

  it('counts a delivery once, so a redelivery after since does not match', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const mark = record('issues', issuePayload('labeled', 5), 'mark')
    writeFileSync(file, line(closed('dup')) + line(mark) + line(closed('dup')))
    await expect(
      waitForEvent({ file, predicate, since: 'mark', timeoutMs: 150 }),
    ).rejects.toBeInstanceOf(WaitTimeout)
  })

  it('does not deduplicate lines without a delivery id', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const anonymous = { ...closed('x'), delivery: null }
    const mark = record('issues', issuePayload('labeled', 5), 'mark')
    writeFileSync(file, line(anonymous) + line(mark) + line(anonymous))
    expect(await waitForEvent({ file, predicate, since: 'mark', timeoutMs: 2000 })).toMatchObject({
      delivery: null,
      number: 5,
      source: 'event',
    })
  })

  it('fails on a stat error other than a missing file', async () => {
    const dir = tempDir()
    const file = join(dir, 'events.jsonl')
    symlinkSync(file, file)
    await expect(waitForEvent({ file, predicate, timeoutMs: 2000 })).rejects.toMatchObject({
      code: 'ELOOP',
    })
  })

  it('reads a replaced event file from its start', async () => {
    const dir = tempDir()
    const file = join(dir, 'events.jsonl')
    const labeled = line(record('issues', issuePayload('labeled', 5), 'a'))
    writeFileSync(file, labeled)
    const pending = waitForEvent({ file, predicate, timeoutMs: 5000 })
    await sleep(100)
    const next = join(dir, 'next.tmp')
    writeFileSync(next, line(closed('b')) + labeled)
    renameSync(next, file)
    expect(await pending).toMatchObject({ delivery: 'b', source: 'event' })
  })

  describe('with an any predicate', () => {
    const anyPredicate = {
      kind: 'any',
      of: [
        { kind: 'issue-closed', issue: 5 },
        { kind: 'comment', issue: 7, marker: 'line-return' },
      ],
    } as const
    const returned = (delivery: string) =>
      record('issue_comment', commentPayload(7, '<!-- line-return -->'), delivery)

    it('returns the line of whichever member comes first and names it', async () => {
      const file = join(tempDir(), 'events.jsonl')
      const pending = waitForEvent({ file, predicate: anyPredicate, timeoutMs: 5000 })
      await sleep(100)
      appendFileSync(file, line(returned('r')))
      expect(await pending).toMatchObject({ delivery: 'r', source: 'event', matched: 'comment' })
      const closedFile = join(tempDir(), 'events.jsonl')
      writeFileSync(closedFile, line(closed('c')))
      expect(await waitForEvent({ file: closedFile, predicate: anyPredicate })).toMatchObject({
        delivery: 'c',
        matched: 'issue-closed',
      })
    })

    it('reads GitHub once for each member and names the member that holds', async () => {
      const file = join(tempDir(), 'events.jsonl')
      const reconcile = vi.fn<Reconcile>(member =>
        member.kind === 'comment' ? returned('x') : undefined,
      )
      const result = await waitForEvent({
        file,
        predicate: anyPredicate,
        since: '2026-10-26T17:00:00Z',
        reconcile,
        timeoutMs: 2000,
      })
      expect(result).toMatchObject({ source: 'reconcile', matched: 'comment' })
      expect(reconcile.mock.calls.map(call => call[0].kind)).toEqual(['issue-closed', 'comment'])
      expect(reconcile.mock.calls[1]?.[1]).toBe('2026-10-26T17:00:00.000Z')
    })

    it('does not add matched to an atomic predicate and waits on when no member holds', async () => {
      const file = join(tempDir(), 'events.jsonl')
      writeFileSync(file, line(closed('c')))
      expect(await waitForEvent({ file, predicate })).not.toHaveProperty('matched')
      const reconcile = vi.fn<Reconcile>(() => undefined)
      await expect(
        waitForEvent({
          file: join(tempDir(), 'none.jsonl'),
          predicate: anyPredicate,
          reconcile,
          timeoutMs: 200,
        }),
      ).rejects.toBeInstanceOf(WaitTimeout)
      // Two members at the start, and the same two again in the last read at the timeout.
      expect(reconcile).toHaveBeenCalledTimes(4)
    })

    it('reads no further member once an event has matched', async () => {
      const file = join(tempDir(), 'events.jsonl')
      const reconcile = vi.fn<Reconcile>(async member => {
        if (member.kind === 'issue-closed') await sleep(300)
        return undefined
      })
      const pending = waitForEvent({ file, predicate: anyPredicate, reconcile, timeoutMs: 5000 })
      await sleep(100)
      appendFileSync(file, line(returned('r')))
      expect(await pending).toMatchObject({ delivery: 'r', source: 'event', matched: 'comment' })
      await sleep(400)
      expect(reconcile.mock.calls.map(call => call[0].kind)).toEqual(['issue-closed'])
    })

    it('fails when the read of one member fails', async () => {
      await expect(
        waitForEvent({
          file: join(tempDir(), 'events.jsonl'),
          predicate: anyPredicate,
          reconcile: member => {
            if (member.kind === 'comment') throw new Error('gh failed')
            return undefined
          },
          timeoutMs: 2000,
        }),
      ).rejects.toThrow('gh failed')
    })
  })

  it('does not hand back an ignored pull request, and hands back the same one at a new head', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const ready = (head: string, delivery: string) =>
      record('pull_request', pullPayload('synchronize', false, 'main', head), delivery)
    writeFileSync(file, line(ready(HEAD_A, 'a')))
    const ignoring = (head: string) =>
      ({
        kind: 'pr-ready',
        base: 'main',
        ignore: [{ number: 41, head }],
      }) as const
    const pending = waitForEvent({ file, predicate: ignoring(HEAD_A), timeoutMs: 5000 })
    await sleep(100)
    appendFileSync(file, line(ready(HEAD_B, 'b')))
    expect(await pending).toMatchObject({ delivery: 'b', number: 41, head: HEAD_B })
  })
})

describe('waiting again after a hand-back', () => {
  const HANDOFF = '2026-11-01T10:00:00Z'
  type StubComment = { id: number; issue: number; created: string; body: string }
  const handoff = (id: number, issue: number, created: string): StubComment => ({
    id,
    issue,
    created,
    body: '<!-- line-handoff -->',
  })
  const urlOf = (issue: number, id: number) => `${REPO_URL}/issues/${issue}#issuecomment-${id}`
  /** A `gh api` that serves the comments of the issue named in the endpoint, oldest first. */
  function commentsApi(comments: readonly StubComment[]): GhCommand {
    return argv => {
      const issue = Number(/issues\/(\d+)\/comments/.exec(argv.at(-1) ?? '')?.[1])
      return [
        comments
          .filter(comment => comment.issue === issue)
          .map(comment => ({
            body: comment.body,
            created_at: comment.created,
            html_url: urlOf(comment.issue, comment.id),
          })),
      ]
    }
  }
  /** The line the receiver writes for a created comment. */
  const delivered = (comment: StubComment, delivery: string, at: string) =>
    record(
      'issue_comment',
      {
        action: 'created',
        issue: {
          number: comment.issue,
          state: 'open',
          html_url: `${REPO_URL}/issues/${comment.issue}`,
        },
        comment: { body: comment.body, html_url: urlOf(comment.issue, comment.id) },
      },
      delivery,
      at,
    )
  const both = {
    kind: 'any',
    of: [
      { kind: 'comment', issue: 7, marker: 'line-handoff' },
      { kind: 'comment', issue: 8, marker: 'line-handoff' },
    ],
  } as const
  const one = { kind: 'comment', issue: 7, marker: 'line-handoff' } as const

  it('hands back the record of line B after line A, when only the delivery of line A arrived', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const lineB = handoff(1001, 8, '2026-11-01T10:00:03Z')
    const lineA = handoff(1002, 7, '2026-11-01T10:00:05Z')
    writeFileSync(file, line(delivered(lineA, 'delivery-a', '2026-11-01T10:00:06.200Z')))
    const reconcile = githubReconcile('owner/repo', commentsApi([lineB, lineA]))
    const first = await waitForEvent({
      file,
      predicate: both,
      since: HANDOFF,
      reconcile,
      timeoutMs: 2000,
    })
    expect(first).toMatchObject({ source: 'event', delivery: 'delivery-a' })
    const second = await waitForEvent({
      file,
      predicate: both,
      since: HANDOFF,
      seen: ['1002'],
      reconcile,
      timeoutMs: 2000,
    })
    expect(second).toMatchObject({ source: 'reconcile', html_url: urlOf(8, 1001) })
  })

  it('hands back the record of line B after line A when the caller still gives the delivery id', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const lineB = handoff(1001, 8, '2026-11-01T10:00:03Z')
    const lineA = handoff(1002, 7, '2026-11-01T10:00:05Z')
    writeFileSync(file, line(delivered(lineA, 'delivery-a', '2026-11-01T10:00:06.200Z')))
    const result = await waitForEvent({
      file,
      predicate: both,
      since: 'delivery-a',
      reconcile: githubReconcile('owner/repo', commentsApi([lineB, lineA])),
      timeoutMs: 2000,
    })
    expect(result).toMatchObject({ source: 'reconcile', html_url: urlOf(8, 1001) })
  })

  it('hands back two records of one parent card one after the other, oldest first', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const comments = [
      handoff(2001, 7, '2026-11-01T10:00:01Z'),
      handoff(2002, 7, '2026-11-01T10:00:02Z'),
    ]
    const reconcile = githubReconcile('owner/repo', commentsApi(comments))
    const wait = (seen: string[], timeoutMs = 2000) =>
      waitForEvent({ file, predicate: one, since: HANDOFF, seen, reconcile, timeoutMs })
    expect(await wait([])).toMatchObject({ html_url: urlOf(7, 2001) })
    expect(await wait(['2001'])).toMatchObject({ html_url: urlOf(7, 2002) })
    await expect(wait(['2001', '2002'], 200)).rejects.toBeInstanceOf(WaitTimeout)
  })

  it('does not hand back a record again when its delivery arrives after the read found it', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const comment = handoff(3001, 7, '2026-11-01T10:00:02Z')
    const reconcile = githubReconcile('owner/repo', commentsApi([comment]))
    expect(
      await waitForEvent({ file, predicate: one, since: HANDOFF, reconcile, timeoutMs: 2000 }),
    ).toMatchObject({ source: 'reconcile', html_url: urlOf(7, 3001) })
    writeFileSync(file, line(delivered(comment, 'late', '2026-11-01T10:00:03.100Z')))
    await expect(
      waitForEvent({
        file,
        predicate: one,
        since: HANDOFF,
        seen: ['3001'],
        reconcile,
        timeoutMs: 200,
      }),
    ).rejects.toBeInstanceOf(WaitTimeout)
  })

  it('skips the lines of records that the caller has seen and wakes for the next new line', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const old = handoff(5001, 7, '2026-11-01T10:00:02Z')
    writeFileSync(file, line(delivered(old, 'old', '2026-11-01T10:00:03Z')))
    const pending = waitForEvent({ file, predicate: one, seen: ['5001'], timeoutMs: 5000 })
    await sleep(100)
    appendFileSync(
      file,
      line(delivered(handoff(5002, 7, '2026-11-01T10:00:09Z'), 'new', '2026-11-01T10:00:10Z')),
    )
    expect(await pending).toMatchObject({ source: 'event', delivery: 'new' })
  })

  it('reads GitHub once more at the timeout and hands back a record that appeared meanwhile', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const comment = handoff(7001, 7, '2026-11-01T10:00:02Z')
    const reconcile = vi
      .fn<Reconcile>()
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(delivered(comment, 'x', T0))
    const result = await waitForEvent({ file, predicate: one, reconcile, timeoutMs: 150 })
    expect(result).toMatchObject({ source: 'reconcile', marker: 'line-handoff' })
    expect(reconcile).toHaveBeenCalledTimes(2)
  })

  it('rejects with WaitTimeout only after that last read finds nothing', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const reconcile = vi.fn<Reconcile>(() => undefined)
    await expect(
      waitForEvent({ file, predicate: one, reconcile, timeoutMs: 150 }),
    ).rejects.toBeInstanceOf(WaitTimeout)
    expect(reconcile).toHaveBeenCalledTimes(2)
  })

  it('fails instead of timing out when the last read fails', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const reconcile = vi
      .fn<Reconcile>()
      .mockReturnValueOnce(undefined)
      .mockImplementationOnce(() => {
        throw new Error('gh failed')
      })
    await expect(waitForEvent({ file, predicate: one, reconcile, timeoutMs: 150 })).rejects.toThrow(
      'gh failed',
    )
  })

  it('does not give up while the last read is running, even when the file changes meanwhile', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const comment = handoff(7003, 7, '2026-11-01T10:00:02Z')
    const reconcile = vi
      .fn<Reconcile>()
      .mockReturnValueOnce(undefined)
      .mockImplementationOnce(async () => {
        await sleep(300)
        return delivered(comment, 'x', T0)
      })
    const pending = waitForEvent({ file, predicate: one, reconcile, timeoutMs: 100 })
    await sleep(200)
    appendFileSync(file, line(record('issues', issuePayload('labeled', 9), 'unrelated')))
    expect(await pending).toMatchObject({ source: 'reconcile' })
  })

  it('takes the last read after a read that is still running at the timeout', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const comment = handoff(7002, 7, '2026-11-01T10:00:02Z')
    const reconcile = vi
      .fn<Reconcile>()
      .mockImplementationOnce(async () => {
        await sleep(300)
        return undefined
      })
      .mockReturnValueOnce(delivered(comment, 'x', T0))
    const result = await waitForEvent({ file, predicate: one, reconcile, timeoutMs: 100 })
    expect(result).toMatchObject({ source: 'reconcile' })
    expect(reconcile).toHaveBeenCalledTimes(2)
  })
})

describe('githubReconcile', () => {
  const reconcileWith = (answer: unknown) => {
    const calls: (readonly string[])[] = []
    const call: GhCommand = argv => {
      calls.push(argv)
      return answer
    }
    return { reconcile: githubReconcile('owner/repo', call), calls }
  }

  it('reads the Issue state with one gh issue view', () => {
    const open = reconcileWith({ state: 'OPEN' })
    expect(open.reconcile({ kind: 'issue-closed', issue: 5 }, undefined)).toBeUndefined()
    expect(open.calls).toEqual([['issue', 'view', '5', '--repo', 'owner/repo', '--json', 'state']])
    expect(
      reconcileWith({ state: 'CLOSED' }).reconcile({ kind: 'issue-closed', issue: 5 }, undefined),
    ).toMatchObject({ event: 'issues', action: 'closed', number: 5 })
  })

  it('finds an open pull request that is not a draft on the base branch', () => {
    const drafts = reconcileWith([{ number: 1, isDraft: true, headRefOid: HEAD_A }])
    expect(drafts.reconcile({ kind: 'pr-ready', base: 'main' }, undefined)).toBeUndefined()
    expect(drafts.calls[0]).toEqual([
      'pr',
      'list',
      '--repo',
      'owner/repo',
      '--base',
      'main',
      '--state',
      'open',
      '--limit',
      '200',
      '--json',
      'number,isDraft,headRefOid',
    ])
    expect(
      reconcileWith([
        { number: 1, isDraft: true, headRefOid: HEAD_A },
        { number: 2, isDraft: false, headRefOid: HEAD_B },
      ]).reconcile({ kind: 'pr-ready', base: 'main' }, undefined),
    ).toMatchObject({ event: 'pull_request', number: 2, draft: false, base: 'main', head: HEAD_B })
  })

  it('skips the pull requests at an ignored head and finds the same one at a new head', () => {
    const pulls = [
      { number: 2, isDraft: false, headRefOid: HEAD_A },
      { number: 3, isDraft: true, headRefOid: HEAD_A },
    ]
    const ignoring = (...ignore: { number: number; head: string }[]) =>
      ({ kind: 'pr-ready', base: 'main', ignore }) as const
    const { reconcile } = reconcileWith(pulls)
    expect(reconcile(ignoring({ number: 2, head: HEAD_A }), undefined)).toBeUndefined()
    expect(reconcile(ignoring({ number: 2, head: HEAD_B }), undefined)).toMatchObject({
      number: 2,
      head: HEAD_A,
    })
    expect(reconcile(ignoring({ number: 9, head: HEAD_A }), undefined)).toMatchObject({ number: 2 })
    const next = reconcileWith([{ number: 2, isDraft: false, headRefOid: HEAD_B }])
    expect(next.reconcile(ignoring({ number: 2, head: HEAD_A }), undefined)).toMatchObject({
      number: 2,
      head: HEAD_B,
    })
  })

  it('finds a comment with the marker created after since, on every page', () => {
    const pages = [
      [{ body: 'x', created_at: '2026-10-26T10:00:00Z', html_url: 'u0' }],
      [
        { body: '<!-- line-delta -->', created_at: '2026-10-26T10:30:00Z', html_url: 'u1' },
        { body: '<!-- line-delta -->', created_at: '2026-10-26T12:30:00Z', html_url: 'u2' },
      ],
    ]
    const predicate = { kind: 'comment', issue: 7, marker: 'line-delta' } as const
    const { reconcile, calls } = reconcileWith(pages)
    expect(reconcile(predicate, '2026-10-26T12:00:00.000Z')).toMatchObject({
      html_url: 'u2',
      marker: 'line-delta',
    })
    expect(calls[0]?.at(-1)).toBe(
      'repos/owner/repo/issues/7/comments?since=2026-10-26T12%3A00%3A00.000Z',
    )
    expect(reconcile(predicate, '2026-10-26T13:00:00.000Z')).toBeUndefined()
    expect(
      reconcileWith([[{ body: 'x', created_at: T0, html_url: 'u' }]]).reconcile(
        predicate,
        undefined,
      ),
    ).toBeUndefined()
  })
})

describe('createReceiverServer', () => {
  async function started(secret?: string) {
    const file = join(tempDir(), 'out', 'events.jsonl')
    const server = createReceiverServer({
      file,
      ...(secret === undefined ? {} : { secret }),
      now: () => T0,
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const url = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
    return { file, url, close: () => server.close() && server.closeAllConnections() }
  }
  const body = JSON.stringify(issuePayload('closed', 5, 'closed'))

  it('appends one normalized line per POST and answers 204', async () => {
    const receiver = await started()
    try {
      const response = await fetch(receiver.url, {
        method: 'POST',
        headers: { 'x-github-event': 'issues', 'x-github-delivery': 'd-1' },
        body,
      })
      expect(response.status).toBe(204)
      expect(readFileSync(receiver.file, 'utf8')).toBe(
        line(record('issues', issuePayload('closed', 5, 'closed'), 'd-1')),
      )
    } finally {
      receiver.close()
    }
  })

  it('refuses other methods and bodies that are not deliveries, and writes nothing', async () => {
    const receiver = await started()
    try {
      expect((await fetch(receiver.url)).status).toBe(405)
      const noEvent = await fetch(receiver.url, { method: 'POST', body })
      expect(noEvent.status).toBe(400)
      const garbage = await fetch(receiver.url, {
        method: 'POST',
        headers: { 'x-github-event': 'issues' },
        body: '{',
      })
      expect(garbage.status).toBe(400)
      expect(() => readFileSync(receiver.file)).toThrow()
    } finally {
      receiver.close()
    }
  })

  it('answers 500 and logs one line when the event file cannot be written', async () => {
    const file = join(tempDir(), 'events.jsonl')
    mkdirSync(file)
    const messages: string[] = []
    const server = createReceiverServer({ file, now: () => T0, log: m => messages.push(m) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    try {
      const response = await fetch(
        `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`,
        { method: 'POST', headers: { 'x-github-event': 'issues' }, body },
      )
      expect(response.status).toBe(500)
      expect(messages).toEqual([expect.stringContaining('Cannot write the event file')])
      expect(messages[0]).toContain('EISDIR')
    } finally {
      server.close()
      server.closeAllConnections()
    }
  })

  it('checks X-Hub-Signature-256 when a secret is given', async () => {
    const receiver = await started('s3cret')
    const sign = (text: string, secret: string) =>
      `sha256=${createHmac('sha256', secret).update(text).digest('hex')}`
    const post = (signature?: string) =>
      fetch(receiver.url, {
        method: 'POST',
        headers: {
          'x-github-event': 'issues',
          ...(signature === undefined ? {} : { 'x-hub-signature-256': signature }),
        },
        body,
      })
    try {
      expect((await post()).status).toBe(401)
      expect((await post(sign(body, 'other'))).status).toBe(401)
      expect(() => readFileSync(receiver.file)).toThrow()
      expect((await post(sign(body, 's3cret'))).status).toBe(204)
      expect(readFileSync(receiver.file, 'utf8').trim().split('\n')).toHaveLength(1)
    } finally {
      receiver.close()
    }
  })
})

describe('serveReceiver legacy ownership', () => {
  function harness() {
    let resolveExit: (code: number | null) => void = () => undefined
    const stop = vi.fn(async () => resolveExit(0))
    const spawnForward = vi.fn(
      (_args: { repository: string; port: number; secret: string | undefined }) => ({
        exited: new Promise<number | null>(resolve => {
          resolveExit = resolve
        }),
        stop,
      }),
    )
    return { spawnForward, stop, crash: (code: number) => resolveExit(code) }
  }
  const run = (
    h: ReturnType<typeof harness>,
    stopped: Promise<void>,
    file: string,
    log: (message: string) => void = () => undefined,
  ) =>
    serveReceiver({
      port: 0,
      file,
      repository: 'owner/repo',
      secret: 's',
      spawnForward: h.spawnForward,
      stopped,
      log,
    })

  it('stops its child and persists unknown hook ownership without claiming clean shutdown', async () => {
    const file = join(tempDir(), 'events.jsonl')
    const h = harness()
    let stop: () => void = () => undefined
    const messages: string[] = []
    const exit = run(
      h,
      new Promise<void>(resolve => {
        stop = resolve
      }),
      file,
      m => messages.push(m),
    )
    await vi.waitFor(() => expect(h.spawnForward).toHaveBeenCalled())
    expect(h.spawnForward.mock.calls[0]?.[0]).toMatchObject({
      repository: 'owner/repo',
      secret: 's',
    })
    expect(readFileSync(join(file, '..', 'receiver.pid'), 'utf8')).toBe(`${process.pid}\n`)
    stop()
    expect(await exit).toBe(2)
    expect(h.stop).toHaveBeenCalledTimes(1)
    expect(messages.join('\n')).toContain('No hooks were deleted')
    expect(existsSync(join(file, '..', 'receiver.pid'))).toBe(false)
    expect(JSON.parse(readFileSync(join(file, '..', 'receiver-state.json'), 'utf8'))).toMatchObject(
      {
        mode: 'legacy',
        state: 'recovery-needed',
        reasonCode: 'legacy-hook-ownership-unknown',
        hookId: null,
      },
    )
  })

  it.each([1, 422])(
    'cleans up its local writer after child exit %s and preserves recovery diagnostics',
    async code => {
      const file = join(tempDir(), 'events.jsonl')
      const h = harness()
      const messages: string[] = []
      const exit = run(h, new Promise<void>(() => undefined), file, m => messages.push(m))
      await vi.waitFor(() => expect(h.spawnForward).toHaveBeenCalled())
      h.crash(code)
      expect(await exit).toBe(2)
      expect(h.stop).toHaveBeenCalledTimes(1)
      expect(messages.join('\n')).toContain(
        code === 422 ? 'legacy-hook-conflict' : 'recovery-needed',
      )
      expect(existsSync(join(file, '..', 'receiver.pid'))).toBe(false)
    },
  )

  it('refuses a live receiver PID without spawning a second child', async () => {
    const dir = tempDir(),
      file = join(dir, 'events.jsonl'),
      pidFile = join(dir, 'receiver.pid')
    writeFileSync(pidFile, `${process.pid}\n`)
    const h = harness()
    await expect(run(h, Promise.resolve(), file)).rejects.toBeInstanceOf(InputError)
    expect(h.spawnForward).not.toHaveBeenCalled()
    expect(readFileSync(pidFile, 'utf8')).toBe(`${process.pid}\n`)
  })

  it('reclaims a stale PID but never converts unknown hook ownership to success', async () => {
    const dir = tempDir(),
      file = join(dir, 'events.jsonl'),
      pidFile = join(dir, 'receiver.pid')
    writeFileSync(pidFile, `${spawnSync(process.execPath, ['-e', '']).pid}\n`)
    const h = harness()
    expect(await run(h, Promise.resolve(), file)).toBe(2)
    expect(h.spawnForward).toHaveBeenCalledTimes(1)
    expect(existsSync(pidFile)).toBe(false)
  })

  it('releases the local writer when spawning the child fails', async () => {
    const dir = tempDir(),
      file = join(dir, 'events.jsonl')
    await expect(
      serveReceiver({
        port: 0,
        file,
        repository: 'owner/repo',
        stopped: Promise.resolve(),
        log: () => undefined,
        spawnForward: () => {
          throw new Error('spawn fixture failure')
        },
      }),
    ).rejects.toThrow('spawn fixture failure')
    expect(existsSync(join(dir, 'receiver.pid'))).toBe(false)
    expect(existsSync(join(dir, 'receiver.guard'))).toBe(false)
  })
})

describe('forwardArgv', () => {
  it('forwards the three events to the local port and passes the secret with -S', () => {
    expect(forwardArgv({ repository: 'owner/repo', port: 8788, secret: undefined })).toEqual([
      'webhook',
      'forward',
      '--repo',
      'owner/repo',
      '--events',
      'issues,pull_request,issue_comment',
      '--url',
      'http://127.0.0.1:8788',
    ])
    expect(forwardArgv({ repository: 'owner/repo', port: 1, secret: 's' }).slice(-2)).toEqual([
      '-S',
      's',
    ])
  })
})

import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  commentMarker,
  dedupeEvents,
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
  const dir = mkdtempSync(join(tmpdir(), 'delivery-events-'))
  dirs.push(dir)
  return dir
}
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const REPO_URL = 'https://github.com/owner/repo'
const issuePayload = (action: string, number: number, state = 'open') => ({
  action,
  issue: { number, state, html_url: `${REPO_URL}/issues/${number}` },
})
const pullPayload = (action: string, draft: boolean, base: string) => ({
  action,
  number: 41,
  pull_request: {
    number: 41,
    state: 'open',
    draft,
    base: { ref: base },
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
      matchEvent(record('pull_request', pullPayload('synchronize', false, 'main'), 'e'), predicate),
    ).toBe(false)
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

describe('dedupeEvents and parseEventLine', () => {
  it('keeps the first record of a delivery id and every record without one', () => {
    const first = record('issues', issuePayload('closed', 1, 'closed'), 'same')
    const again = { ...first, receivedAt: '2026-10-26T19:00:00.000Z' }
    const anonymous = { ...first, delivery: null }
    expect(dedupeEvents([first, again, anonymous, anonymous])).toEqual([
      first,
      anonymous,
      anonymous,
    ])
  })

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
    expect(reconcile).toHaveBeenCalledWith(predicate, '2026-10-26T17:00:00.000Z')
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
    const drafts = reconcileWith([{ number: 1, isDraft: true }])
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
      '--json',
      'number,isDraft',
    ])
    expect(
      reconcileWith([
        { number: 1, isDraft: true },
        { number: 2, isDraft: false },
      ]).reconcile({ kind: 'pr-ready', base: 'main' }, undefined),
    ).toMatchObject({ event: 'pull_request', number: 2, draft: false, base: 'main' })
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

describe('serveReceiver', () => {
  const FORWARDER = 'https://webhook-forwarder.github.com/hook'
  /** `gh` over a hook list that records the order of every action. */
  function harness(options: { failDelete?: number } = {}) {
    const actions: string[] = []
    const hooks = [
      { id: 1, name: 'cli', config: { url: FORWARDER } },
      { id: 2, name: 'web', config: { url: 'https://example.com/github' } },
    ]
    const gh = (argv: readonly string[]): string => {
      if (argv.includes('DELETE')) {
        const id = Number(argv.at(-1)?.split('/').at(-1))
        if (id === options.failDelete) throw new Error('forbidden')
        actions.push(`delete ${id}`)
        hooks.splice(0, hooks.length, ...hooks.filter(hook => hook.id !== id))
        return ''
      }
      return JSON.stringify([hooks])
    }
    let resolveExit: (code: number | null) => void = () => undefined
    const spawnForward = vi.fn(
      (_args: { repository: string; port: number; secret: string | undefined }) => {
        actions.push('spawn')
        hooks.push({ id: 3, name: 'cli', config: { url: FORWARDER } })
        return {
          exited: new Promise<number | null>(resolve => {
            resolveExit = resolve
          }),
          stop: () => {
            actions.push('stop')
            resolveExit(0)
            return Promise.resolve()
          },
        }
      },
    )
    return { actions, hooks, gh, spawnForward, crash: () => resolveExit(1) }
  }
  const run = (h: ReturnType<typeof harness>, stopped: Promise<void>, secret?: string) =>
    serveReceiver({
      port: 0,
      file: join(tempDir(), 'events.jsonl'),
      repository: 'owner/repo',
      ...(secret === undefined ? {} : { secret }),
      gh: h.gh,
      spawnForward: h.spawnForward,
      stopped,
      log: () => undefined,
    })

  it('deletes stale hooks first, stops the forwarder, then deletes the hook it created', async () => {
    const h = harness()
    let stop: () => void = () => undefined
    const exit = run(h, new Promise<void>(resolve => (stop = resolve)), 's')
    await vi.waitFor(() => expect(h.spawnForward).toHaveBeenCalled())
    expect(h.spawnForward.mock.calls[0]?.[0]).toMatchObject({
      repository: 'owner/repo',
      secret: 's',
    })
    stop()
    expect(await exit).toBe(0)
    expect(h.actions).toEqual(['delete 1', 'spawn', 'stop', 'delete 3'])
    expect(h.hooks.map(hook => hook.id)).toEqual([2])
  })

  it('exits 1 and still cleans up when the forwarder dies', async () => {
    const h = harness()
    const exit = run(h, new Promise<void>(() => undefined))
    await vi.waitFor(() => expect(h.spawnForward).toHaveBeenCalled())
    h.crash()
    expect(await exit).toBe(1)
    expect(h.actions.slice(-2)).toEqual(['stop', 'delete 3'])
  })

  it('exits 1 and names the leftover when a hook cannot be deleted at shutdown', async () => {
    const h = harness({ failDelete: 3 })
    const messages: string[] = []
    let stop: () => void = () => undefined
    const exit = serveReceiver({
      port: 0,
      file: join(tempDir(), 'events.jsonl'),
      repository: 'owner/repo',
      gh: h.gh,
      spawnForward: h.spawnForward,
      stopped: new Promise<void>(resolve => (stop = resolve)),
      log: message => messages.push(message),
    })
    await vi.waitFor(() => expect(h.spawnForward).toHaveBeenCalled())
    stop()
    expect(await exit).toBe(1)
    expect(messages.join('\n')).toContain('Forwarder hooks left behind: 3')
  })

  it('does not start the forwarder when a stale hook cannot be deleted', async () => {
    const h = harness({ failDelete: 1 })
    await expect(run(h, new Promise<void>(() => undefined))).rejects.toBeInstanceOf(InputError)
    expect(h.spawnForward).not.toHaveBeenCalled()
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

import { realpathSync, appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseEventLine, type EventRecord } from '../src/delivery/events.ts'
import { githubReconcile } from '../src/delivery/events-gh.ts'
import { waitForEvent } from '../src/delivery/events-wait.ts'

const dirs: string[] = []
afterEach(() => {
  vi.useRealTimers()
  dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }))
})
const receiver = {
  instanceId: 'receiver-one',
  repository: 'owner/repo',
  mode: 'channel',
  requiresReconcile: true,
} as const
const closed: EventRecord = {
  delivery: 'closed-hint',
  event: 'issues',
  action: 'closed',
  number: 42,
  state: 'closed',
  draft: null,
  base: null,
  head: null,
  marker: null,
  html_url: null,
  receivedAt: '2026-10-27T10:00:00Z',
}
function eventFile(content = ''): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'events-trust-')))
  dirs.push(dir)
  const file = join(dir, 'events.jsonl')
  writeFileSync(file, content)
  return file
}
const line = (value: unknown) => `${JSON.stringify(value)}\n`
const predicate = { kind: 'issue-closed', issue: 42 } as const

describe('channel evidence', () => {
  const subject = {
    runId: 12,
    runAttempt: 2,
    workflowJobId: null,
    checkRunId: 14,
    checkSuiteId: 15,
    deploymentId: null,
    deploymentStatusId: null,
    reviewId: null,
    pullNumber: 42,
    headSha: 'A'.repeat(40),
    ref: 'refs/heads/main',
  }

  it('preserves distinct workflow and check identities for authoritative lookup', () => {
    expect(parseEventLine(line({ ...closed, receiver, subject }))?.subject).toEqual({
      ...subject,
      headSha: 'a'.repeat(40),
    })
  })

  it.each([{ runId: -1 }, { checkSuiteId: 1.2 }, { headSha: 'a'.repeat(41) }, { ref: '' }])(
    'rejects malformed object identity rather than silently dropping it',
    invalid => {
      expect(
        parseEventLine(line({ ...closed, receiver, subject: { ...subject, ...invalid } })),
      ).toBeUndefined()
    },
  )

  it('preserves the reconciliation requirement through JSONL parsing', () => {
    expect(parseEventLine(line({ ...closed, receiver }))?.receiver).toEqual(receiver)
    expect(parseEventLine(line(closed))).toEqual(closed)
  })

  it.each([null, {}, { ...receiver, requiresReconcile: false }, { ...receiver, repository: '' }])(
    'does not downgrade malformed receiver metadata to a trusted legacy event',
    value => {
      expect(parseEventLine(line({ ...closed, receiver: value }))).toBeUndefined()
    },
  )

  it('does not release on a channel close hint when authoritative state remains open', async () => {
    const signal = new AbortController()
    const reconcile = vi.fn(async () => undefined)
    const waiting = waitForEvent({
      file: eventFile(line({ ...closed, receiver })),
      repository: 'owner/repo',
      predicate,
      reconcile,
      signal: signal.signal,
    })
    const observed = waiting.catch(error => error)
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1))
    const stopped = new Error('stop fixture')
    signal.abort(stopped)
    expect(await observed).toBe(stopped)
  })

  it('returns authoritative evidence instead of the relay hint', async () => {
    const result = await waitForEvent({
      file: eventFile(line({ ...closed, receiver })),
      repository: 'owner/repo',
      predicate,
      reconcile: async () => ({ ...closed, delivery: 'authoritative' }),
    })
    expect(result.source).toBe('reconcile')
    expect(result.delivery).toBe('authoritative')
  })

  it.each([undefined, 'another/repo'])(
    'refuses an unbound or different repository',
    async repository => {
      await expect(
        waitForEvent({
          file: eventFile(line({ ...closed, receiver })),
          predicate,
          ...(repository === undefined ? {} : { repository }),
          reconcile: async () => closed,
        }),
      ).rejects.toThrow('repository')
    },
  )

  it('requires an authoritative reader for channel events', async () => {
    await expect(
      waitForEvent({
        file: eventFile(line({ ...closed, receiver })),
        repository: 'owner/repo',
        predicate,
      }),
    ).rejects.toThrow('authoritative reconciliation')
  })

  it('reconciles after reconnection without requiring a matching business event', async () => {
    const file = eventFile()
    const reconcile = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(closed)
    const waiting = waitForEvent({
      file,
      repository: 'owner/repo',
      predicate,
      reconcile,
      timeoutMs: 2000,
    })
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1))
    appendFileSync(
      file,
      line({
        ...closed,
        delivery: null,
        event: 'receiver',
        action: 'reconnected',
        number: null,
        receiver,
        diagnostic: { reasonCode: 'connected', connectionEpoch: 2, coverage: 'coverage-gap' },
      }),
    )
    expect((await waiting).source).toBe('reconcile')
    expect(reconcile).toHaveBeenCalledTimes(2)
  })

  it('hands back two records created in the same second one after the other', async () => {
    const created = '2026-11-01T10:00:07Z'
    const url = (id: number) => `https://github.com/owner/repo/issues/7#issuecomment-${id}`
    const comments = [4000, 4001, 4002].map(id => ({
      body: '<!-- line-delta -->',
      created_at: created,
      html_url: url(id),
    }))
    const hint = (id: number): EventRecord => ({
      ...closed,
      delivery: `hint-${id}`,
      event: 'issue_comment',
      action: 'created',
      number: 7,
      state: null,
      marker: 'line-delta',
      html_url: url(id),
      receivedAt: '2026-11-01T10:00:08Z',
      receiver,
    })
    const file = eventFile(line(hint(4001)) + line(hint(4002)))
    const reconcile = githubReconcile('owner/repo', () => [comments])
    const commentPredicate = { kind: 'comment', issue: 7, marker: 'line-delta' } as const
    const wait = (seen: string[], timeoutMs = 2000) =>
      waitForEvent({
        file,
        repository: 'owner/repo',
        predicate: commentPredicate,
        since: created,
        seen,
        reconcile,
        timeoutMs,
      })
    expect(await wait(['4000'])).toMatchObject({ source: 'reconcile', html_url: url(4001) })
    expect(await wait(['4000', '4001'])).toMatchObject({ source: 'reconcile', html_url: url(4002) })
    await expect(wait(['4000', '4001', '4002'], 200)).rejects.toThrow('No matching event')
  })

  it('retains a channel hint received during a pending read', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const file = eventFile()
    let release: (() => void) | undefined
    const first = new Promise<void>(resolve => {
      release = resolve
    })
    const reconcile = vi
      .fn()
      .mockImplementationOnce(async () => {
        await first
        return undefined
      })
      .mockResolvedValueOnce(closed)
    const waiting = waitForEvent({
      file,
      repository: 'owner/repo',
      predicate,
      reconcile,
      timeoutMs: 2000,
    })
    appendFileSync(file, line({ ...closed, receiver }))
    vi.advanceTimersByTime(5000)
    expect(reconcile).toHaveBeenCalledTimes(1)
    release?.()
    expect((await waiting).source).toBe('reconcile')
    expect(reconcile).toHaveBeenCalledTimes(2)
  })
})

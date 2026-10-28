import { describe, expect, it, vi } from 'vitest'
import { encodeRecordComment } from '../src/delivery/collaboration-comments.ts'
import { canonical, digest } from '../src/integration/parse.ts'
import { registeredRequests } from '../src/delivery/collaboration-requests.ts'
import { recordContext, type RecordComment } from '../src/delivery/collaboration-read.ts'
import {
  requestRunName,
  validateRecordAuthority,
  type RecordAuthority,
} from '../src/delivery/collaboration-trust.ts'
import type { CollaborationRecord } from '../src/delivery/collaboration-records.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import { context, delta, release, request, TIME, TOOL, writer } from './fixtures/collaboration.ts'

function authority(): RecordAuthority {
  return {
    context: { ...context },
    participants: [10],
    reduce: [{ writer: { ...writer }, from: '2026-10-27T09:00:00Z', until: null }],
    lines: [{ lineParent: 10, login: 'line-owner', from: '2026-10-27T09:00:00Z', until: null }],
    workflow: { path: '.github/workflows/integration-request.yml', ref: 'github-gate', head: TOOL },
  }
}

function comment(record: CollaborationRecord): RecordComment {
  const issue = record.kind === 'delta' ? record.lineParent : recordContext(record).reduceIssue
  const requestAuthor = record.kind === 'request'
  return {
    id: 25,
    issue,
    author: requestAuthor ? 'github-actions[bot]' : 'owner',
    authorType: requestAuthor ? 'Bot' : 'User',
    body: encodeRecordComment(record),
    url: `https://github.com/owner/repo/issues/${issue}#issuecomment-25`,
    createdAt: TIME,
    updatedAt: TIME,
    record,
  }
}

function run(receipt = request()) {
  return {
    repository: { full_name: context.repo },
    id: receipt.workflow.runId,
    run_attempt: receipt.workflow.runAttempt,
    path: receipt.workflow.path,
    head_branch: receipt.workflow.ref,
    head_sha: receipt.workflow.head,
    event: 'workflow_dispatch',
    display_title: requestRunName(receipt.input, receipt.workflow.inputDigest),
    actor: { login: 'line-owner' },
    triggering_actor: { login: 'line-owner' },
    created_at: '2026-10-27T09:59:00Z',
    status: 'completed',
    conclusion: 'success',
  }
}

describe('collaboration record authority', () => {
  it('requires the exact adopted reduce writer and does not read GitHub for ordinary records', () => {
    const read = vi.fn()
    validateRecordAuthority(comment(delta()), authority(), read)
    expect(read).not.toHaveBeenCalled()
    expect(() =>
      validateRecordAuthority({ ...comment(delta()), author: 'other' }, authority(), read),
    ).toThrow('reduce-writer-untrusted')
  })

  it('refuses stale epochs, revoked writers and edits after their authority ended', () => {
    const record = delta(),
      policy = authority()
    record.writer.epoch = '33333333-3333-4333-8333-333333333333'
    expect(() => validateRecordAuthority(comment(record), policy, vi.fn())).toThrow(
      'reduce-writer-untrusted',
    )
    policy.reduce = [{ writer, from: '2026-10-27T09:00:00Z', until: TIME }]
    expect(() => validateRecordAuthority(comment(delta()), policy, vi.fn())).toThrow(
      'reduce-writer-untrusted',
    )
    const before = {
      ...comment(delta()),
      createdAt: '2026-10-27T09:59:00Z',
      updatedAt: '2026-10-27T09:59:00Z',
    }
    validateRecordAuthority(before, policy, vi.fn())
    expect(() => validateRecordAuthority({ ...before, updatedAt: TIME }, policy, vi.fn())).toThrow(
      'reduce-writer-untrusted',
    )
  })

  it('rejects the wrong card, context and missing idle participants', () => {
    expect(() =>
      validateRecordAuthority({ ...comment(delta()), issue: 100 }, authority(), vi.fn()),
    ).toThrow('card-mismatch')
    expect(() =>
      validateRecordAuthority(
        comment(delta()),
        { ...authority(), context: { ...context, wave: 3 } },
        vi.fn(),
      ),
    ).toThrow('context-mismatch')
    const policy = authority()
    policy.participants.push(20)
    policy.lines.push({
      lineParent: 20,
      login: 'idle-owner',
      from: '2026-10-27T09:00:00Z',
      until: null,
    })
    expect(() => validateRecordAuthority(comment(release()), policy, vi.fn())).toThrow(
      'lines-incomplete',
    )
  })

  it('requires a completed trusted workflow bound to the request digest and exact attempt', () => {
    const read = vi.fn<GhRead>(() => run())
    validateRecordAuthority(comment(request()), authority(), read)
    expect(read.mock.calls[0]?.[0]).toContain('repos/owner/repo/actions/runs/30/attempts/1')
    validateRecordAuthority(comment(request()), authority(), () => ({
      ...run(),
      path: `${run().path}@github-gate`,
    }))
  })

  it('refuses overlapping reduce owners even when the selected author matches one of them', () => {
    const policy = authority()
    policy.reduce.push({
      writer: { ...writer, epoch: '33333333-3333-4333-8333-333333333333' },
      from: '2026-10-27T09:00:00Z',
      until: null,
    })
    expect(() => validateRecordAuthority(comment(delta()), policy, vi.fn())).toThrow(
      'reduce-owner-conflict',
    )
  })

  it.each([
    { run_attempt: 2 },
    { head_sha: 'f'.repeat(40) },
    { event: 'pull_request' },
    { path: '.github/workflows/untrusted.yml' },
    { path: '.github/workflows/integration-request.yml@evil' },
    { head_branch: 'evil' },
    { display_title: 'copied requestId without digest' },
    { repository: { full_name: 'other/repo' } },
  ])('rejects a mismatched workflow identity %#', patch => {
    expect(() =>
      validateRecordAuthority(comment(request()), authority(), () => ({ ...run(), ...patch })),
    ).toThrow('run-mismatch')
  })

  it('does not trust a forged marker from an ordinary account or an unapproved workflow', () => {
    const read = vi.fn(() => run()),
      receipt = request()
    expect(() =>
      validateRecordAuthority(
        { ...comment(receipt), author: 'owner', authorType: 'User' },
        authority(),
        read,
      ),
    ).toThrow('author-untrusted')
    expect(read).not.toHaveBeenCalled()
    receipt.workflow.head = 'f'.repeat(40)
    expect(() => validateRecordAuthority(comment(receipt), authority(), read)).toThrow(
      'workflow-untrusted',
    )
  })

  it('distinguishes workflow pending and failed from a registered success', () => {
    expect(() =>
      validateRecordAuthority(comment(request()), authority(), () => ({
        ...run(),
        status: 'in_progress',
      })),
    ).toThrow('workflow-pending')
    expect(() =>
      validateRecordAuthority(comment(request()), authority(), () => ({
        ...run(),
        conclusion: 'failure',
      })),
    ).toThrow('workflow-failed')
  })

  it('permits an authorized reduce rerun after the original line grant ended, but not an old line rerun', () => {
    const policy = authority()
    policy.lines = [
      {
        lineParent: 10,
        login: 'line-owner',
        from: '2026-10-27T09:00:00Z',
        until: '2026-10-27T09:59:30Z',
      },
    ]
    expect(() => validateRecordAuthority(comment(request()), policy, () => run())).toThrow(
      'rerun-untrusted',
    )
    validateRecordAuthority(comment(request()), policy, () => ({
      ...run(),
      triggering_actor: { login: 'owner' },
    }))
    expect(() =>
      validateRecordAuthority(comment(request()), policy, () => ({
        ...run(),
        triggering_actor: { login: 'stranger' },
      })),
    ).toThrow('rerun-untrusted')
  })
})

describe('registered collaboration requests', () => {
  function verified(receipt = request(), id = 25) {
    const item = { ...comment(receipt), id }
    validateRecordAuthority(item, authority(), () => run(receipt))
    return item
  }

  it('keeps one business request across workflow retries and preserves each transmission', () => {
    const first = verified(),
      retry = request(),
      newRun = request()
    retry.workflow.runAttempt = 2
    newRun.workflow.runId = 31
    const requests = registeredRequests([verified(newRun, 27), verified(retry, 26), first, first])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.receipt.id).toBe(25)
    expect(requests[0]?.transmissions).toEqual([
      { commentId: 25, runId: 30, runAttempt: 1 },
      { commentId: 26, runId: 30, runAttempt: 2 },
      { commentId: 27, runId: 31, runAttempt: 1 },
    ])
  })

  it('rejects a reused request identity with different input even from a trusted workflow', () => {
    const changed = request()
    changed.input.targetRef = 'integration/another-track'
    changed.workflow.inputDigest = digest(canonical(changed.input))
    expect(() => registeredRequests([verified(), verified(changed, 26)])).toThrow(
      'request-identity-conflict',
    )
  })

  it('keeps an explicitly new request separate', () => {
    const nextRequest = request()
    nextRequest.input.previousRequestId = nextRequest.input.requestId
    nextRequest.input.requestId = '22222222-2222-4222-8222-222222222222'
    nextRequest.workflow.inputDigest = digest(canonical(nextRequest.input))
    expect(registeredRequests([verified(), verified(nextRequest, 26)])).toHaveLength(2)
  })

  it('does not count ordinary collaboration records as requests', () => {
    const item = comment(delta())
    validateRecordAuthority(item, authority(), vi.fn())
    expect(registeredRequests([item])).toEqual([])
  })
})

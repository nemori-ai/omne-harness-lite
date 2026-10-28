import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonical, digest } from '../src/integration/parse.ts'
import { gateRunName } from '../src/integration/gate-correlation.ts'
import {
  ACCEPTANCE_SOURCES_PATH,
  readAcceptanceSourcesRest,
} from '../src/delivery/collaboration-acceptance-source.ts'
import { encodeRecordComment } from '../src/delivery/collaboration-comments.ts'
import { requestRunName } from '../src/delivery/collaboration-trust.ts'
import type { RequestRecord, RequestStateRecord } from '../src/delivery/collaboration-records.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { nextReduceRequest } from '../src/delivery/reduce-integration-read.ts'
import {
  claimReduceRequest,
  prepareReduceCandidate,
  recordReduceRequest,
  type ReduceIntegrationPorts,
} from '../src/delivery/reduce-integration.ts'
import { withReduceLock } from '../src/delivery/reduce-integration-lock.ts'
import {
  backend,
  dispatch,
  policy,
  rawComment,
  scope,
  taskBinding,
} from './fixtures/collaboration-authority.ts'
import { BASE, FINAL, HEAD, TOOL, TIME, context, request, state } from './fixtures/collaboration.ts'
import { reduceMain } from '../src/delivery/reduce-cli.ts'

const directories: string[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(TIME))
})
afterEach(() => {
  vi.useRealTimers()
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})
function fixture(twoLines = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'reduce-integration-')))
  directories.push(root)
  const s = scope()
  if (twoLines) s.lines.push({ lineParent: 20, login: 'line-owner' })
  const source = backend(taskBinding(), [dispatch(taskBinding(), s)])
  const requests: RequestRecord[] = []
  let sequence = 200,
    dropped = false,
    lost = false,
    unavailable = false
  const writes: string[] = []
  const evidence = {
    url: 'https://github.com/owner/repo/issues/100#issuecomment-99',
    sha256: digest('actual report'),
    description: 'Candidate check report',
  }
  const candidate = {
    head: HEAD,
    target: BASE,
    merged: false,
    merge: FINAL,
    closed: false,
    reachable: true,
  }
  const gate = { status: 'completed', conclusion: 'success', attempt: 1 }
  function add(receipt = request()) {
    requests.push(receipt)
    const comment = rawComment(
      ++sequence,
      encodeRecordComment(receipt),
      TIME,
      'github-actions[bot]',
    )
    comment.user.type = 'Bot'
    source.comments.push(comment)
    return receipt
  }
  add()
  const call: GhCommand = (args, timeout) => {
    const path = args.find(value => value.startsWith('repos/')) ?? args.at(-1) ?? ''
    if (args[2] === 'POST') {
      const body = args.at(-1)?.slice(5) ?? ''
      writes.push(body)
      if (!dropped) source.comments.push(rawComment(++sequence, body, TIME))
      if (lost) throw new Error('response lost')
      return { id: sequence }
    }
    if (unavailable) throw new Error('read unavailable')
    if (args.at(-1) === 'user') return { login: 'owner', type: 'User' }
    if (path.includes('/actions/runs/')) {
      const receipt = requests.find(item => path.includes(`/runs/${item.workflow.runId}/`))
      if (receipt !== undefined)
        return {
          repository: { full_name: context.repo },
          id: receipt.workflow.runId,
          run_attempt: receipt.workflow.runAttempt,
          path: receipt.workflow.path,
          head_branch: receipt.workflow.ref,
          head_sha: receipt.workflow.head,
          event: 'workflow_dispatch',
          display_title: requestRunName(receipt.input, receipt.workflow.inputDigest),
          status: 'completed',
          conclusion: 'success',
          actor: { login: 'line-owner' },
          triggering_actor: { login: 'line-owner' },
          created_at: TIME,
        }
      return {
        repository: { full_name: context.repo },
        id: 500,
        run_attempt: gate.attempt,
        path: '.github/workflows/gate-publish.yml',
        head_branch: 'github-gate',
        head_sha: TOOL,
        event: 'workflow_dispatch',
        display_title: gateRunName({ pull: 12, candidateHead: candidate.head, checkpoint: '' }),
        status: gate.status,
        conclusion: gate.conclusion,
      }
    }
    if (path.endsWith('/pulls/12'))
      return {
        number: 12,
        html_url: 'https://github.com/owner/repo/pull/12',
        head: { sha: candidate.head },
        base: { ref: 'integration/legacy-refactor', repo: { full_name: context.repo } },
        state: candidate.closed ? 'closed' : 'open',
        merged: candidate.merged,
      }
    if (path.endsWith('/issues/12/events?per_page=100&page=1'))
      return candidate.merged
        ? [
            {
              id: 1001,
              event: 'merged',
              url: 'https://api.github.com/repos/owner/repo/issues/events/1001',
              commit_id: candidate.merge,
              commit_url: `https://api.github.com/repos/owner/repo/commits/${candidate.merge}`,
            },
          ]
        : []
    if (path.includes('/git/ref/heads/'))
      return { ref: 'refs/heads/integration/legacy-refactor', object: { sha: candidate.target } }
    if (path.includes('/compare/')) return { status: candidate.reachable ? 'ahead' : 'diverged' }
    return source.read(args, timeout)
  }
  const sourceText = canonical({ schemaVersion: 1, entries: [] })
  const ports: ReduceIntegrationPorts = {
    call,
    read: call,
    authorityFor: () => ({ policy }),
    gateWorkflowHead: TOOL,
    readEvidence: () => 'actual report',
    verifyCandidateEvidence: (_request, record) => {
      if (record.verification.length === 0) throw new Error('report missing')
    },
    sources: readAcceptanceSourcesRest(
      context.repo,
      { commit: TOOL, path: ACCEPTANCE_SOURCES_PATH, blob: HEAD, digest: digest(sourceText) },
      () => ({
        type: 'file',
        path: ACCEPTANCE_SOURCES_PATH,
        sha: HEAD,
        encoding: 'base64',
        content: Buffer.from(sourceText).toString('base64'),
      }),
    ),
  }
  function claimed(requestId = requests[0]!.input.requestId): RequestStateRecord {
    return {
      ...state(),
      requestId,
      operationId: randomUUID(),
      state: 'claimed',
      writer: { ...state().writer, authorization: taskBinding().dispatch },
      candidateHead: null,
      targetBase: null,
      mergeCommit: null,
      workflow: null,
      verification: [],
      changes: [],
    }
  }
  const input = (record: RequestStateRecord) => ({ record, journalRoot: root, checkpoint: '' })
  function successor(record: RequestStateRecord): RequestStateRecord {
    return {
      ...record,
      operationId: randomUUID(),
      revision: record.revision + 1,
      previousRecordId: sequence,
    }
  }
  return {
    source,
    add,
    requests,
    writes,
    candidate,
    gate,
    ports,
    root,
    evidence,
    claimed,
    input,
    successor,
    drop: () => {
      dropped = true
      lost = true
    },
    lose: () => {
      lost = true
    },
    unavailable: (value: boolean) => {
      unavailable = value
    },
  }
}

describe('reduce authoritative queue and exclusive ownership', () => {
  it.each([false, true])(
    'CLI reads, claims and resumes the same operation; unknown=%s',
    unknown => {
      const f = fixture()
      const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const bootstrap = () => ({
        ...f.ports,
        verifyWaveEvidence: () => {
          throw new Error('No wave report in this request-only scenario')
        },
      })
      const file = join(f.root, 'command.json')
      try {
        writeFileSync(file, JSON.stringify({ schemaVersion: 1, context, owner: 'owner' }))
        expect(reduceMain(['next', '--input', file], bootstrap)).toBe(0)
        expect(f.writes).toHaveLength(0)
        const input = { schemaVersion: 1, ...f.input(f.claimed()) }
        writeFileSync(file, JSON.stringify(input))
        if (unknown) f.drop()
        expect(reduceMain(['claim', '--input', file], bootstrap)).toBe(unknown ? 1 : 0)
        expect(reduceMain(['claim', '--input', file], bootstrap)).toBe(unknown ? 1 : 0)
        expect(f.writes).toHaveLength(1)
        expect(String(stdout.mock.calls.at(-1)?.[0])).toContain(unknown ? 'unknown' : 'confirmed')
      } finally {
        stdout.mockRestore()
      }
    },
  )

  it('refuses unsupported or duplicate CLI inputs before any authority read or write', () => {
    const f = fixture()
    const bootstrap = vi.fn(() => ({ ...f.ports, verifyWaveEvidence: () => {} }))
    const file = join(f.root, 'command.json')
    const input = { schemaVersion: 1, context, owner: 'owner' }
    writeFileSync(file, JSON.stringify({ ...input, adoptedWorkflowHead: TOOL }))
    expect(() => reduceMain(['next', '--input', file], bootstrap)).toThrow('unknown fields')
    writeFileSync(file, JSON.stringify(input))
    expect(() => reduceMain(['next', '--input', file, '--input', file], bootstrap)).toThrow(
      'reduce-one-input-required',
    )
    writeFileSync(file, '{"schemaVersion":1,"schemaVersion":1}')
    expect(() => reduceMain(['next', '--input', file], bootstrap)).toThrow()
    expect(bootstrap).not.toHaveBeenCalled()
    expect(f.writes).toEqual([])
  })
  it('finds the next arrival after more than 200 comments without consuming the first request', () => {
    const f = fixture(true)
    for (let i = 0; i < 205; i++) f.source.comments.push(rawComment(1000 + i, 'ordinary comment'))
    const first = nextReduceRequest(f.ports, { context, owner: 'owner' })
    expect(first.selected?.input.requestId).toBe(f.requests[0]?.input.requestId)
    const claim = f.claimed()
    expect(claimReduceRequest(f.ports, f.input(claim)).kind).toBe('confirmed')
    const receipt = request()
    receipt.input.lineParent = 20
    receipt.input.requestId = randomUUID()
    receipt.workflow.runId = 31
    receipt.workflow.inputDigest = digest(canonical(receipt.input))
    f.add(receipt)
    const second = nextReduceRequest(f.ports, { context, owner: 'owner', since: first.cursor })
    expect(second.selected?.input.requestId).toBe(receipt.input.requestId)
    expect(second.pending).toHaveLength(2)
    expect(second.activeWrite).toBe(claim.requestId)
    const other = { ...f.claimed(receipt.input.requestId), lineParent: 20 }
    expect(() => claimReduceRequest(f.ports, f.input(other))).toThrow(
      'reduce-active-write-conflict',
    )
  })

  it('finds blocked and failed handoffs with null PRs and skips persistently blocked work', () => {
    const f = fixture(true)
    const first = f.requests[0]!
    first.input = {
      ...first.input,
      outcome: 'blocked',
      pull: null,
      reason: 'missing contract',
      remaining: ['finish'],
    }
    first.workflow.inputDigest = digest(canonical(first.input))
    f.source.comments[1]!.body = encodeRecordComment(first)
    expect(nextReduceRequest(f.ports, { context, owner: 'owner' }).selected?.input.outcome).toBe(
      'blocked',
    )
    const blocked = {
      ...f.claimed(),
      state: 'blocked' as const,
      requestHead: null,
      reason: 'owner will resolve contract',
    }
    expect(recordReduceRequest(f.ports, f.input(blocked)).kind).toBe('confirmed')
    const next = request()
    next.input = {
      ...next.input,
      lineParent: 20,
      requestId: randomUUID(),
      outcome: 'failed',
      pull: null,
      reason: 'environment unavailable',
      remaining: ['validate'],
    }
    next.workflow.runId = 31
    next.workflow.inputDigest = digest(canonical(next.input))
    f.add(next)
    expect(nextReduceRequest(f.ports, { context, owner: 'owner' }).selected?.input.outcome).toBe(
      'failed',
    )
    expect(nextReduceRequest(f.ports, { context, owner: 'owner' }).pending).toHaveLength(2)
  })

  it('rejects an authoritative but illegal registered-to-integrating history on recovery', () => {
    const f = fixture()
    const record = {
      ...f.claimed(),
      state: 'integrating' as const,
      candidateHead: HEAD,
      targetBase: BASE,
    }
    f.source.comments.push(rawComment(300, encodeRecordComment(record), TIME))
    expect(() => nextReduceRequest(f.ports, { context, owner: 'owner' })).toThrow(
      'reduce-state-transition-forbidden',
    )
    expect(f.writes).toEqual([])
  })

  it('rejects incomplete pages, forged owner, stale epoch, illegal transitions and concurrent local writers', () => {
    const f = fixture()
    const truncated = {
      ...f.ports,
      read: ((args, timeout) =>
        args.at(-1)?.includes('/comments?') ? [] : f.ports.read(args, timeout)) satisfies GhCommand,
    }
    expect(() => nextReduceRequest(truncated, { context, owner: 'owner' })).toThrow(
      'comments-incomplete',
    )
    expect(() => nextReduceRequest(f.ports, { context, owner: 'someone' })).toThrow(
      'reduce-owner-mismatch',
    )
    expect(() =>
      claimReduceRequest(
        f.ports,
        f.input({ ...f.claimed(), writer: { ...f.claimed().writer, epoch: randomUUID() } }),
      ),
    ).toThrow('reduce-writer-epoch-mismatch')
    expect(() =>
      recordReduceRequest(
        f.ports,
        f.input({ ...f.claimed(), state: 'integrating', candidateHead: HEAD, targetBase: BASE }),
      ),
    ).toThrow('reduce-state-transition-forbidden')
    withReduceLock(f.root, context, randomUUID(), () =>
      expect(() => claimReduceRequest(f.ports, f.input(f.claimed()))).toThrow(
        'reduce-local-writer-conflict',
      ),
    )
    expect(f.writes).toHaveLength(0)
  })
})

describe('reduce mutation crash recovery and exact candidate facts', () => {
  it('recovers claim response loss and never repeats a POST with an unknown result', () => {
    const f = fixture(),
      claim = f.claimed()
    f.lose()
    expect(claimReduceRequest(f.ports, f.input(claim)).kind).toBe('confirmed')
    expect(claimReduceRequest(f.ports, f.input(claim)).kind).toBe('confirmed')
    expect(f.writes).toHaveLength(1)
    const g = fixture(),
      unknown = g.claimed()
    g.drop()
    expect(claimReduceRequest(g.ports, g.input(unknown)).kind).toBe('unknown')
    expect(claimReduceRequest(g.ports, g.input(unknown)).kind).toBe('unknown')
    expect(g.writes).toHaveLength(1)
    expect(() =>
      claimReduceRequest(g.ports, g.input({ ...unknown, operationId: randomUUID() })),
    ).toThrow('reduce-previous-write-outcome-unknown')
  })

  it('requires pre-push intent for changed candidates and recovers the push-to-record crash window', () => {
    const f = fixture(),
      claim = f.claimed()
    claimReduceRequest(f.ports, f.input(claim))
    const candidate = {
      ...f.successor(claim),
      state: 'integrating' as const,
      candidateHead: FINAL,
      targetBase: BASE,
      changes: [f.evidence],
    }
    prepareReduceCandidate(f.ports, f.input(candidate))
    f.candidate.head = FINAL
    expect(recordReduceRequest(f.ports, f.input(candidate)).kind).toBe('confirmed')
    expect(recordReduceRequest(f.ports, f.input(candidate)).kind).toBe('confirmed')
    const external = { ...f.successor(candidate), candidateHead: TOOL }
    f.candidate.head = TOOL
    expect(() => recordReduceRequest(f.ports, f.input(external))).toThrow(
      'reduce-candidate-intent-missing',
    )
    expect(f.writes).toHaveLength(2)
  })

  it('keeps merged false until exact gate, PR and target reachability agree; recovers merge before record', () => {
    const f = fixture(),
      claim = f.claimed()
    claimReduceRequest(f.ports, f.input(claim))
    const integrating = {
      ...f.successor(claim),
      state: 'integrating' as const,
      candidateHead: HEAD,
      targetBase: BASE,
      verification: [f.evidence],
      workflow: {
        path: '.github/workflows/gate-publish.yml',
        ref: 'github-gate',
        head: TOOL,
        runId: 500,
        runAttempt: 1,
        inputDigest: digest(canonical({ pr: '12', head: HEAD, checkpoint: '' })),
      },
    }
    expect(recordReduceRequest(f.ports, f.input(integrating)).kind).toBe('confirmed')
    const merged = { ...f.successor(integrating), state: 'merged' as const, mergeCommit: FINAL }
    expect(() => recordReduceRequest(f.ports, f.input(merged))).toThrow('reduce-pull-not-merged')
    f.candidate.closed = true
    expect(() => recordReduceRequest(f.ports, f.input(merged))).toThrow('reduce-pull-not-merged')
    f.candidate.merged = true
    f.candidate.reachable = false
    expect(() => recordReduceRequest(f.ports, f.input(merged))).toThrow(
      'reduce-merge-not-reachable',
    )
    f.candidate.reachable = true
    f.gate.attempt = 2
    expect(() => recordReduceRequest(f.ports, f.input(merged))).toThrow('reduce-gate-run-mismatch')
    f.gate.attempt = 1
    f.lose()
    expect(recordReduceRequest(f.ports, f.input(merged)).kind).toBe('confirmed')
    expect(recordReduceRequest(f.ports, f.input(merged)).kind).toBe('confirmed')
    expect(f.writes).toHaveLength(3)
    expect(
      recordReduceRequest(
        f.ports,
        f.input({
          ...f.successor(merged),
          state: 'reverted',
          reason: 'target integration reverted',
          changes: [f.evidence],
        }),
      ).kind,
    ).toBe('confirmed')
    expect(
      nextReduceRequest(f.ports, { context, owner: 'owner' }).selected?.current?.record.state,
    ).toBe('reverted')
  })
})

import {
  checkReduceRelease,
  releaseReduceWave,
  type ReduceReleasePorts,
} from '../src/delivery/reduce-integration-release.ts'
import { block, responsibility } from './fixtures/collaboration-authority.ts'
import { RESPONSIBILITY_MARKER } from '../src/delivery/collaboration-acceptance-source.ts'
import {
  encodeReleaseAcceptance,
  type ReleaseAcceptanceDecision,
} from '../src/delivery/collaboration-acceptance.ts'
import type {
  Assignment,
  LineDeltaRecord,
  ReleaseRecord,
} from '../src/delivery/collaboration-records.ts'

function releaseFixture(active = false) {
  const f = fixture()
  f.source.comments.splice(1)
  f.requests.splice(0)
  const ref = (comment: ReturnType<typeof rawComment>, issue = 100) => ({
    issue,
    commentId: comment.id,
    sha256: digest(comment.body),
  })
  const grant = rawComment(
    90,
    block(RESPONSIBILITY_MARKER, {
      schemaVersion: 1,
      issue: taskBinding().issue,
      revision: 1,
      fieldSha256: digest(responsibility),
      owner: { login: 'owner', nodeId: 'U_owner' },
      acceptor: { login: 'acceptor', nodeId: 'U_acceptor' },
      basis: [f.evidence],
    }),
    '2026-10-27T08:00:00Z',
  )
  f.source.comments.push(grant)
  const s = scope()
  s.acceptanceResponsibility = {
    fieldSha256: digest(responsibility),
    owner: 'owner',
    acceptor: 'acceptor',
    authorization: ref(grant),
  }
  f.source.comments[0] = dispatch(taskBinding(), s)
  const writer = f.claimed(request().input.requestId).writer
  const assignment: Assignment = active
    ? {
        ...request().input,
        context,
        lineParent: 10,
        finalHead: BASE,
        inputs: [f.evidence],
        acceptance: [f.evidence],
        toolRevision: TOOL,
        rolePolicyVersion: '820',
        mode: 'active',
        tasks: request().input.tasks,
      }
    : {
        context,
        lineParent: 10,
        finalHead: BASE,
        inputs: [f.evidence],
        acceptance: [f.evidence],
        toolRevision: TOOL,
        rolePolicyVersion: '820',
        mode: 'idle',
        tasks: [],
      }
  const assignmentRecord = {
    schemaVersion: 1 as const,
    kind: 'assignment' as const,
    operationId: randomUUID(),
    writer,
    assignment: {
      context: assignment.context,
      lineParent: assignment.lineParent,
      finalHead: assignment.finalHead,
      inputs: assignment.inputs,
      acceptance: assignment.acceptance,
      toolRevision: assignment.toolRevision,
      rolePolicyVersion: assignment.rolePolicyVersion,
      ...(assignment.mode === 'active'
        ? { mode: 'active' as const, tasks: assignment.tasks }
        : { mode: 'idle' as const, tasks: [] as [] }),
    },
    recordedAt: '2026-10-27T09:01:00Z',
  }
  const parentComment = (id: number, body: string, time: string) => ({
    ...rawComment(id, body, time),
    html_url: `https://github.com/owner/repo/issues/10#issuecomment-${id}`,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/10',
  })
  const parent = {
    number: 10,
    node_id: 'I_10',
    html_url: 'https://github.com/owner/repo/issues/10',
    state: 'open',
    body: '',
    updated_at: '2026-10-27T12:00:00Z',
    labels: [],
    milestone: { number: 1, title: 'Fixture milestone' },
  }
  const comments = [parentComment(5, encodeRecordComment(assignmentRecord), '2026-10-27T09:01:00Z')]
  const delta: LineDeltaRecord = {
    schemaVersion: 1,
    kind: 'delta',
    context,
    lineParent: 10,
    operationId: randomUUID(),
    revision: 1,
    previousRecordId: null,
    writer,
    finalHead: FINAL,
    integrationResults: [],
    changes: [f.evidence],
    externalChanges: [],
    migrations: [],
    toolRevision: TOOL,
    rolePolicyVersion: '820',
    continuation: {
      kind: 'terminal',
      reason: 'authorized end of milestone',
      authorization: f.evidence,
    },
    recordedAt: TIME,
    purpose: 'release',
    newRequestId: null,
  }
  const deltaComment = parentComment(24, encodeRecordComment(delta), TIME)
  comments.push(deltaComment)
  const release: ReleaseRecord = {
    schemaVersion: 1,
    kind: 'release',
    context,
    operationId: randomUUID(),
    writer,
    finalHead: FINAL,
    expectedRequests: [],
    results: [],
    acceptance: f.evidence,
    lines: [{ lineParent: 10, delta: ref(deltaComment, 10), continuation: delta.continuation }],
    next: null,
    recordedAt: '2026-10-27T11:00:00Z',
  }
  const decision: ReleaseAcceptanceDecision = {
    schemaVersion: 1,
    issue: taskBinding().issue,
    revision: 1,
    attempt: taskBinding().attempt,
    operationId: randomUUID(),
    decision: 'accept',
    decider: { login: 'acceptor', nodeId: 'U_acceptor' },
    authorization: ref(grant),
    subject: {
      context,
      finalHead: FINAL,
      expectedRequests: [],
      results: [],
      lines: release.lines,
      next: null,
    },
    basis: [f.evidence],
    remaining: [],
    previous: null,
    recordedAt: '2026-10-27T10:30:00Z',
  }
  const accepted = rawComment(
    40,
    encodeReleaseAcceptance(decision),
    decision.recordedAt,
    'acceptor',
  )
  f.source.comments.push(accepted)
  release.acceptance = {
    url: accepted.html_url,
    sha256: digest(accepted.body),
    description: 'Explicit acceptance after all line deltas',
  }
  const sourceText = canonical({
    schemaVersion: 1,
    entries: [
      {
        issue: taskBinding().issue,
        revision: 1,
        authorization: ref(grant),
        authorNodeId: 'U_owner',
      },
    ],
  })
  const writes: string[] = [],
    events: { id: number; event: string; created_at: string }[] = []
  let publicationLost = false,
    closureLost = false,
    publicationDropped = false,
    closureDropped = false
  const call: GhCommand = (args, timeout) => {
    const path = args.find(item => item.startsWith('repos/')) ?? args.at(-1) ?? ''
    if (args[2] === 'POST') {
      writes.push('publish')
      if (!publicationDropped)
        f.source.comments.push(rawComment(50, args.at(-1)?.slice(5) ?? '', release.recordedAt))
      if (publicationLost) throw new Error('publication response lost')
      return { id: 50 }
    }
    if (args[2] === 'PATCH') {
      writes.push('close')
      expect(f.source.comments.some(item => item.id === 50)).toBe(true)
      if (!closureDropped) {
        f.source.data.state = 'closed'
        events.push({ id: 60, event: 'closed', created_at: '2026-10-27T11:01:00Z' })
      }
      if (closureLost) throw new Error('closure response lost')
      return { state: 'closed' }
    }
    if (path === 'repos/owner/repo/issues/10') return { ...parent, comments: comments.length }
    if (path.includes('/issues/10/comments?')) return comments
    if (path.includes('/issues/100/events?')) return events
    const id = /issues\/comments\/(\d+)$/.exec(path)
    if (id !== null) {
      const found = comments.find(item => item.id === Number(id[1]))
      if (found !== undefined) return found
    }
    return f.ports.read(args, timeout)
  }
  const ports: ReduceReleasePorts = {
    ...f.ports,
    read: call,
    call,
    verifyWaveEvidence: vi.fn(),
    sources: readAcceptanceSourcesRest(
      context.repo,
      { commit: TOOL, path: ACCEPTANCE_SOURCES_PATH, blob: HEAD, digest: digest(sourceText) },
      () => ({
        type: 'file',
        path: ACCEPTANCE_SOURCES_PATH,
        sha: HEAD,
        encoding: 'base64',
        content: Buffer.from(sourceText).toString('base64'),
      }),
    ),
  }
  return {
    ...f,
    ports,
    release,
    decision,
    accepted,
    delta,
    comments,
    events,
    writes,
    input: { record: release, journalRoot: f.root, readinessEvidence: f.evidence },
    losePublication: (drop = false) => {
      publicationLost = true
      publicationDropped = drop
    },
    loseClosure: (drop = false) => {
      closureLost = true
      closureDropped = drop
    },
  }
}

describe('release material guards and ordered durable side effects', () => {
  it('reads a complete idle-line delta and accepted terminal decision before publishing then closing', () => {
    const f = releaseFixture()
    expect(releaseReduceWave(f.ports, f.input).kind).toBe('confirmed')
    expect(f.writes).toEqual(['publish', 'close'])
    expect(releaseReduceWave(f.ports, f.input).kind).toBe('confirmed')
    expect(f.writes).toEqual(['publish', 'close'])
  })
  it('recovers the release-publication and closure response-loss crash windows without repeating either effect', () => {
    const f = releaseFixture()
    f.losePublication()
    f.loseClosure()
    expect(releaseReduceWave(f.ports, f.input).kind).toBe('confirmed')
    expect(releaseReduceWave(f.ports, f.input).kind).toBe('confirmed')
    expect(f.writes).toEqual(['publish', 'close'])
  })
  it('recovers an already accepted and closed release after later work moves the target track', () => {
    const f = releaseFixture()
    const first = releaseReduceWave(f.ports, f.input)
    expect(first.kind).toBe('confirmed')
    f.ports.verifyWaveEvidence = () => {
      throw new Error('reduce-wave-target-head-changed')
    }
    expect(releaseReduceWave(f.ports, f.input)).toEqual(first)
    expect(f.writes).toEqual(['publish', 'close'])
  })
  it('still rejects altered acceptance while recovering a completed release', () => {
    const f = releaseFixture()
    expect(releaseReduceWave(f.ports, f.input).kind).toBe('confirmed')
    f.accepted.body += '\nchanged after acceptance'
    expect(() => releaseReduceWave(f.ports, f.input)).toThrow()
    expect(f.writes).toEqual(['publish', 'close'])
  })
  it('keeps an absent attempted publication unknown instead of posting another release', () => {
    const f = releaseFixture()
    f.losePublication(true)
    expect(releaseReduceWave(f.ports, f.input)).toMatchObject({ kind: 'unknown', phase: 'publish' })
    expect(releaseReduceWave(f.ports, f.input)).toMatchObject({ kind: 'unknown', phase: 'publish' })
    expect(() =>
      releaseReduceWave(f.ports, {
        ...f.input,
        record: { ...f.release, operationId: randomUUID() },
      }),
    ).toThrow('reduce-previous-release-attempt-exists')
    expect(f.writes).toEqual(['publish'])
  })
  it('keeps an absent attempted close unknown and rejects a reopened release', () => {
    const f = releaseFixture()
    f.loseClosure(true)
    expect(releaseReduceWave(f.ports, f.input)).toMatchObject({ kind: 'unknown', phase: 'close' })
    expect(releaseReduceWave(f.ports, f.input)).toMatchObject({ kind: 'unknown', phase: 'close' })
    expect(f.writes).toEqual(['publish', 'close'])
    f.source.data.state = 'closed'
    f.events.push({ id: 61, event: 'reopened', created_at: '2026-10-27T11:02:00Z' })
    expect(() => releaseReduceWave(f.ports, f.input)).toThrow('watch-closure-not-after-release')
  })
  it('refuses an omitted idle delta, missing current assignment, or active line without a delivery', () => {
    const f = releaseFixture()
    f.comments.splice(1)
    expect(() => checkReduceRelease(f.ports, f.release, f.evidence)).toThrow(
      'reduce-release-delta-missing',
    )
    const g = releaseFixture()
    g.comments.splice(0, 1)
    expect(() => checkReduceRelease(g.ports, g.release, g.evidence)).toThrow(
      'reduce-roster-assignment-missing',
    )
    const h = releaseFixture(true)
    expect(() => checkReduceRelease(h.ports, h.release, h.evidence)).toThrow(
      'reduce-release-expected-delivery-pending',
    )
    expect([...f.writes, ...g.writes, ...h.writes]).toEqual([])
  })
  it('rejects a release dated before acceptance without publishing or closing', () => {
    const f = releaseFixture()
    f.release.recordedAt = '2026-10-27T10:00:00Z'
    expect(() => releaseReduceWave(f.ports, f.input)).toThrow('reduce-release-before-acceptance')
    expect(f.writes).toEqual([])
  })

  it('does not publish when whole-wave evidence fails or acceptance does not exactly match the release', () => {
    const f = releaseFixture()
    f.ports.verifyWaveEvidence = () => {
      throw new Error('whole-wave-check-failed')
    }
    expect(() => releaseReduceWave(f.ports, f.input)).toThrow('whole-wave-check-failed')
    const g = releaseFixture()
    g.decision.subject.finalHead = HEAD
    g.accepted.body = encodeReleaseAcceptance(g.decision)
    g.release.acceptance.sha256 = digest(g.accepted.body)
    expect(() => releaseReduceWave(g.ports, g.input)).toThrow('Accepted release subject differs')
    expect([...f.writes, ...g.writes]).toEqual([])
  })
})

import {
  reduceLocalSupervisionSources,
  reduceSupervisionSources,
} from '../src/delivery/reduce-supervise-sources.ts'
import type { SuperviseInput } from '../src/delivery/reduce-supervise.ts'

describe('supervision production readers over simulated REST', () => {
  function setup(f: ReturnType<typeof fixture>) {
    const file = join(f.root, 'events.jsonl')
    writeFileSync(file, '')
    const input: SuperviseInput = {
      context,
      owner: 'owner',
      epoch: f.claimed().writer.epoch,
      operationId: randomUUID(),
      journalRoot: f.root,
      phase: 'SERVE',
      deadline: '2026-10-27T11:00:00Z',
    }
    return { file, input }
  }
  it('observes request success without a receipt, stops polling completed runs and preserves configured deadline meaning', async () => {
    const f = fixture(),
      { file, input } = setup(f),
      receipt = f.requests[0]!
    f.source.comments.splice(1)
    const sources = reduceSupervisionSources(input, f.ports, {
      file,
      runs: [{ kind: 'request-run', input: receipt.input, workflow: receipt.workflow }],
      candidates: [],
      local: [],
      release: async () => [],
    })
    expect((await sources.pollActiveRuns())[0]?.reasonCode).toBe('request-success-receipt-missing')
    const calls = f.source.calls.length
    expect(await sources.pollActiveRuns()).toEqual([])
    expect(f.source.calls.length).toBe(calls)
    expect((await sources.deadline())[0]?.reasonCode).toBe('configured-deadline-reached')
    expect((await sources.health())[0]?.signalKind).toBe('infrastructure')
  })
  it('returns approval facts through read-only endpoints and never approves a deployment', async () => {
    const f = fixture(),
      { file, input } = setup(f)
    f.gate.status = 'waiting'
    const calls: string[][] = []
    const read: GhCommand = (args, timeout) => {
      calls.push([...args])
      if (args.at(-1)?.endsWith('/pending_deployments'))
        return [{ environment: { id: 9, name: 'publish' }, current_user_can_approve: true }]
      if (args.at(-1)?.endsWith('/approvals'))
        return [{ state: 'approved', user: { login: 'owner' } }]
      return f.ports.read(args, timeout)
    }
    const sources = reduceSupervisionSources(
      input,
      { ...f.ports, read },
      {
        file,
        runs: [
          {
            kind: 'gate',
            correlation: {
              repo: context.repo,
              pull: 12,
              candidateHead: HEAD,
              checkpoint: '',
              adoptedWorkflowHead: TOOL,
              workflow: {
                path: '.github/workflows/gate-publish.yml',
                ref: 'github-gate',
                head: TOOL,
                runId: 500,
                runAttempt: 1,
                inputDigest: digest(canonical({ pr: '12', head: HEAD, checkpoint: '' })),
              },
            },
          },
        ],
        candidates: [],
        local: [],
        release: async () => [],
      },
    )
    expect((await sources.pollActiveRuns()).map(item => item.reasonCode)).toEqual([
      'gate-approval-required',
      'gate-approved-readback',
    ])
    const before = f.source.calls.length
    await sources.pollActiveRuns()
    expect(f.source.calls.length).toBe(before)
    expect(calls.every(args => args[2] === 'GET')).toBe(true)
  })
  it('reconciles a receipt that arrived after the active request run was first observed', async () => {
    const f = fixture(),
      { file, input } = setup(f),
      receipt = f.requests[0]!
    const comment = f.source.comments.pop()!
    let completed = false
    const read: GhCommand = (args, timeout) => {
      const result = f.ports.read(args, timeout)
      if (
        args.at(-1)?.includes(`/runs/${receipt.workflow.runId}/`) &&
        typeof result === 'object' &&
        result !== null
      )
        return {
          ...result,
          status: completed ? 'completed' : 'in_progress',
          conclusion: completed ? 'success' : null,
        }
      return result
    }
    const sources = reduceSupervisionSources(
      input,
      { ...f.ports, read },
      {
        file,
        runs: [{ kind: 'request-run', input: receipt.input, workflow: receipt.workflow }],
        candidates: [],
        local: [],
        release: async () => [],
      },
    )
    expect(await sources.pollActiveRuns()).toEqual([])
    f.source.comments.push(comment)
    completed = true
    expect((await sources.pollActiveRuns())[0]?.reasonCode).toBe('request-registered')
  })
  it('reports a foreign candidate head, current-head failing checks and applicable change requests', async () => {
    const f = fixture(),
      { file, input } = setup(f),
      claim = f.claimed()
    claimReduceRequest(f.ports, f.input(claim))
    const record = {
      ...f.successor(claim),
      state: 'integrating' as const,
      candidateHead: HEAD,
      targetBase: BASE,
    }
    recordReduceRequest(f.ports, f.input(record))
    f.candidate.head = TOOL
    const read: GhCommand = (args, timeout) => {
      const path = args.at(-1) ?? ''
      if (path.includes('/check-runs?'))
        return {
          total_count: 1,
          check_runs: [
            {
              id: 5,
              head_sha: HEAD,
              status: 'completed',
              conclusion: 'failure',
              html_url: 'https://github.com/owner/repo/check/5',
            },
          ],
        }
      if (path.includes('/reviews?'))
        return [
          {
            id: 6,
            commit_id: HEAD,
            state: 'CHANGES_REQUESTED',
            html_url: 'https://github.com/owner/repo/pull/12#review-6',
          },
        ]
      return f.ports.read(args, timeout)
    }
    const sources = reduceSupervisionSources(
      input,
      { ...f.ports, read },
      {
        file,
        runs: [],
        candidates: [{ request: f.requests[0]!.input, record }],
        local: [],
        release: async () => [],
      },
    )
    expect((await sources.reconcile()).map(item => item.reasonCode)).toEqual([
      'candidate-check-failed',
      'candidate-review-requires-disposition',
      'candidate-external-head',
    ])
  })
  it('reports owned local work outputs and refuses a damaged event log rather than sleeping silently', async () => {
    const f = fixture(),
      { file, input } = setup(f),
      resultFile = join(f.root, 'result.txt')
    writeFileSync(resultFile, 'exitCode=1: check failed')
    const sources = reduceLocalSupervisionSources(input, {
      file,
      runs: [],
      candidates: [],
      local: [
        {
          id: 'test-run',
          pid: process.pid,
          processStartedAt: 'unused once result exists',
          resultFile,
          deadline: input.deadline,
        },
      ],
    })
    expect(
      (await sources.health()).find(item => item.signalKind === 'local-work')?.observed,
    ).toContain('check failed')
    appendFileSync(file, '{corrupt}\n')
    const errors: unknown[] = []
    const subscription = sources.subscribe(
      () => {},
      error => errors.push(error),
    )
    subscription.close()
    expect(errors[0]).toBeInstanceOf(Error)
  })
})

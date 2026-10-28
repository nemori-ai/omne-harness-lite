import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { realpathSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git, blob } from '../src/integration/git.ts'
import { digest } from '../src/integration/parse.ts'
import type { PolicySource } from '../src/integration/context.ts'
import { readCollaborationAuthority } from '../src/delivery/collaboration-authority.ts'
import { STOP_MARKER } from '../src/delivery/collaboration-scope.ts'
import { commentDigest, encodeRecordComment } from '../src/delivery/collaboration-comments.ts'
import {
  encodeReleaseAcceptance,
  parseReleaseAcceptance,
  readReleaseAcceptance,
  type ReleaseAcceptanceDecision,
} from '../src/delivery/collaboration-acceptance.ts'
import {
  ACCEPTANCE_SOURCES_PATH,
  MILESTONE_MANDATE_MARKER,
  RESPONSIBILITY_MARKER,
  RESPONSIBILITY_REVOCATION,
  readAcceptanceSources,
  readAcceptanceSourcesRest,
  readAcceptanceResponsibility,
  type AcceptanceResponsibility,
} from '../src/delivery/collaboration-acceptance-source.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import {
  backend,
  block,
  dispatch,
  policy,
  rawComment,
  responsibility,
  scope,
  taskBinding,
} from './fixtures/collaboration-authority.ts'
import { delta, evidence, release, state, UUID, NEXT_UUID, TIME } from './fixtures/collaboration.ts'

function fixture() {
  const binding = taskBinding()
  const declaration: AcceptanceResponsibility = {
    schemaVersion: 1,
    issue: binding.issue,
    revision: 1,
    fieldSha256: digest(responsibility),
    owner: { login: 'owner', nodeId: 'U_owner' },
    acceptor: { login: 'acceptor', nodeId: 'U_acceptor' },
    basis: [evidence],
  }
  const sourceComment = rawComment(
    2,
    block(RESPONSIBILITY_MARKER, declaration),
    '2026-10-27T08:30:00Z',
  )
  const authorization = { issue: 100, commentId: 2, sha256: commentDigest(sourceComment.body) }
  const adoptedScope = scope()
  adoptedScope.acceptanceResponsibility = {
    fieldSha256: declaration.fieldSha256,
    owner: 'owner',
    acceptor: 'acceptor',
    authorization,
  }
  const result = state()
  result.writer.authorization = binding.dispatch
  const resultComment = rawComment(23, encodeRecordComment(result), TIME)
  const resultRef = { issue: 100, commentId: 23, sha256: commentDigest(resultComment.body) }
  const lineDelta = delta()
  lineDelta.writer.authorization = binding.dispatch
  lineDelta.integrationResults = [resultRef]
  const deltaComment = {
    ...rawComment(24, encodeRecordComment(lineDelta), '2026-10-27T10:01:00Z'),
    html_url: 'https://github.com/owner/repo/issues/10#issuecomment-24',
    issue_url: 'https://api.github.com/repos/owner/repo/issues/10',
  }
  const { context, finalHead, expectedRequests, lines, next } = release()
  lines[0]!.delta.sha256 = commentDigest(deltaComment.body)
  const decision: ReleaseAcceptanceDecision = {
    schemaVersion: 1,
    issue: binding.issue,
    revision: 1,
    attempt: binding.attempt,
    operationId: UUID,
    decision: 'accept',
    decider: declaration.acceptor,
    authorization,
    subject: { context, finalHead, expectedRequests, results: [resultRef], lines, next },
    basis: [evidence],
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
  const source = backend(binding, [
    dispatch(binding, adoptedScope),
    sourceComment,
    resultComment,
    accepted,
  ])
  const lineComments = [deltaComment]
  const read: GhRead = (args, timeout) => {
    const path = args.at(-1) ?? ''
    const id = /issues\/comments\/(\d+)$/.exec(path)?.[1]
    if (id !== undefined) {
      const found = lineComments.find(comment => comment.id === Number(id))
      if (found !== undefined) return found
    }
    const line = /issues\/(10|20)(?:\/comments\?per_page=100&page=(\d+))?$/.exec(path)
    if (line !== null) {
      const number = Number(line[1])
      const comments = lineComments.filter(comment =>
        comment.issue_url.endsWith(`/issues/${number}`),
      )
      if (line[2] === undefined)
        return {
          number,
          html_url: `https://github.com/owner/repo/issues/${number}`,
          body: '',
          state: 'open',
          milestone: { number: 1 },
          updated_at: TIME,
          comments: comments.length,
        }
      const page = Number(line[2])
      return comments.slice((page - 1) * 100, page * 100)
    }
    return source.read(args, timeout)
  }
  const reference = () => ({
    issue: 100,
    commentId: accepted.id,
    sha256: commentDigest(accepted.body),
  })
  return {
    ...source,
    read,
    declaration,
    sourceComment,
    authorization,
    result,
    resultComment,
    deltaComment,
    lineDelta,
    lineComments,
    decision,
    accepted,
    reference,
    adoptedScope,
    input: () => ({
      policy,
      reduceIssue: 100,
      read,
      sources: readAcceptanceSources(root, pinned),
      reference: reference(),
      subject: decision.subject,
    }),
    rewrite: () => {
      accepted.body = encodeReleaseAcceptance(decision)
    },
  }
}

let root: string
let pinned: PolicySource
beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-acceptance-')))
  git(root, ['init', '--quiet'])
  git(root, ['config', 'user.name', 'Fixture'])
  git(root, ['config', 'user.email', 'fixture@example.invalid'])
  git(root, ['config', 'core.hooksPath', '/dev/null'])
  const f = fixture()
  mkdirSync(join(root, 'docs/engineering'), { recursive: true })
  writeFileSync(
    join(root, ACCEPTANCE_SOURCES_PATH),
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        {
          issue: taskBinding().issue,
          revision: 1,
          authorization: f.authorization,
          authorNodeId: 'U_owner',
        },
      ],
    }),
  )
  git(root, ['add', '.'])
  git(root, ['commit', '--quiet', '-m', 'Adopt fixture responsibility'])
  const commit = git(root, ['rev-parse', 'HEAD'])
  const file = blob(root, commit, ACCEPTANCE_SOURCES_PATH)
  pinned = { commit, path: ACCEPTANCE_SOURCES_PATH, blob: file.oid, digest: digest(file.text) }
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('adopted acceptance sources', () => {
  it('refuses a mandate revoked after current authorization but before the decision read completes', () => {
    const f = fixture()
    const onSource = (comment: ReturnType<typeof rawComment>) => ({
      ...comment,
      html_url: `https://github.com/owner/repo/issues/90#issuecomment-${comment.id}`,
      issue_url: 'https://api.github.com/repos/owner/repo/issues/90',
    })
    const grant = onSource(
      rawComment(
        90,
        block(MILESTONE_MANDATE_MARKER, {
          schemaVersion: 1,
          repository: 'owner/repo',
          milestone: 1,
          owner: f.declaration.owner,
          acceptor: f.declaration.acceptor,
          declarationAuthor: { login: 'owner', nodeId: 'U_owner' },
          basis: [evidence],
        }),
        '2026-10-27T08:00:00Z',
      ),
    )
    const authorization = { issue: 90, commentId: 90, sha256: digest(grant.body) }
    const text = JSON.stringify({
      schemaVersion: 2,
      entries: [],
      mandates: [
        {
          issue: {
            repository: 'owner/repo',
            number: 90,
            id: 'I_90',
            url: 'https://github.com/owner/repo/issues/90',
          },
          authorization,
          authorNodeId: 'U_owner',
        },
      ],
    })
    const source = { ...pinned, digest: digest(text) }
    const sources = readAcceptanceSourcesRest('owner/repo', source, () => ({
      type: 'file',
      path: source.path,
      sha: source.blob,
      encoding: 'base64',
      content: Buffer.from(text).toString('base64'),
    }))
    const comments = [grant]
    let revoked = false
    const read: GhRead = (args, timeout) => {
      const path = args.at(-1)
      if (!revoked && path === `repos/owner/repo/issues/comments/${f.accepted.id}`) {
        revoked = true
        comments.push(
          onSource(
            rawComment(
              92,
              block(RESPONSIBILITY_REVOCATION, {
                schemaVersion: 1,
                authorization,
                basis: [evidence],
              }),
              '2026-10-27T11:00:00Z',
              'acceptor',
            ),
          ),
        )
      }
      if (path === 'repos/owner/repo/issues/90')
        return {
          number: 90,
          node_id: 'I_90',
          html_url: 'https://github.com/owner/repo/issues/90',
          body: '',
          state: 'open',
          labels: [],
          milestone: { number: 1, title: 'Fixture milestone' },
          updated_at: '2026-10-27T12:00:00Z',
          comments: comments.length,
        }
      if (path?.startsWith('repos/owner/repo/issues/90/comments?')) return comments
      const single = comments.find(
        comment => path === `repos/owner/repo/issues/comments/${comment.id}`,
      )
      return single ?? f.read(args, timeout)
    }
    expect(() => readReleaseAcceptance({ ...f.input(), sources, read })).toThrow('mandate-revoked')
    expect(revoked).toBe(true)
  })

  it('loads the explicitly pinned source, independently of dirty files or candidate HEAD', () => {
    writeFileSync(
      join(root, ACCEPTANCE_SOURCES_PATH),
      JSON.stringify({ schemaVersion: 1, entries: [] }),
    )
    git(root, ['add', '.'])
    git(root, ['commit', '--quiet', '-m', 'Unadopted candidate removes source'])
    expect(readAcceptanceSources(root, pinned).entries).toHaveLength(1)
    expect(() =>
      readAcceptanceSources(root, { ...pinned, commit: git(root, ['rev-parse', 'HEAD']) }),
    ).toThrow('source-changed')
  })

  it('refuses arbitrary paths, symbolic revisions and altered source digests', () => {
    expect(() => readAcceptanceSources(root, { ...pinned, path: 'local.json' })).toThrow(
      'source-path',
    )
    expect(() => readAcceptanceSources(root, { ...pinned, commit: 'HEAD' })).toThrow()
    expect(() => readAcceptanceSources(root, { ...pinned, digest: '0'.repeat(64) })).toThrow(
      'source-changed',
    )
  })

  it('reads a responsibility only when declaration, current card and adopted source agree', () => {
    const f = fixture()
    const authority = readCollaborationAuthority({ policy, reduceIssue: 100, read: f.read })
    expect(
      readAcceptanceResponsibility(authority, readAcceptanceSources(root, pinned), f.read).acceptor,
    ).toEqual(f.declaration.acceptor)
  })

  it('does not grant accepting rights to a reviewer who publishes a self-authorized replacement', () => {
    const f = fixture()
    f.declaration.acceptor = f.declaration.owner
    f.sourceComment.body = block(RESPONSIBILITY_MARKER, f.declaration)
    f.adoptedScope.acceptanceResponsibility!.acceptor = 'owner'
    f.adoptedScope.acceptanceResponsibility!.authorization.sha256 = commentDigest(
      f.sourceComment.body,
    )
    f.comments[0] = dispatch(taskBinding(), f.adoptedScope)
    expect(() => readReleaseAcceptance(f.input())).toThrow('Accepted responsibility source differs')
  })

  it('rejects a source with the expected login but another account node ID', () => {
    const f = fixture()
    f.sourceComment.user.node_id = 'U_impostor'
    expect(() => readReleaseAcceptance(f.input())).toThrow('source-author')
  })

  it('rejects explicit revocation of the adopted responsibility', () => {
    const f = fixture()
    f.comments.push(
      rawComment(
        50,
        block(RESPONSIBILITY_REVOCATION, {
          schemaVersion: 1,
          authorization: f.authorization,
          basis: [evidence],
        }),
        '2026-10-27T11:00:00Z',
      ),
    )
    expect(() => readReleaseAcceptance(f.input())).toThrow('responsibility-revoked')
  })
})

describe('release acceptance readback', () => {
  it('verifies the adopted acceptor, exact subject and all pre-existing result and delta bytes', () => {
    const f = fixture()
    expect(readReleaseAcceptance(f.input())).toMatchObject({
      decision: f.decision,
      reference: f.reference(),
    })
  })

  it('rejects a partial decision and a declared accept with missing scope', () => {
    const f = fixture()
    f.decision.decision = 'partial'
    f.decision.remaining = ['Unverified host']
    f.rewrite()
    expect(() => readReleaseAcceptance(f.input())).toThrow('release-not-accepted')
    f.decision.decision = 'accept'
    expect(() => f.rewrite()).toThrow('acceptance-incomplete')
  })

  it('rejects unknown machine fields, changed human text and duplicate fields', () => {
    const f = fixture()
    expect(() =>
      parseReleaseAcceptance(
        f.accepted.body.replace('"schemaVersion":1', '"schemaVersion":1,"unexpected":true'),
      ),
    ).toThrow()
    expect(() =>
      parseReleaseAcceptance(f.accepted.body.replace('- 决定：accept', '- 决定：revoke')),
    ).toThrow('prose-conflict')
    expect(() =>
      parseReleaseAcceptance(
        f.accepted.body.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
      ),
    ).toThrow()
  })

  it('rejects a correctly signed decision for a different final head', () => {
    const f = fixture()
    const input = f.input()
    input.subject = {
      ...input.subject,
      finalHead: 'f'.repeat(40),
      lines: input.subject.lines.map(line => ({
        ...line,
        continuation: { kind: 'idle', next: input.subject.next!, reason: 'Fixture' },
      })),
    }
    expect(() => readReleaseAcceptance(input)).toThrow('Accepted release subject differs')
  })

  it('rejects missing idle participants even when the accepting account signed the reduced subject', () => {
    const f = fixture()
    f.adoptedScope.lines.push({ lineParent: 20, login: 'idle-owner' })
    f.comments[0] = dispatch(taskBinding(), f.adoptedScope)
    expect(() => readReleaseAcceptance(f.input())).toThrow('omits participating lines')
  })

  it('accepts active and idle participants only with both complete delta chains', () => {
    const f = fixture()
    f.adoptedScope.lines.push({ lineParent: 20, login: 'idle-owner' })
    f.comments[0] = dispatch(taskBinding(), f.adoptedScope)
    const continuation = {
      kind: 'idle' as const,
      next: f.decision.subject.next!,
      reason: 'No task in next wave',
    }
    const body = encodeRecordComment({
      ...f.lineDelta,
      lineParent: 20,
      operationId: NEXT_UUID,
      continuation,
    })
    f.lineComments.push({
      ...rawComment(25, body, '2026-10-27T10:02:00Z'),
      html_url: 'https://github.com/owner/repo/issues/20#issuecomment-25',
      issue_url: 'https://api.github.com/repos/owner/repo/issues/20',
    })
    f.decision.subject.lines.push({
      lineParent: 20,
      delta: { issue: 20, commentId: 25, sha256: commentDigest(body) },
      continuation,
    })
    f.rewrite()
    expect(readReleaseAcceptance(f.input()).decision.subject.lines).toHaveLength(2)
  })

  it('accepts an explicitly terminal subject without inventing another reduce card', () => {
    const f = fixture()
    const continuation = {
      kind: 'terminal' as const,
      reason: 'Milestone complete',
      authorization: evidence,
    }
    f.lineDelta.continuation = continuation
    f.deltaComment.body = encodeRecordComment(f.lineDelta)
    f.decision.subject.lines[0]!.delta.sha256 = commentDigest(f.deltaComment.body)
    f.decision.subject.lines[0]!.continuation = continuation
    f.decision.subject.next = null
    f.rewrite()
    expect(readReleaseAcceptance(f.input()).decision.subject.next).toBeNull()
  })

  it('rejects an old attempt, another decider, and edits to an accepted comment', () => {
    const old = fixture()
    old.decision.attempt = '100-r1-old'
    old.rewrite()
    expect(() => readReleaseAcceptance(old.input())).toThrow('attempt differs')
    const other = fixture()
    other.decision.decider = { login: 'owner', nodeId: 'U_owner' }
    other.accepted.user = { login: 'owner', node_id: 'U_owner', type: 'User' }
    other.rewrite()
    expect(() => readReleaseAcceptance(other.input())).toThrow('no adopted authority')
    const edited = fixture()
    edited.accepted.updated_at = '2026-10-27T11:00:00Z'
    expect(() => readReleaseAcceptance(edited.input())).toThrow('decision-edited')
  })

  it('rejects edited delta bytes and evidence created after the decision', () => {
    const edited = fixture()
    edited.deltaComment.body += '\n'
    expect(() => readReleaseAcceptance(edited.input())).toThrow('digest-mismatch')
    const late = fixture()
    late.deltaComment.updated_at = '2026-10-27T11:00:00Z'
    expect(() => readReleaseAcceptance(late.input())).toThrow('evidence-after-decision')
  })

  it('rejects pending or subsequently reverted results', () => {
    const pending = fixture()
    pending.result.state = 'integrating'
    pending.resultComment.body = encodeRecordComment(pending.result)
    pending.decision.subject.results[0]!.sha256 = commentDigest(pending.resultComment.body)
    pending.rewrite()
    expect(() => readReleaseAcceptance(pending.input())).toThrow('result-pending')
    const reverted = fixture()
    reverted.comments.push(
      rawComment(
        51,
        encodeRecordComment({
          ...reverted.result,
          operationId: UUID,
          revision: 2,
          previousRecordId: 23,
          state: 'reverted',
        }),
        '2026-10-27T11:00:00Z',
      ),
    )
    expect(() => readReleaseAcceptance(reverted.input())).toThrow('no longer current')
  })

  it('reads a revocation chain and refuses both the revoked reference and the non-accepting head', () => {
    const f = fixture()
    const revoke: ReleaseAcceptanceDecision = {
      ...f.decision,
      decision: 'revoke',
      operationId: NEXT_UUID,
      previous: f.reference(),
      recordedAt: '2026-10-27T11:00:00Z',
    }
    const comment = rawComment(50, encodeReleaseAcceptance(revoke), revoke.recordedAt, 'acceptor')
    f.comments.push(comment)
    expect(() => readReleaseAcceptance(f.input())).toThrow('reference-not-current')
    expect(() =>
      readReleaseAcceptance({
        ...f.input(),
        reference: { issue: 100, commentId: 50, sha256: commentDigest(comment.body) },
      }),
    ).toThrow('release-not-accepted')
  })

  it('observes a newer-revision revocation before the card body catches up', () => {
    const f = fixture()
    const revoked: ReleaseAcceptanceDecision = {
      ...f.decision,
      decision: 'revoke',
      revision: 2,
      attempt: '100-r2-a1',
      operationId: NEXT_UUID,
      previous: f.reference(),
      recordedAt: '2026-10-27T11:00:00Z',
    }
    f.comments.push(
      rawComment(50, encodeReleaseAcceptance(revoked), revoked.recordedAt, 'acceptor'),
    )
    expect(() => readReleaseAcceptance(f.input())).toThrow('reference-not-current')
  })

  it('accepts a new revision whose authenticated decision preserves the previous revision link', () => {
    const f = fixture()
    const binding = taskBinding(3, 2)
    const declaration = { ...f.declaration, revision: 2 }
    const sourceComment = rawComment(
      6,
      block(RESPONSIBILITY_MARKER, declaration),
      '2026-10-27T11:15:00Z',
    )
    const authorization = { issue: 100, commentId: 6, sha256: commentDigest(sourceComment.body) }
    const stopped = rawComment(
      5,
      block(STOP_MARKER, {
        schemaVersion: 1,
        context: f.adoptedScope.context,
        epoch: f.adoptedScope.epoch,
        writer: 'owner',
        stopped: true,
        evidence: [evidence],
      }),
      '2026-10-27T11:00:00Z',
    )
    const currentScope = {
      ...f.adoptedScope,
      epoch: NEXT_UUID,
      previous: {
        dispatch: { issue: 100, commentId: 1, sha256: commentDigest(f.comments[0]!.body) },
        stopped: { issue: 100, commentId: 5, sha256: commentDigest(stopped.body) },
      },
      acceptanceResponsibility: { ...f.adoptedScope.acceptanceResponsibility!, authorization },
    }
    const decision: ReleaseAcceptanceDecision = {
      ...f.decision,
      revision: 2,
      attempt: binding.attempt,
      operationId: NEXT_UUID,
      authorization,
      previous: f.reference(),
      recordedAt: '2026-10-27T12:00:00Z',
    }
    const accepted = rawComment(
      41,
      encodeReleaseAcceptance(decision),
      decision.recordedAt,
      'acceptor',
    )
    const current = backend(binding, [
      ...f.comments,
      stopped,
      sourceComment,
      dispatch(binding, currentScope, 3, '2026-10-27T11:30:00Z'),
      accepted,
    ])
    const read: GhRead = (args, timeout) => {
      const path = args.at(-1) ?? ''
      return /issues\/10(?:\?|\/|$)/.test(path) || path.endsWith('comments/24')
        ? f.read(args, timeout)
        : current.read(args, timeout)
    }
    const original = readAcceptanceSources(root, pinned).entries
    writeFileSync(
      join(root, ACCEPTANCE_SOURCES_PATH),
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          ...original,
          { issue: binding.issue, revision: 2, authorization, authorNodeId: 'U_owner' },
        ],
      }),
    )
    git(root, ['add', '.'])
    git(root, ['commit', '--quiet', '-m', 'Adopt revision 2 with history'])
    const commit = git(root, ['rev-parse', 'HEAD']),
      file = blob(root, commit, ACCEPTANCE_SOURCES_PATH)
    const sources = readAcceptanceSources(root, {
      commit,
      path: ACCEPTANCE_SOURCES_PATH,
      blob: file.oid,
      digest: digest(file.text),
    })
    expect(
      readReleaseAcceptance({
        policy,
        reduceIssue: 100,
        read,
        sources,
        reference: { issue: 100, commentId: 41, sha256: commentDigest(accepted.body) },
        subject: decision.subject,
      }).decision.revision,
    ).toBe(2)
  })

  it('rejects a delta with a missing predecessor even when its exact bytes were accepted', () => {
    const f = fixture()
    f.lineDelta.revision = 99
    f.lineDelta.previousRecordId = 900
    f.deltaComment.body = encodeRecordComment(f.lineDelta)
    f.decision.subject.lines[0]!.delta.sha256 = commentDigest(f.deltaComment.body)
    f.rewrite()
    expect(() => readReleaseAcceptance(f.input())).toThrow('revision-gap')
  })

  it('rejects unauthorized delta history before the accepted delta', () => {
    const f = fixture()
    f.lineComments.unshift({
      ...f.deltaComment,
      id: 22,
      user: { login: 'stranger', type: 'User', node_id: 'U_stranger' },
      html_url: 'https://github.com/owner/repo/issues/10#issuecomment-22',
    })
    f.lineDelta.revision = 2
    f.lineDelta.previousRecordId = 22
    f.lineDelta.operationId = NEXT_UUID
    f.deltaComment.body = encodeRecordComment(f.lineDelta)
    f.decision.subject.lines[0]!.delta.sha256 = commentDigest(f.deltaComment.body)
    f.rewrite()
    expect(() => readReleaseAcceptance(f.input())).toThrow('writer-untrusted')
  })

  it('rejects a delta predecessor edited after the acceptance even if the final delta is unchanged', () => {
    const f = fixture()
    f.lineComments.unshift({
      ...f.deltaComment,
      id: 22,
      html_url: 'https://github.com/owner/repo/issues/10#issuecomment-22',
      updated_at: '2026-10-27T11:00:00Z',
    })
    f.lineDelta.revision = 2
    f.lineDelta.previousRecordId = 22
    f.lineDelta.operationId = NEXT_UUID
    f.deltaComment.body = encodeRecordComment(f.lineDelta)
    f.decision.subject.lines[0]!.delta.sha256 = commentDigest(f.deltaComment.body)
    f.rewrite()
    expect(() => readReleaseAcceptance(f.input())).toThrow('evidence-after-decision')
  })

  it('rejects a result predecessor edited after the acceptance', () => {
    const f = fixture()
    f.comments.push({
      ...rawComment(
        21,
        encodeRecordComment({ ...f.result, operationId: UUID }),
        '2026-10-27T09:59:00Z',
      ),
      updated_at: '2026-10-27T11:00:00Z',
    })
    f.result.revision = 2
    f.result.previousRecordId = 21
    f.resultComment.body = encodeRecordComment(f.result)
    f.decision.subject.results[0]!.sha256 = commentDigest(f.resultComment.body)
    f.lineDelta.integrationResults = f.decision.subject.results
    f.deltaComment.body = encodeRecordComment(f.lineDelta)
    f.decision.subject.lines[0]!.delta.sha256 = commentDigest(f.deltaComment.body)
    f.rewrite()
    expect(() => readReleaseAcceptance(f.input())).toThrow('evidence-after-decision')
  })

  it('refuses a missing predecessor, conflicting operation, or unprojected human decision', () => {
    const missing = fixture()
    missing.decision.previous = { issue: 100, commentId: 99, sha256: '0'.repeat(64) }
    missing.rewrite()
    expect(() => readReleaseAcceptance(missing.input())).toThrow('chain-incomplete')
    const conflict = fixture()
    conflict.comments.push(
      rawComment(
        50,
        encodeReleaseAcceptance({ ...conflict.decision, remaining: ['gap'], decision: 'partial' }),
        '2026-10-27T11:00:00Z',
        'acceptor',
      ),
    )
    expect(() => readReleaseAcceptance(conflict.input())).toThrow('operation-conflict')
    const legacy = fixture()
    legacy.comments.push(
      rawComment(50, '- 决定：revoke\n- 对象与交付修订：本卡', '2026-10-27T11:00:00Z', 'acceptor'),
    )
    expect(() => readReleaseAcceptance(legacy.input())).toThrow('unprojected-decision')
  })
})

import { describe, expect, it } from 'vitest'
import { digest } from '../src/integration/parse.ts'
import {
  readCollaborationAuthority,
  recordAuthorityFor,
} from '../src/delivery/collaboration-authority.ts'
import { validateRecordAuthority } from '../src/delivery/collaboration-trust.ts'
import { encodeRecordComment } from '../src/delivery/collaboration-comments.ts'
import { context, delta, UUID } from './fixtures/collaboration.ts'
import {
  backend,
  block,
  dispatch,
  historyBackend,
  policy,
  rawComment,
  responsibility,
  scope,
  taskBinding,
} from './fixtures/collaboration-authority.ts'

describe('production collaboration authority reads', () => {
  it('refuses missing, unsupported and duplicate collaboration scope blocks', () => {
    for (const transform of [
      (body: string) => body.replace('omne-collaboration-scope:v1', 'unrelated:v1'),
      (body: string) => body.replace('omne-collaboration-scope:v1', 'omne-collaboration-scope:v2'),
      (body: string) => body + block('omne-collaboration-scope:v1', scope()),
    ]) {
      const api = backend()
      api.comments[0]!.body = transform(api.comments[0]!.body)
      expect(() =>
        readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read }),
      ).toThrow('block-missing-or-conflicting')
    }
  })

  it('reads actual dispatch permission and binding without inventing acceptance authority', () => {
    const api = backend()
    const authority = readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read })
    expect(authority.binding).toEqual(taskBinding())
    expect(authority.scope.acceptanceResponsibility).toBeNull()
    expect(recordAuthorityFor(authority, context)).toMatchObject({
      participants: [10],
      reduce: [
        {
          from: '2026-10-27T09:00:00Z',
          until: null,
          writer: { login: 'owner', epoch: UUID, authorization: taskBinding().dispatch },
        },
      ],
    })
    expect(api.calls).toContain('repos/owner/repo/environments/publish')
    expect(() => recordAuthorityFor(authority, { ...context, wave: 2 })).toThrow(
      'context-not-authorized',
    )
  })

  it('uses adopted exact-comment facts for the cloud path without querying GraphQL or environments', () => {
    const api = backend(),
      comment = api.comments[0]!
    const facts = {
      url: comment.html_url,
      author: 'owner',
      authorNodeId: 'U_owner',
      reviewer: true,
      bodySha256: digest(comment.body),
      updatedAt: comment.updated_at,
    }
    readCollaborationAuthority({ policy, reduceIssue: 100, adoptedFacts: facts, read: api.read })
    expect(api.calls.some(path => path.includes('/environments/') || path === 'graphql')).toBe(
      false,
    )
    expect(() =>
      readCollaborationAuthority({
        policy,
        reduceIssue: 100,
        adoptedFacts: { ...facts, bodySha256: 'f'.repeat(64) },
        read: api.read,
      }),
    ).toThrow('body digest mismatch')
  })

  it('rejects non-reviewer dispatches and current revocations', () => {
    const denied = backend()
    denied.reviewers[0]!.reviewer.login = 'other'
    expect(() =>
      readCollaborationAuthority({ policy, reduceIssue: 100, read: denied.read }),
    ).toThrow('not a reviewer')
    const revoked = backend()
    revoked.comments.push(
      rawComment(
        2,
        block('omne-integration-revocation:v1', {
          schemaVersion: 1,
          decisions: [taskBinding().dispatch],
          basis: 'Revoked fixture',
        }),
      ),
    )
    expect(() =>
      readCollaborationAuthority({ policy, reduceIssue: 100, read: revoked.read }),
    ).toThrow('revocation declaration')
  })

  it('rejects body revision, dispatch binding and milestone drift', () => {
    const revision = backend()
    revision.data.body = revision.data.body.replace('交付修订：1', '交付修订：2')
    expect(() =>
      readCollaborationAuthority({ policy, reduceIssue: 100, read: revision.read }),
    ).toThrow('Binding revision must match the unique delivery revision')
    const changedBinding = taskBinding()
    changedBinding.taskBase = 'f'.repeat(40)
    const changed = backend(changedBinding, [dispatch()])
    expect(() =>
      readCollaborationAuthority({ policy, reduceIssue: 100, read: changed.read }),
    ).toThrow('differs from current binding')
    const milestone = backend()
    milestone.data.milestone.number = 2
    expect(() =>
      readCollaborationAuthority({ policy, reduceIssue: 100, read: milestone.read }),
    ).toThrow('milestone-mismatch')
  })

  it('refuses a responsibility projection after its authoritative field changes', () => {
    const value = scope()
    value.acceptanceResponsibility = {
      fieldSha256: digest(responsibility),
      owner: 'owner',
      acceptor: 'acceptor',
      authorization: { issue: 100, commentId: 9, sha256: 'e'.repeat(64) },
    }
    const api = backend(taskBinding(), [dispatch(taskBinding(), value)])
    expect(
      readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read }).scope
        .acceptanceResponsibility?.acceptor,
    ).toBe('acceptor')
    api.data.body = api.data.body.replace(responsibility, responsibility + ' amended')
    expect(() => readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read })).toThrow(
      'responsibility-source-changed',
    )
  })

  it('carries exact epoch history but rejects writes attributed to an already stopped epoch', () => {
    const api = historyBackend()
    const authority = readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read })
    const recordAuthority = recordAuthorityFor(authority, context)
    expect(recordAuthority.reduce.map(item => item.until)).toEqual(['2026-10-27T10:00:00Z', null])
    const record = delta()
    record.writer.authorization = api.old.html_url
    const comment = {
      id: 10,
      issue: 10,
      author: 'owner',
      authorType: 'User',
      url: 'https://github.com/owner/repo/issues/10#issuecomment-10',
      body: encodeRecordComment(record),
      record,
      createdAt: '2026-10-27T09:30:00Z',
      updatedAt: '2026-10-27T09:30:00Z',
    }
    validateRecordAuthority(comment, recordAuthority, api.read)
    expect(() =>
      validateRecordAuthority(
        { ...comment, createdAt: '2026-10-27T11:30:00Z', updatedAt: '2026-10-27T11:30:00Z' },
        recordAuthority,
        api.read,
      ),
    ).toThrow('reduce-writer-untrusted')
  })

  it('refuses edited history, untrusted stop authors and overlap with new execution', () => {
    const changed = historyBackend()
    changed.old.body += '\n'
    expect(() =>
      readCollaborationAuthority({ policy, reduceIssue: 100, read: changed.read }),
    ).toThrow('digest-mismatch')
    const impostor = historyBackend()
    impostor.stopped.user.login = 'stranger'
    expect(() =>
      readCollaborationAuthority({ policy, reduceIssue: 100, read: impostor.read }),
    ).toThrow('stop-author-untrusted')
    const overlap = historyBackend()
    overlap.stopped.created_at = '2026-10-27T11:30:00Z'
    overlap.stopped.updated_at = '2026-10-27T11:30:00Z'
    expect(() =>
      readCollaborationAuthority({ policy, reduceIssue: 100, read: overlap.read }),
    ).toThrow('time-conflict')
  })

  it('refuses declared revocation of a historical dispatch rather than rewriting its meaning', () => {
    const api = historyBackend()
    api.comments.push(
      rawComment(
        4,
        block('omne-integration-revocation:v1', {
          schemaVersion: 1,
          decisions: [api.old.html_url],
          basis: 'Historical authority disputed',
        }),
        '2026-10-27T11:30:00Z',
      ),
    )
    expect(() => readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read })).toThrow(
      'revocation declaration',
    )
  })

  it('checks historical dispatch eligibility rather than trusting the current writer to grant it retroactively', () => {
    const api = historyBackend('stranger')
    expect(() => readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read })).toThrow(
      'not a reviewer',
    )
    const oldFacts = {
      url: api.old.html_url,
      author: 'stranger',
      authorNodeId: 'U_stranger',
      reviewer: true,
      bodySha256: digest(api.old.body),
      updatedAt: api.old.updated_at,
    }
    expect(
      readCollaborationAuthority({
        policy,
        reduceIssue: 100,
        historicalFacts: [oldFacts],
        read: api.read,
      }).records[0]?.reduce[0]?.writer.login,
    ).toBe('stranger')
    expect(() =>
      readCollaborationAuthority({
        policy,
        reduceIssue: 100,
        historicalFacts: [{ ...oldFacts, reviewer: false }],
        read: api.read,
      }),
    ).toThrow('do not show the author')
  })

  it('keeps missing historical cloud facts unknown without falling back to an environment read', () => {
    const api = historyBackend()
    const facts = {
      url: api.current.html_url,
      author: 'owner',
      authorNodeId: 'U_owner',
      reviewer: true,
      bodySha256: digest(api.current.body),
      updatedAt: api.current.updated_at,
    }
    expect(() =>
      readCollaborationAuthority({ policy, reduceIssue: 100, adoptedFacts: facts, read: api.read }),
    ).toThrow('history-adopted-facts-missing')
    expect(api.calls.some(path => path.includes('/environments/'))).toBe(false)
  })

  it('does not authorize a newer plan before its own dispatch begins', () => {
    const api = historyBackend()
    const authority = readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read })
    const record = delta()
    record.context.planRevision = 2
    record.writer.authorization = api.old.html_url
    const comment = {
      id: 10,
      issue: 10,
      author: 'owner',
      authorType: 'User',
      url: 'https://github.com/owner/repo/issues/10#issuecomment-10',
      body: encodeRecordComment(record),
      record,
      createdAt: '2026-10-27T09:30:00Z',
      updatedAt: '2026-10-27T09:30:00Z',
    }
    expect(() =>
      validateRecordAuthority(comment, recordAuthorityFor(authority, record.context), api.read),
    ).toThrow('reduce-writer-untrusted')
  })

  it('does not extend a stopped writer interval when the stop comment is edited', () => {
    const api = historyBackend()
    api.stopped.updated_at = '2026-10-27T10:45:00Z'
    expect(() => readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read })).toThrow(
      'stop-edited',
    )
  })

  it('refuses a current scope that silently drops an earlier authorized epoch', () => {
    const api = historyBackend()
    api.currentScope.previous = null
    api.current.body = dispatch(api.binding, api.currentScope, 3, api.current.created_at).body
    expect(() => readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read })).toThrow(
      'unlinked-dispatch-conflict',
    )
  })

  it('does not treat an unauthorized scope marker as another valid writer', () => {
    const api = backend()
    const forged = taskBinding(8)
    forged.responsible = 'stranger'
    forged.branch = 'stranger/work'
    api.comments.push(dispatch(forged, scope(), 8))
    expect(
      readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read }).sources,
    ).toHaveLength(1)
  })

  it('rejects milestone changes between the initial card read and the complete snapshot', () => {
    const api = backend()
    let first = true
    expect(() =>
      readCollaborationAuthority({
        policy,
        reduceIssue: 100,
        read: (argv, timeout) => {
          const result = structuredClone(api.read(argv, timeout))
          if (first && argv.at(-1) === 'repos/owner/repo/issues/100') {
            first = false
            api.data.milestone.number = 2
            api.data.updated_at = '2026-10-27T12:00:01Z'
          }
          return result
        },
      }),
    ).toThrow('card changed during capture')
  })

  it('does not hide a changed workflow or participant set behind the same plan revision', () => {
    for (const change of ['workflow', 'participants']) {
      const api = historyBackend()
      api.currentScope.context.planRevision = 1
      if (change === 'workflow') api.currentScope.workflow.head = 'f'.repeat(40)
      else api.currentScope.lines.push({ lineParent: 20, login: 'line-two' })
      api.current.body = dispatch(api.binding, api.currentScope, 3, api.current.created_at).body
      expect(() =>
        readCollaborationAuthority({ policy, reduceIssue: 100, read: api.read }),
      ).toThrow('scope-plan-conflict')
    }
  })
})

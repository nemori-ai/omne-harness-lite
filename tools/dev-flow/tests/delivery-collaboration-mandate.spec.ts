import { describe, expect, it } from 'vitest'
import type { PolicySource } from '../src/integration/context.ts'
import { digest } from '../src/integration/parse.ts'
import { readCollaborationAuthority } from '../src/delivery/collaboration-authority.ts'
import {
  ACCEPTANCE_SOURCES_PATH,
  MILESTONE_MANDATE_MARKER,
  RESPONSIBILITY_MARKER,
  RESPONSIBILITY_REVOCATION,
  readAcceptanceSourcesRest,
  readAcceptanceResponsibility,
  readAdoptedResponsibility,
  type AcceptanceResponsibility,
  type MilestoneMandate,
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
import { BASE, evidence } from './fixtures/collaboration.ts'

function fixture() {
  const mandate: MilestoneMandate = {
    schemaVersion: 1,
    repository: 'owner/repo',
    milestone: 1,
    owner: { login: 'owner', nodeId: 'U_owner' },
    acceptor: { login: 'acceptor', nodeId: 'U_acceptor' },
    declarationAuthor: { login: 'owner', nodeId: 'U_owner' },
    basis: [evidence],
  }
  const onIssue = (comment: ReturnType<typeof rawComment>, number: number) => ({
    ...comment,
    html_url: `https://github.com/owner/repo/issues/${number}#issuecomment-${comment.id}`,
    issue_url: `https://api.github.com/repos/owner/repo/issues/${number}`,
  })
  const grant = onIssue(
    rawComment(90, block(MILESTONE_MANDATE_MARKER, mandate), '2026-10-27T08:00:00Z'),
    90,
  )
  const grantCard = {
    ...backend().data,
    number: 90,
    node_id: 'I_90',
    html_url: 'https://github.com/owner/repo/issues/90',
    body: '',
  }
  const grantComments = [grant]
  const grantRef = () => ({ issue: 90, commentId: 90, sha256: digest(grant.body) })
  const adoption = () => ({
    issue: { repository: 'owner/repo', number: 90, id: 'I_90', url: grantCard.html_url },
    authorization: grantRef(),
    authorNodeId: 'U_owner',
  })
  const cards = new Map<number, { data: typeof grantCard; comments: typeof grantComments }>()
  cards.set(90, { data: grantCard, comments: grantComments })
  function addReduce(number: number) {
    const binding = taskBinding(number + 1)
    binding.issue = {
      ...binding.issue,
      number,
      id: `I_${number}`,
      url: `https://github.com/owner/repo/issues/${number}`,
    }
    binding.attempt = `${number}-r1-a1`
    binding.dispatch = `${binding.issue.url}#issuecomment-${number + 1}`
    binding.authorization = [binding.issue.url]
    const declaration: AcceptanceResponsibility = {
      schemaVersion: 1,
      issue: binding.issue,
      revision: 1,
      fieldSha256: digest(responsibility),
      owner: { ...mandate.owner },
      acceptor: { ...mandate.acceptor },
      basis: [evidence],
    }
    const source = onIssue(
      rawComment(number + 2, block(RESPONSIBILITY_MARKER, declaration), '2026-10-27T08:30:00Z'),
      number,
    )
    const authorization = { issue: number, commentId: source.id, sha256: digest(source.body) }
    const adoptedScope = scope()
    adoptedScope.context.reduceIssue = number
    adoptedScope.acceptanceResponsibility = {
      fieldSha256: declaration.fieldSha256,
      owner: 'owner',
      acceptor: 'acceptor',
      authorization,
    }
    const current = onIssue(dispatch(binding, adoptedScope, number + 1), number)
    const comments = [current, source]
    const data = { ...backend(binding).data, number, node_id: binding.issue.id }
    cards.set(number, { data, comments })
    return {
      binding,
      declaration,
      source,
      authorization,
      adoptedScope,
      comments,
      data,
      rewrite() {
        source.body = block(RESPONSIBILITY_MARKER, declaration)
        authorization.sha256 = digest(source.body)
        comments[0] = onIssue(dispatch(binding, adoptedScope, number + 1), number)
      },
    }
  }
  const calls: (readonly string[])[] = []
  const read: GhRead = args => {
    calls.push([...args])
    expect(args.slice(0, 3)).toEqual(['api', '--method', 'GET'])
    const path = args.at(-1) ?? ''
    const single = /issues\/comments\/(\d+)$/.exec(path)
    if (single !== null) {
      for (const card of cards.values()) {
        const comment = card.comments.find(item => item.id === Number(single[1]))
        if (comment !== undefined) return comment
      }
    }
    const issue = /issues\/(\d+)(?:\/comments\?per_page=100&page=(\d+))?$/.exec(path)
    if (issue !== null) {
      const card = cards.get(Number(issue[1]))
      if (card !== undefined) {
        if (issue[2] === undefined) return { ...card.data, comments: card.comments.length }
        const offset = (Number(issue[2]) - 1) * 100
        return card.comments.slice(offset, offset + 100)
      }
    }
    return backend().read(args, 15_000)
  }
  const sources = (value: unknown = { schemaVersion: 2, entries: [], mandates: [adoption()] }) => {
    const text = JSON.stringify(value)
    const source: PolicySource = {
      commit: BASE,
      path: ACCEPTANCE_SOURCES_PATH,
      blob: 'b'.repeat(40),
      digest: digest(text),
    }
    return readAcceptanceSourcesRest('owner/repo', source, args => {
      calls.push([...args])
      expect(args.slice(0, 3)).toEqual(['api', '--method', 'GET'])
      expect(args.at(-1)).toBe(`repos/owner/repo/contents/${ACCEPTANCE_SOURCES_PATH}?ref=${BASE}`)
      return {
        type: 'file',
        path: source.path,
        sha: source.blob,
        encoding: 'base64',
        content: Buffer.from(text).toString('base64'),
      }
    })
  }
  const authority = (number = 100) =>
    readCollaborationAuthority({ policy, reduceIssue: number, read })
  const first = addReduce(100)
  return {
    mandate,
    grant,
    grantCard,
    grantComments,
    grantRef,
    adoption,
    addReduce,
    first,
    read,
    calls,
    sources,
    authority,
    accept: () => readAcceptanceResponsibility(authority(), sources(), read),
  }
}

describe('explicit milestone acceptance mandate', () => {
  it('covers a later-created reduce with the same immutable source and read-only requests', () => {
    const f = fixture(),
      sources = f.sources()
    expect(readAcceptanceResponsibility(f.authority(), sources, f.read).issue.number).toBe(100)
    f.addReduce(200)
    expect(readAcceptanceResponsibility(f.authority(200), sources, f.read).issue.number).toBe(200)
    expect(f.calls.filter(args => args.at(-1)?.includes('/contents/'))).toHaveLength(1)
  })

  it('does not widen an empty v1 source into a milestone grant', () => {
    const f = fixture()
    const old = f.sources({ schemaVersion: 1, entries: [] })
    expect(old.mandates).toEqual([])
    expect(() => readAcceptanceResponsibility(f.authority(), old, f.read)).toThrow('not-adopted')
    expect(() => f.sources({ schemaVersion: 1, entries: [], mandates: [f.adoption()] })).toThrow()
  })

  it.each(['owner', 'acceptor'] as const)('rejects a substituted %s account', field => {
    const f = fixture()
    f.first.declaration[field].nodeId = 'U_replacement'
    f.first.rewrite()
    expect(f.accept).toThrow('Responsibility differs from adopted milestone mandate')
  })

  it('rejects a declaration published by a different account with the same login', () => {
    const f = fixture()
    f.first.source.user.node_id = 'U_replacement'
    expect(f.accept).toThrow('Responsibility differs from adopted milestone mandate')
  })

  it('rejects an authenticated dispatch owner outside the mandate', () => {
    const f = fixture()
    f.first.comments[0]!.user.node_id = 'U_replacement'
    const read: GhRead = (args, timeout) =>
      args.at(-1)?.endsWith('/environments/publish')
        ? {
            protection_rules: [
              {
                type: 'required_reviewers',
                reviewers: [
                  { type: 'User', reviewer: { login: 'owner', node_id: 'U_replacement' } },
                ],
              },
            ],
          }
        : f.read(args, timeout)
    const authority = readCollaborationAuthority({ policy, reduceIssue: 100, read })
    expect(() => readAcceptanceResponsibility(authority, f.sources(), read)).toThrow(
      'Current reduce owner account differs',
    )
  })

  it('rejects a current declaration for another revision', () => {
    const f = fixture()
    f.first.declaration.revision = 2
    f.first.rewrite()
    expect(f.accept).toThrow('Responsibility revision differs from current binding')
  })

  it.each(['grant', 'source'] as const)(
    'rejects an edited %s even when its body was restored',
    target => {
      const f = fixture()
      const comment = target === 'grant' ? f.grant : f.first.source
      comment.updated_at = '2026-10-27T11:00:00Z'
      expect(f.accept).toThrow('missing-or-edited')
    },
  )

  it('rejects changed grant bytes against the previously loaded source', () => {
    const f = fixture(),
      sources = f.sources()
    f.grant.body += '\nChanged'
    expect(() => readAcceptanceResponsibility(f.authority(), sources, f.read)).toThrow(
      'missing-or-edited',
    )
  })

  it('rejects a changed grant account and changed native source identity', () => {
    const f = fixture()
    f.grant.user.node_id = 'U_replacement'
    expect(f.accept).toThrow('mandate-source-author')
    f.grant.user.node_id = 'U_owner'
    f.grantCard.node_id = 'I_replacement'
    expect(f.accept).toThrow('Mandate source issue mismatch')
  })

  it('requires the source and reduce to remain in the granted native milestone', () => {
    const f = fixture()
    f.grantCard.milestone = { number: 2, title: 'Different' }
    expect(f.accept).toThrow('mandate-native-milestone-mismatch')
    f.grantCard.milestone = { number: 1, title: 'Fixture milestone' }
    f.first.data.milestone = { number: 2, title: 'Different' }
    expect(f.accept).toThrow('collaboration-milestone-mismatch')
  })

  it.each(['repository', 'milestone'] as const)('does not grant another %s', field => {
    const f = fixture()
    if (field === 'repository') f.mandate.repository = 'owner/another'
    else f.mandate.milestone = 2
    f.grant.body = block(MILESTONE_MANDATE_MARKER, f.mandate)
    expect(f.accept).toThrow(field === 'repository' ? 'Mandate repository differs' : 'not-adopted')
  })

  it('refuses concurrent mandates instead of selecting the newest one', () => {
    const f = fixture(),
      second = {
        ...f.grant,
        id: 91,
        html_url: 'https://github.com/owner/repo/issues/90#issuecomment-91',
      }
    f.grantComments.push(second)
    const duplicate = { ...f.adoption(), authorization: { ...f.grantRef(), commentId: 91 } }
    const sources = f.sources({
      schemaVersion: 2,
      entries: [],
      mandates: [f.adoption(), duplicate],
    })
    expect(() => readAcceptanceResponsibility(f.authority(), sources, f.read)).toThrow(
      'mandate-conflict',
    )
  })

  it('applies revocation now while preserving proof at an earlier cutoff', () => {
    const f = fixture(),
      sources = f.sources()
    f.grantComments.push({
      ...rawComment(
        92,
        block(RESPONSIBILITY_REVOCATION, {
          schemaVersion: 1,
          authorization: f.grantRef(),
          basis: [evidence],
        }),
        '2026-10-27T11:00:00Z',
        'acceptor',
      ),
      html_url: 'https://github.com/owner/repo/issues/90#issuecomment-92',
      issue_url: 'https://api.github.com/repos/owner/repo/issues/90',
    })
    const authority = f.authority()
    expect(() => readAcceptanceResponsibility(authority, sources, f.read)).toThrow(
      'mandate-revoked',
    )
    expect(
      readAdoptedResponsibility(
        authority,
        sources,
        f.first.authorization,
        f.read,
        '2026-10-27T10:00:00Z',
      ).revision,
    ).toBe(1)
    expect(() =>
      readAdoptedResponsibility(
        authority,
        sources,
        f.first.authorization,
        f.read,
        '2026-10-27T11:00:00Z',
      ),
    ).toThrow('mandate-revoked')
  })

  it('does not use a grant made after the historical acceptance cutoff', () => {
    const f = fixture()
    expect(() =>
      readAdoptedResponsibility(
        f.authority(),
        f.sources(),
        f.first.authorization,
        f.read,
        '2026-10-27T07:59:59Z',
      ),
    ).toThrow('not-adopted')
  })

  it.each(['revoked', 'moved'] as const)(
    'refuses a source %s during authorization readback',
    change => {
      const f = fixture(),
        sources = f.sources(),
        authority = f.authority()
      let changed = false
      const read: GhRead = (args, timeout) => {
        if (!changed && args.at(-1) === 'repos/owner/repo/issues/comments/90') {
          changed = true
          if (change === 'moved') f.grantCard.milestone = { number: 2, title: 'Moved' }
          else
            f.grantComments.push({
              ...rawComment(
                92,
                block(RESPONSIBILITY_REVOCATION, {
                  schemaVersion: 1,
                  authorization: f.grantRef(),
                  basis: [evidence],
                }),
                '2026-10-27T11:00:00Z',
                'acceptor',
              ),
              html_url: 'https://github.com/owner/repo/issues/90#issuecomment-92',
              issue_url: 'https://api.github.com/repos/owner/repo/issues/90',
            })
        }
        return f.read(args, timeout)
      }
      expect(() => readAcceptanceResponsibility(authority, sources, read)).toThrow(
        'Milestone mandate source changed during read',
      )
      expect(changed).toBe(true)
    },
  )

  it('keeps exact responsibility revocation effective under a milestone mandate', () => {
    const f = fixture()
    f.first.comments.push(
      rawComment(
        150,
        block(RESPONSIBILITY_REVOCATION, {
          schemaVersion: 1,
          authorization: f.first.authorization,
          basis: [evidence],
        }),
        '2026-10-27T11:00:00Z',
        'acceptor',
      ),
    )
    expect(f.accept).toThrow('responsibility-revoked')
  })

  it('does not bypass a revoked mandate through an exact-card source entry', () => {
    const f = fixture()
    const sources = f.sources({
      schemaVersion: 2,
      entries: [
        {
          issue: f.first.binding.issue,
          revision: 1,
          authorization: f.first.authorization,
          authorNodeId: 'U_owner',
        },
      ],
      mandates: [f.adoption()],
    })
    f.grantComments.push({
      ...rawComment(
        92,
        block(RESPONSIBILITY_REVOCATION, {
          schemaVersion: 1,
          authorization: f.grantRef(),
          basis: [evidence],
        }),
        '2026-10-27T11:00:00Z',
      ),
      html_url: 'https://github.com/owner/repo/issues/90#issuecomment-92',
      issue_url: 'https://api.github.com/repos/owner/repo/issues/90',
    })
    expect(() => readAcceptanceResponsibility(f.authority(), sources, f.read)).toThrow(
      'mandate-revoked',
    )
  })

  it('does not override a conflicting exact-card source reference with a matching mandate', () => {
    const f = fixture()
    const sources = f.sources({
      schemaVersion: 2,
      entries: [
        {
          issue: f.first.binding.issue,
          revision: 1,
          authorization: { ...f.first.authorization, commentId: 103 },
          authorNodeId: 'U_owner',
        },
      ],
      mandates: [f.adoption()],
    })
    expect(() => readAcceptanceResponsibility(f.authority(), sources, f.read)).toThrow(
      'Accepted responsibility source differs from dispatch',
    )
    expect(() =>
      readAdoptedResponsibility(
        f.authority(),
        sources,
        f.first.authorization,
        f.read,
        '2026-10-27T10:00:00Z',
      ),
    ).toThrow('Adopted responsibility source conflicts')
  })
})

describe('immutable REST acceptance source', () => {
  it.each(['type', 'path', 'sha', 'encoding', 'content'] as const)('refuses changed %s', field => {
    const text = JSON.stringify({ schemaVersion: 1, entries: [] })
    const source = {
      commit: BASE,
      path: ACCEPTANCE_SOURCES_PATH,
      blob: 'b'.repeat(40),
      digest: digest(text),
    }
    const response = {
      type: 'file',
      path: source.path,
      sha: source.blob,
      encoding: 'base64',
      content: Buffer.from(text).toString('base64'),
    }
    response[field] = 'changed'
    expect(() => readAcceptanceSourcesRest('owner/repo', source, () => response)).toThrow(
      'source-changed',
    )
  })

  it('refuses symbolic revisions and arbitrary paths before making any request', () => {
    const source = {
      commit: BASE,
      path: ACCEPTANCE_SOURCES_PATH,
      blob: 'b'.repeat(40),
      digest: 'a'.repeat(64),
    }
    const calls: unknown[] = []
    const read: GhRead = args => {
      calls.push(args)
      return {}
    }
    expect(() =>
      readAcceptanceSourcesRest('owner/repo', { ...source, commit: 'HEAD' }, read),
    ).toThrow()
    expect(() =>
      readAcceptanceSourcesRest('owner/repo', { ...source, path: 'local.json' }, read),
    ).toThrow('source-path')
    expect(calls).toEqual([])
  })
})

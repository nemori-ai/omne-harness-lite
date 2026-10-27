import { describe, expect, it } from 'vitest'
import { digest } from '../src/integration/parse.ts'
import { FACTS_MARKER } from '../src/integration/delivery-facts-record.ts'
import {
  readPublishedDeliveryFacts,
  type FactsDeployment,
  type FactsReadDeployment,
} from '../src/integration/published-delivery-facts.ts'
import { readAuthority } from '../src/integration/authority.ts'
import { readCollaborationAuthority } from '../src/delivery/collaboration-authority.ts'
import { publishedAuthorityReaders } from '../src/delivery/collaboration-facts.ts'
import { readCompleteComments } from '../src/delivery/collaboration-read.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import {
  backend,
  block,
  dispatch,
  historyBackend,
  policy,
  rawComment,
} from './fixtures/collaboration-authority.ts'
import { TOOL } from './fixtures/collaboration.ts'

function fixture() {
  const current = dispatch()
  const deployment: FactsDeployment = {
    repository: 'owner/repo',
    projectId: 'P_1',
    workflow: {
      id: 12,
      path: '.github/workflows/delivery-facts.yml',
      ref: 'github-gate',
      head: TOOL,
    },
    bot: { login: 'delivery[bot]', nodeId: 'BOT_1' },
  }
  const readDeployment: FactsReadDeployment = { ...deployment, workflows: [deployment.workflow] }
  const facts = {
    schemaVersion: 1,
    nonce: '0'.repeat(32),
    run: 202,
    issue: 100,
    authority: {
      url: current.html_url,
      author: current.user.login,
      authorNodeId: current.user.node_id,
      bodySha256: digest(current.body),
      updatedAt: current.updated_at,
      reviewer: true,
    },
    project: { id: 'P_1', item: 'ITEM_1', stage: 'Ready' },
  }
  const published = rawComment(
    20,
    block(FACTS_MARKER, facts),
    '2026-10-27T10:00:30Z',
    deployment.bot.login,
  )
  published.user = { login: deployment.bot.login, node_id: deployment.bot.nodeId, type: 'Bot' }
  const api = backend(undefined, [current, published])
  const run = {
    id: 202,
    workflow_id: deployment.workflow.id,
    path: deployment.workflow.path,
    head_branch: deployment.workflow.ref,
    head_sha: TOOL,
    event: 'workflow_dispatch',
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-10-27T10:00:00Z',
    run_started_at: '2026-10-27T10:00:01Z',
    updated_at: '2026-10-27T10:01:00Z',
    repository: { full_name: deployment.repository },
    head_repository: { full_name: deployment.repository },
  }
  const runs = new Map([[run.id, run]])
  const calls: (readonly string[])[] = []
  const read: GhRead = (args, timeout) => {
    calls.push([...args])
    expect(args.slice(0, 3)).toEqual(['api', '--method', 'GET'])
    const path = args.at(-1) ?? ''
    expect(path).not.toContain('graphql')
    expect(path).not.toContain('/environments/')
    const runPath = /^repos\/owner\/repo\/actions\/runs\/(\d+)(?:\/attempts\/1)?$/.exec(path)
    if (runPath !== null) {
      const found = runs.get(Number(runPath[1]))
      if (found === undefined) throw new Error('404 run')
      return structuredClone(found)
    }
    return structuredClone(api.read(args, timeout))
  }
  const addObservation = (reviewer: boolean) => {
    const other = structuredClone(facts)
    other.nonce = '1'.repeat(32)
    other.run = 203
    other.authority.reviewer = reviewer
    const comment = {
      ...structuredClone(published),
      id: 21,
      html_url: 'https://github.com/owner/repo/issues/100#issuecomment-21',
      body: block(FACTS_MARKER, other),
    }
    api.comments.push(comment)
    runs.set(other.run, { ...structuredClone(run), id: other.run })
    return { facts: other, comment, run: runs.get(other.run)! }
  }
  return {
    ...api,
    current,
    published,
    facts,
    deployment,
    readDeployment,
    run,
    runs,
    calls,
    read,
    addObservation,
    rewrite: () => {
      published.body = block(FACTS_MARKER, facts)
    },
    fetch: () => readPublishedDeliveryFacts(readDeployment, current.html_url, read),
  }
}

describe('published delivery facts without workflow dispatch', () => {
  it.each([false, true])(
    'accepts endpoint creation metadata recorded after the run started, current endpoint: %s',
    currentEndpoint => {
      const f = fixture()
      const read: GhRead = (args, timeout) => {
        const value = f.read(args, timeout)
        const path = args.at(-1) ?? ''
        const endpoint = currentEndpoint ? '/actions/runs/202' : '/actions/runs/202/attempts/1'
        return path.endsWith(endpoint) ? { ...value, created_at: '2026-10-27T10:00:02Z' } : value
      }
      expect(
        readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read).observations.map(
          item => item.facts.run,
        ),
      ).toEqual([202])
    },
  )

  it.each([false, true])(
    'refuses creation metadata after the last update, current endpoint: %s',
    currentEndpoint => {
      const f = fixture()
      const read: GhRead = (args, timeout) => {
        const value = f.read(args, timeout)
        const path = args.at(-1) ?? ''
        const endpoint = currentEndpoint ? '/actions/runs/202' : '/actions/runs/202/attempts/1'
        return path.endsWith(endpoint) ? { ...value, created_at: '2026-10-27T10:01:01Z' } : value
      }
      expect(() => readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read)).toThrow(
        'Published facts comment is outside its workflow attempt',
      )
    },
  )

  it.each([false, true])(
    'accepts different update times for the same successful attempt, current endpoint: %s',
    currentEndpoint => {
      const f = fixture()
      const read: GhRead = (args, timeout) => {
        const value = f.read(args, timeout)
        const path = args.at(-1) ?? ''
        const endpoint = currentEndpoint ? '/actions/runs/202' : '/actions/runs/202/attempts/1'
        return path.endsWith(endpoint) ? { ...value, updated_at: '2026-10-27T10:01:01Z' } : value
      }
      expect(
        readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read).observations.map(
          item => item.facts.run,
        ),
      ).toEqual([202])
    },
  )

  it.each([false, true])(
    'requires the comment to fit each observed time window, current endpoint: %s',
    currentEndpoint => {
      const f = fixture()
      const read: GhRead = (args, timeout) => {
        const value = f.read(args, timeout)
        const path = args.at(-1) ?? ''
        const endpoint = currentEndpoint ? '/actions/runs/202' : '/actions/runs/202/attempts/1'
        return path.endsWith(endpoint) ? { ...value, updated_at: '2026-10-27T10:00:29Z' } : value
      }
      expect(() => readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read)).toThrow(
        'Published facts comment is outside its workflow attempt',
      )
    },
  )

  it.each([
    ['head', false],
    ['head', true],
    ['id', false],
    ['id', true],
  ] as const)(
    'rejects split adopted %s between current run and attempt, reversed: %s',
    (field, reversed) => {
      const f = fixture()
      const other = { ...f.deployment.workflow }
      if (field === 'head') other.head = '9'.repeat(40)
      else other.id++
      f.readDeployment.workflows = [f.deployment.workflow, other]
      const read: GhRead = (args, timeout) => {
        const result = f.read(args, timeout)
        const path = args.at(-1) ?? ''
        const attempt = path.endsWith('/actions/runs/202/attempts/1')
        const current = path.endsWith('/actions/runs/202')
        if ((reversed ? current : attempt) && typeof result === 'object' && result !== null) {
          return { ...result, workflow_id: other.id, head_sha: other.head }
        }
        return result
      }
      expect(() => readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read)).toThrow(
        'workflow attempt changed',
      )
    },
  )

  it('reads pre-installation facts and current facts together after explicit workflow adoption', () => {
    const f = fixture()
    const next = f.addObservation(true)
    next.run.head_sha = '9'.repeat(40)
    f.readDeployment.workflows = [
      { ...f.deployment.workflow, head: next.run.head_sha },
      f.deployment.workflow,
    ]
    expect(f.fetch().observations.map(item => item.facts.run)).toEqual([202, 203])
    f.readDeployment.workflows = [f.readDeployment.workflows[0]]
    expect(f.fetch).toThrow('workflow provenance mismatch')
  })

  it.each([true, false])(
    'retains historical negative evidence, current positive first: %s',
    currentFirst => {
      const f = fixture()
      f.facts.authority.reviewer = false
      f.rewrite()
      const next = f.addObservation(true)
      next.run.head_sha = '9'.repeat(40)
      f.readDeployment.workflows = [
        { ...f.deployment.workflow, head: next.run.head_sha },
        f.deployment.workflow,
      ]
      if (currentFirst) f.comments.reverse()
      expect(f.fetch).toThrow('qualification conflicts')
    },
  )

  it('does not hide unrecognized provenance behind adopted current or historical positives', () => {
    const f = fixture()
    const next = f.addObservation(true)
    next.run.head_sha = '9'.repeat(40)
    f.readDeployment.workflows = [
      f.deployment.workflow,
      { ...f.deployment.workflow, head: '8'.repeat(40) },
    ]
    expect(f.fetch).toThrow('workflow provenance mismatch')
  })

  it.each(['nonce', 'edited', 'rerun', 'repository', 'workflow', 'bot', 'project'])(
    'retains %s rejection across historical and current facts',
    defect => {
      const f = fixture()
      const next = f.addObservation(true)
      next.run.head_sha = '9'.repeat(40)
      f.readDeployment.workflows = [
        { ...f.deployment.workflow, head: next.run.head_sha },
        f.deployment.workflow,
      ]
      if (defect === 'nonce') {
        next.facts.nonce = f.facts.nonce
        next.comment.body = block(FACTS_MARKER, next.facts)
      }
      if (defect === 'edited') f.published.updated_at = '2026-10-27T10:00:31Z'
      if (defect === 'rerun') f.run.run_attempt = 2
      if (defect === 'repository') f.run.head_repository.full_name = 'other/repo'
      if (defect === 'workflow') f.run.workflow_id++
      if (defect === 'bot') f.published.user.node_id = 'BOT_other'
      if (defect === 'project') {
        f.facts.project.id = 'P_other'
        f.rewrite()
      }
      expect(f.fetch).toThrow()
    },
  )

  it('reads complete published facts using GETs and supplies the existing authority verifier', () => {
    const f = fixture(),
      result = f.fetch()
    expect(result.authority).toEqual(f.facts.authority)
    expect(result.observations).toMatchObject([
      { facts: { run: 202 }, reference: { issue: 100, commentId: 20 } },
    ])
    const capture = readCompleteComments('owner/repo', 100, f.read)
    expect(
      readAuthority(
        policy,
        f.current.html_url,
        { issues: [{ number: 100, comments: capture.comments, commentsComplete: true }] },
        result.authority,
        f.read,
      ).task.issue.number,
    ).toBe(100)
    expect(f.calls.some(args => args.at(-1)?.endsWith('/attempts/1'))).toBe(true)
    const readers = publishedAuthorityReaders(policy, f.readDeployment, f.read)
    expect(
      readCollaborationAuthority({ ...readers.authorityFor(100), reduceIssue: 100, read: f.read })
        .binding.issue.number,
    ).toBe(100)
  })

  it('resolves each exact historical dispatch lazily and refuses missing historical facts', () => {
    const f = fixture(),
      history = historyBackend()
    Object.assign(f.data, history.data)
    f.comments.splice(0, f.comments.length, ...history.comments, f.published)
    const next = f.addObservation(true)
    next.facts.authority = {
      ...next.facts.authority,
      url: history.current.html_url,
      bodySha256: digest(history.current.body),
      updatedAt: history.current.updated_at,
    }
    next.comment.body = block(FACTS_MARKER, next.facts)
    for (const comment of [f.published, next.comment])
      comment.created_at = comment.updated_at = '2026-10-27T12:00:30Z'
    for (const run of f.runs.values())
      Object.assign(run, {
        created_at: '2026-10-27T12:00:00Z',
        run_started_at: '2026-10-27T12:00:01Z',
        updated_at: '2026-10-27T12:01:00Z',
      })
    const readers = publishedAuthorityReaders(policy, f.readDeployment, f.read)
    const current = () =>
      readCollaborationAuthority({ ...readers.authorityFor(100), reduceIssue: 100, read: f.read })
    expect(current().sources.map(source => source.commentId)).toEqual([1, 3])
    f.comments.splice(f.comments.indexOf(f.published), 1)
    expect(current).toThrow('facts are missing')
  })

  it('refuses facts published before the dispatch revision they claim', () => {
    const f = fixture()
    f.current.updated_at = '2026-10-27T10:00:31Z'
    f.facts.authority.updatedAt = f.current.updated_at
    f.rewrite()
    expect(f.fetch).toThrow('predate the dispatch revision')
  })

  it('discovers facts for a new dispatch from current comments rather than a frozen map', () => {
    const f = fixture()
    expect(f.fetch().authority.url).toBe(f.current.html_url)
    const next = {
      ...structuredClone(f.current),
      id: 2,
      html_url: 'https://github.com/owner/repo/issues/100#issuecomment-2',
    }
    f.comments.push(next)
    const observation = f.addObservation(true)
    observation.facts.authority.url = next.html_url
    observation.comment.body = block(FACTS_MARKER, observation.facts)
    expect(readPublishedDeliveryFacts(f.readDeployment, next.html_url, f.read).authority.url).toBe(
      next.html_url,
    )
  })

  it('refuses missing facts and never falls back to direct environment reads', () => {
    const f = fixture()
    f.comments.splice(1)
    expect(f.fetch).toThrow('Published facts are missing')
  })

  it('does not reuse current facts captured before the outer authority snapshot', () => {
    const f = fixture(),
      readers = publishedAuthorityReaders(policy, f.readDeployment, f.read)
    const input = readers.authorityFor(100)
    f.addObservation(false)
    expect(() => readCollaborationAuthority({ ...input, reduceIssue: 100, read: f.read })).toThrow(
      'qualification conflicts',
    )
  })

  it.each(['tab', 'removed', 'malformed-unedited'] as const)(
    'does not hide a negative receipt with a %s marker',
    change => {
      const f = fixture(),
        negative = f.addObservation(false)
      negative.comment.body =
        change === 'removed'
          ? 'The facts marker was removed'
          : negative.comment.body.replace('```json ', '```json\t')
      if (change !== 'malformed-unedited') negative.comment.updated_at = '2026-10-27T10:00:31Z'
      expect(f.fetch).toThrow()
    },
  )

  it.each(['login', 'node_id', 'type'] as const)('refuses a false Bot %s', field => {
    const f = fixture()
    f.published.user[field] = 'impostor'
    expect(f.fetch).toThrow(field === 'login' ? 'facts are missing' : 'Bot identity mismatch')
  })

  it.each(['url', 'author', 'authorNodeId', 'bodySha256', 'updatedAt'] as const)(
    'binds facts to exact dispatch %s',
    field => {
      const f = fixture()
      f.facts.authority[field] = field === 'bodySha256' ? 'f'.repeat(64) : 'changed'
      f.rewrite()
      expect(f.fetch).toThrow(field === 'url' ? 'facts are missing' : 'dispatch identity mismatch')
    },
  )

  it.each(['issue', 'project'] as const)('requires the configured %s', field => {
    const f = fixture()
    if (field === 'issue') f.facts.issue = 101
    else f.facts.project.id = 'P_OTHER'
    f.rewrite()
    expect(f.fetch).toThrow('Issue or Project mismatch')
  })

  it.each([
    ['id', 203],
    ['workflow_id', 13],
    ['path', '.github/workflows/other.yml'],
    ['head_branch', 'main'],
    ['head_sha', 'f'.repeat(40)],
    ['event', 'pull_request'],
    ['run_attempt', 2],
    ['repository', { full_name: 'owner/other' }],
    ['head_repository', { full_name: 'fork/repo' }],
  ])('refuses run provenance mismatch for %s', (field, value) => {
    const f = fixture()
    Object.assign(f.run, { [String(field)]: value })
    expect(f.fetch).toThrow('workflow provenance mismatch')
  })

  it.each([
    ['in_progress', null],
    ['completed', 'failure'],
    ['completed', 'cancelled'],
  ])('refuses workflow %s/%s', (status, conclusion) => {
    const f = fixture()
    Object.assign(f.run, { status, conclusion })
    expect(f.fetch).toThrow('workflow is not successful')
  })

  it('checks the exact attempt independently of the current run', () => {
    const f = fixture()
    const read: GhRead = (args, timeout) =>
      args.at(-1)?.endsWith('/attempts/1')
        ? { ...f.run, conclusion: 'failure' }
        : f.read(args, timeout)
    expect(() => readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read)).toThrow(
      'workflow is not successful',
    )
  })

  it.each(['2026-10-27T09:59:59Z', '2026-10-27T10:01:01Z'])(
    'refuses a comment outside the attempt at %s',
    time => {
      const f = fixture()
      f.published.created_at = f.published.updated_at = time
      expect(f.fetch).toThrow('outside its workflow attempt')
    },
  )

  it('refuses an edited comment even when it retains the expected body', () => {
    const f = fixture()
    f.published.updated_at = '2026-10-27T10:00:31Z'
    expect(f.fetch).toThrow('comment was edited')
  })

  it.each(['version', 'duplicate', 'unknown'] as const)(
    'refuses %s fields in trusted facts',
    problem => {
      const f = fixture()
      if (problem === 'version')
        f.published.body = f.published.body.replace(FACTS_MARKER, 'omne-delivery-facts:v2')
      else if (problem === 'duplicate')
        f.published.body = f.published.body.replace('"issue":100', '"issue":100,"issue":100')
      else f.published.body = block(FACTS_MARKER, { ...f.facts, privilege: 'owner' })
      expect(f.fetch).toThrow()
    },
  )

  it('treats authenticated false qualification as a refusal', () => {
    const f = fixture()
    f.facts.authority.reviewer = false
    f.rewrite()
    expect(f.fetch).toThrow(expect.objectContaining({ code: 'refused' }))
  })

  it.each([false, true])(
    'refuses conflicting observations regardless of publication order, reversed=%s',
    reversed => {
      const f = fixture(),
        negative = f.addObservation(false)
      negative.comment.created_at = negative.comment.updated_at = '2026-10-27T10:00:20Z'
      if (reversed) f.comments.reverse()
      expect(f.fetch).toThrow('qualification conflicts')
    },
  )

  it('does not fall back to an older positive when a newer trusted candidate failed', () => {
    const f = fixture()
    f.addObservation(true).run.conclusion = 'failure'
    expect(f.fetch).toThrow('workflow is not successful')
  })

  it.each(['nonce', 'run'] as const)(
    'refuses duplicate %s rather than selecting one receipt',
    field => {
      const f = fixture(),
        other = f.addObservation(true)
      if (field === 'nonce') other.facts.nonce = f.facts.nonce
      else other.facts.run = f.facts.run
      other.comment.body = block(FACTS_MARKER, other.facts)
      expect(f.fetch).toThrow('operation is duplicated')
    },
  )

  it('accepts independent agreeing observations and retains both exact references', () => {
    const f = fixture()
    f.addObservation(true)
    expect(f.fetch().observations.map(item => item.reference.commentId)).toEqual([20, 21])
  })

  it('ignores an unrelated actor pretending to publish a negative qualification', () => {
    const f = fixture(),
      forged = f.addObservation(false)
    forged.comment.user.login = 'untrusted-user'
    forged.comment.user.type = 'User'
    expect(f.fetch().authority.reviewer).toBe(true)
  })

  it('skips individual reads of immutable unrelated Bot receipts but refuses edited ones', () => {
    const f = fixture()
    const receipt = {
      ...structuredClone(f.published),
      id: 22,
      body: 'Unrelated integration receipt',
      html_url: 'https://github.com/owner/repo/issues/100#issuecomment-22',
    }
    f.comments.push(receipt)
    expect(f.fetch().authority.reviewer).toBe(true)
    expect(f.calls.some(args => args.at(-1) === 'repos/owner/repo/issues/comments/22')).toBe(false)
    receipt.updated_at = '2026-10-27T10:00:31Z'
    expect(f.fetch).toThrow('comment was edited')
  })

  it('refuses a rerun that starts during the facts read', () => {
    const f = fixture()
    let currentReads = 0
    const read: GhRead = (args, timeout) => {
      if (args.at(-1) === 'repos/owner/repo/actions/runs/202' && ++currentReads === 2)
        f.run.run_attempt = 2
      return f.read(args, timeout)
    }
    expect(() => readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read)).toThrow(
      'provenance mismatch',
    )
  })

  it.each(['body', 'nodeId'] as const)('refuses publication %s changes during readback', field => {
    const f = fixture()
    let reads = 0
    const read: GhRead = (args, timeout) => {
      if (args.at(-1) === 'repos/owner/repo/issues/comments/20' && ++reads === 2) {
        if (field === 'body') f.published.body += '\nChanged'
        else f.published.user.node_id = 'BOT_OTHER'
      }
      return f.read(args, timeout)
    }
    expect(() => readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read)).toThrow(
      'changed during read',
    )
  })

  it('refuses an added negative observation during collection and refuses it again on retry', () => {
    const f = fixture()
    let added = false
    const read: GhRead = (args, timeout) => {
      if (!added && args.at(-1) === 'repos/owner/repo/actions/runs/202') {
        added = true
        f.addObservation(false)
      }
      return f.read(args, timeout)
    }
    expect(() => readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read)).toThrow(
      'collection changed during read',
    )
    expect(f.fetch).toThrow('qualification conflicts')
  })

  it('reads every comment page and refuses incomplete collections', () => {
    const f = fixture()
    for (let id = 300; id < 401; id++) f.comments.unshift(rawComment(id, 'ordinary discussion'))
    expect(f.fetch().authority.reviewer).toBe(true)
    expect(f.calls.some(args => args.at(-1)?.endsWith('page=2'))).toBe(true)
    const read: GhRead = (args, timeout) =>
      args.at(-1)?.endsWith('page=2') ? [] : f.read(args, timeout)
    expect(() => readPublishedDeliveryFacts(f.readDeployment, f.current.html_url, read)).toThrow(
      'comments-incomplete',
    )
  })
})

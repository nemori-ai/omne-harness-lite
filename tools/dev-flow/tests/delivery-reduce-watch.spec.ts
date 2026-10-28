import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { git, blob } from '../src/integration/git.ts'
import { canonical, digest } from '../src/integration/parse.ts'
import { BINDING_MARKERS, type TaskBindingV2 } from '../src/delivery/binding.ts'
import { dispatchComment } from '../src/delivery/dispatch.ts'
import { encodeRecordComment } from '../src/delivery/collaboration-comments.ts'
import {
  encodeReleaseAcceptance,
  type ReleaseAcceptanceDecision,
} from '../src/delivery/collaboration-acceptance.ts'
import {
  ACCEPTANCE_SOURCES_PATH,
  MILESTONE_MANDATE_MARKER,
  RESPONSIBILITY_MARKER,
  readAcceptanceSources,
  type AcceptanceSourceAdoption,
} from '../src/delivery/collaboration-acceptance-source.ts'
import type {
  ActiveAssignment,
  Assignment,
  Continuation,
  LineDeltaRecord,
  ReleaseRecord,
  RequestStateRecord,
} from '../src/delivery/collaboration-records.ts'
import { runReduceWatch, type ReduceWatchInput } from '../src/delivery/reduce-watch.ts'
import { runReduceWatchCli, parseReduceWatchArgs } from '../src/delivery/reduce-watch-cli.ts'
import { verifyDisposition } from '../src/delivery/reduce-watch-disposition.ts'
import type { ReduceWatchPorts } from '../src/delivery/reduce-watch-materials.ts'
import {
  block,
  dispatch,
  policy,
  rawComment,
  responsibility,
  scope,
  taskBinding,
} from './fixtures/collaboration-authority.ts'
import { BASE, FINAL, TOOL, UUID, NEXT_UUID, request, state } from './fixtures/collaboration.ts'
import { requestRunName } from '../src/delivery/collaboration-trust.ts'
import { publishedAuthorityReaders } from '../src/delivery/collaboration-facts.ts'
import { FACTS_MARKER } from '../src/integration/delivery-facts-record.ts'
import type { FactsDeployment } from '../src/integration/published-delivery-facts.ts'

const directories: string[] = []
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function temporary() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'reduce-watch-')))
  directories.push(root)
  return root
}
const text = 'fixed adopted input bytes'
const evidence = {
  url: 'https://github.com/owner/repo/blob/' + TOOL + '/input.md',
  sha256: digest(text),
  description: 'Fixed fixture input',
}
type RawComment = ReturnType<typeof rawComment>
type Card = {
  number: number
  node_id: string
  html_url: string
  body: string
  state: string
  updated_at: string
  labels: []
  milestone: { number: number; title: string }
  comments: RawComment[]
  events: { id: number; event: string; created_at: string }[]
}
function at(wave: number, minute: number) {
  return `2026-10-27T${String(8 + wave).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`
}

function fixture(
  kinds: ('active' | 'idle' | 'terminal')[] = ['idle', 'active', 'terminal'],
  milestoneMandate = false,
) {
  const root = temporary(),
    cards = new Map<number, Card>(),
    calls: string[] = []
  const releases: ReleaseRecord[] = [],
    decisions: ReleaseAcceptanceDecision[] = [],
    deltas: LineDeltaRecord[] = []
  const adoptions: AcceptanceSourceAdoption[] = []
  function card(number: number, body = ''): Card {
    const found = cards.get(number)
    if (found) return found
    const result: Card = {
      number,
      node_id: `I_${number}`,
      html_url: `https://github.com/owner/repo/issues/${number}`,
      body,
      state: 'open',
      updated_at: at(4, 59),
      labels: [],
      milestone: { number: 1, title: 'Fixture milestone' },
      comments: [],
      events: [],
    }
    cards.set(number, result)
    return result
  }
  function add(
    issue: number,
    id: number,
    body: string,
    time: string,
    author = 'owner',
  ): RawComment {
    const result = {
      ...rawComment(id, body, time, author),
      html_url: `https://github.com/owner/repo/issues/${issue}#issuecomment-${id}`,
      issue_url: `https://api.github.com/repos/owner/repo/issues/${issue}`,
    }
    card(issue).comments.push(result)
    return result
  }
  const ref = (comment: RawComment) => ({
    issue: Number(comment.issue_url.split('/').at(-1)),
    commentId: comment.id,
    sha256: digest(comment.body),
  })
  const context = (wave: number) => ({
    repo: 'owner/repo',
    milestone: 1,
    wave,
    reduceIssue: wave * 100,
    planRevision: wave,
  })
  function binding(number: number, commentId: number): TaskBindingV2 {
    const b = taskBinding(commentId)
    return {
      ...b,
      issue: {
        ...b.issue,
        number,
        id: `I_${number}`,
        url: `https://github.com/owner/repo/issues/${number}`,
      },
      attempt: `${number}-r1-a1`,
      taskBase: FINAL,
      dispatch: `https://github.com/owner/repo/issues/${number}#issuecomment-${commentId}`,
    }
  }
  function setBinding(b: TaskBindingV2) {
    card(b.issue.number).body =
      `- 交付修订：1\n- 卡负责人、主结果接受者及授权依据：${responsibility}\n\n${block(BINDING_MARKERS[2], b)}`
  }
  function active(wave: number): ActiveAssignment {
    const task = {
      ...binding(wave * 100 + 1, wave * 100 + 90),
      responsible: 'line-owner',
      branch: 'line-owner/collaboration',
    }
    setBinding(task)
    add(
      task.issue.number,
      wave * 100 + 90,
      dispatchComment('', {
        schemaVersion: 1,
        responsible: 'owner',
        basis: ['Fixture'],
        action: 'dispatch',
        task,
        confirmations: [],
      }),
      at(wave - 1, 1),
    )
    return {
      context: context(wave),
      lineParent: 10,
      finalHead: FINAL,
      mode: 'active',
      tasks: [
        { issue: task.issue.number, revision: 1, attempt: task.attempt, dispatch: task.dispatch },
      ],
      inputs: [evidence],
      acceptance: [evidence],
      toolRevision: TOOL,
      rolePolicyVersion: '820.1',
    }
  }
  const continuations: Continuation[] = kinds.map((kind, index) =>
    kind === 'terminal'
      ? { kind, reason: 'Finished', authorization: evidence }
      : kind === 'idle'
        ? { kind, next: context(index + 2), reason: 'No assigned task' }
        : { kind, assignment: active(index + 2) },
  )
  for (let wave = 1; wave <= kinds.length; wave++) {
    const issue = wave * 100,
      b = binding(issue, issue + 1),
      s = scope()
    s.context = context(wave)
    const source = add(
      issue,
      issue + 2,
      block(RESPONSIBILITY_MARKER, {
        schemaVersion: 1,
        issue: b.issue,
        revision: 1,
        fieldSha256: digest(responsibility),
        owner: { login: 'owner', nodeId: 'U_owner' },
        acceptor: { login: 'acceptor', nodeId: 'U_acceptor' },
        basis: [evidence],
      }),
      at(wave - 1, 0),
    )
    s.acceptanceResponsibility = {
      fieldSha256: digest(responsibility),
      owner: 'owner',
      acceptor: 'acceptor',
      authorization: ref(source),
    }
    const dispatchBody = dispatch(b, s, issue + 1, at(wave - 1, 1)).body
    add(issue, issue + 1, dispatchBody, at(wave - 1, 1))
    setBinding(b)
    adoptions.push({
      issue: b.issue,
      revision: 1,
      authorization: ref(source),
      authorNodeId: 'U_owner',
    })
    const writer = { login: 'owner', epoch: UUID, authorization: b.dispatch }
    const continuation = continuations[wave - 1]!
    const delta: LineDeltaRecord = {
      schemaVersion: 1,
      kind: 'delta',
      context: context(wave),
      lineParent: 10,
      operationId: randomUUID(),
      revision: wave,
      previousRecordId: wave === 1 ? null : (wave - 1) * 100 + 24,
      writer,
      finalHead: FINAL,
      integrationResults: [],
      changes: [evidence],
      externalChanges: [],
      migrations: [],
      toolRevision: TOOL,
      rolePolicyVersion: '820.1',
      continuation,
      recordedAt: at(wave, 10),
      purpose: 'release',
      newRequestId: null,
    }
    deltas.push(delta)
    const deltaComment = add(10, issue + 24, encodeRecordComment(delta), at(wave, 10))
    const release: ReleaseRecord = {
      schemaVersion: 1,
      kind: 'release',
      context: context(wave),
      operationId: randomUUID(),
      writer,
      finalHead: FINAL,
      expectedRequests: [],
      results: [],
      acceptance: evidence,
      lines: [{ lineParent: 10, delta: ref(deltaComment), continuation }],
      next: continuation.kind === 'terminal' ? null : context(wave + 1),
      recordedAt: at(wave, 40),
    }
    const decision: ReleaseAcceptanceDecision = {
      schemaVersion: 1,
      issue: b.issue,
      revision: 1,
      attempt: b.attempt,
      operationId: randomUUID(),
      decision: 'accept',
      decider: { login: 'acceptor', nodeId: 'U_acceptor' },
      authorization: ref(source),
      subject: {
        context: release.context,
        finalHead: release.finalHead,
        expectedRequests: [],
        results: [],
        lines: release.lines,
        next: release.next,
      },
      basis: [evidence],
      remaining: [],
      previous: null,
      recordedAt: at(wave, 30),
    }
    const accepted = add(
      issue,
      issue + 40,
      encodeReleaseAcceptance(decision),
      at(wave, 30),
      'acceptor',
    )
    release.acceptance = {
      url: accepted.html_url,
      sha256: digest(accepted.body),
      description: 'Adopted acceptance',
    }
    add(issue, issue + 50, encodeRecordComment(release), at(wave, 40))
    card(issue).state = 'closed'
    card(issue).events.push({ id: issue + 60, event: 'closed', created_at: at(wave, 50) })
    releases.push(release)
    decisions.push(decision)
  }
  const initial: Assignment = {
    context: context(1),
    lineParent: 10,
    finalHead: BASE,
    mode: 'idle',
    tasks: [],
    inputs: [evidence],
    acceptance: [evidence],
    toolRevision: TOOL,
    rolePolicyVersion: '820.1',
  }
  add(
    10,
    5,
    encodeRecordComment({
      schemaVersion: 1,
      kind: 'assignment',
      operationId: randomUUID(),
      writer: releases[0]!.writer,
      assignment: initial,
      recordedAt: at(0, 5),
    }),
    at(0, 5),
  )
  git(root, ['init', '--quiet'])
  git(root, ['config', 'user.name', 'Fixture'])
  git(root, ['config', 'user.email', 'fixture@example.invalid'])
  git(root, ['config', 'core.hooksPath', '/dev/null'])
  mkdirSync(join(root, 'docs/engineering'), { recursive: true })
  const grant = milestoneMandate
    ? add(
        90,
        90,
        block(MILESTONE_MANDATE_MARKER, {
          schemaVersion: 1,
          repository: 'owner/repo',
          milestone: 1,
          owner: { login: 'owner', nodeId: 'U_owner' },
          acceptor: { login: 'acceptor', nodeId: 'U_acceptor' },
          declarationAuthor: { login: 'owner', nodeId: 'U_owner' },
          basis: [evidence],
        }),
        '2026-10-27T07:00:00Z',
      )
    : undefined
  writeFileSync(
    join(root, ACCEPTANCE_SOURCES_PATH),
    JSON.stringify(
      grant === undefined
        ? { schemaVersion: 1, entries: adoptions }
        : {
            schemaVersion: 2,
            entries: [],
            mandates: [
              {
                issue: { repository: 'owner/repo', number: 90, id: 'I_90', url: card(90).html_url },
                authorization: ref(grant),
                authorNodeId: 'U_owner',
              },
            ],
          },
    ),
  )
  git(root, ['add', '.'])
  git(root, ['commit', '--quiet', '-m', 'Adopt isolated fixture sources'])
  const commit = git(root, ['rev-parse', 'HEAD']),
    source = blob(root, commit, ACCEPTANCE_SOURCES_PATH)
  const ports: ReduceWatchPorts = {
    sources: readAcceptanceSources(root, {
      commit,
      path: ACCEPTANCE_SOURCES_PATH,
      blob: source.oid,
      digest: digest(source.text),
    }),
    authorityFor: () => ({ policy }),
    readEvidence: () => text,
    read: args => {
      const path = args.at(-1) ?? ''
      calls.push(path)
      if (path === 'repos/owner/repo/environments/publish')
        return {
          protection_rules: [
            {
              type: 'required_reviewers',
              reviewers: [{ type: 'User', reviewer: { login: 'owner', node_id: 'U_owner' } }],
            },
          ],
        }
      const single = /issues\/comments\/(\d+)$/.exec(path)
      if (single) {
        for (const c of cards.values()) {
          const found = c.comments.find(item => item.id === Number(single[1]))
          if (found) return found
        }
        throw new Error('404 comment')
      }
      if (/^repos\/owner\/repo\/issues\/\d+\/parent$/.test(path))
        return { number: 10, html_url: 'https://github.com/owner/repo/issues/10' }
      const match =
        /^repos\/owner\/repo\/issues\/(\d+)(?:\/(comments|events)\?per_page=100&page=(\d+))?$/.exec(
          path,
        )
      if (match) {
        const c = cards.get(Number(match[1]))
        if (!c) throw new Error('404 card')
        if (match[2]) {
          const rows = match[2] === 'comments' ? c.comments : c.events
          return rows.slice((Number(match[3]) - 1) * 100, Number(match[3]) * 100)
        }
        return { ...c, comments: c.comments.length }
      }
      throw new Error(`unexpected fixture endpoint ${path}`)
    },
  }
  const input = (operationId = randomUUID()): ReduceWatchInput => ({
    repo: 'owner/repo',
    lineParent: 10,
    operationId,
    journal: join(root, 'watch.json'),
    file: join(root, 'events.jsonl'),
    purpose: { kind: 'wave' },
    timeoutMs: 100,
  })
  const rewrite = (wave = 1) => {
    const issue = wave * 100,
      release = releases[wave - 1]!,
      decision = decisions[wave - 1]!,
      delta = deltas[wave - 1]!
    const dc = card(10).comments.find(item => item.id === issue + 24)!
    dc.body = encodeRecordComment(delta)
    release.lines[0]!.delta = ref(dc)
    release.lines[0]!.continuation = delta.continuation
    decision.subject = {
      context: release.context,
      finalHead: release.finalHead,
      expectedRequests: release.expectedRequests,
      results: release.results,
      lines: release.lines,
      next: release.next,
    }
    const ac = card(issue).comments.find(item => item.id === issue + 40)!
    ac.body = encodeReleaseAcceptance(decision)
    release.acceptance.sha256 = digest(ac.body)
    card(issue).comments.find(item => item.id === issue + 50)!.body = encodeRecordComment(release)
  }
  return {
    root,
    ports,
    input,
    cards,
    card,
    add,
    ref,
    releases,
    decisions,
    deltas,
    calls,
    context,
    rewrite,
  }
}

function usePublishedFacts(f: ReturnType<typeof fixture>) {
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
  const runs = new Map<number, Record<string, unknown>>()
  for (const card of f.cards.values()) {
    const dispatches = card.comments.filter(comment =>
      comment.body.includes('```json omne-integration-authority:v1'),
    )
    for (const dispatch of dispatches) {
      const id = dispatch.id + 9000
      const after = (seconds: number) =>
        new Date(Date.parse(dispatch.updated_at) + seconds * 1000).toISOString()
      const comment = f.add(
        card.number,
        id,
        block(FACTS_MARKER, {
          schemaVersion: 1,
          nonce: id.toString(16).padStart(32, '0'),
          run: id,
          issue: card.number,
          authority: {
            url: dispatch.html_url,
            author: dispatch.user.login,
            authorNodeId: dispatch.user.node_id,
            bodySha256: digest(dispatch.body),
            updatedAt: dispatch.updated_at,
            reviewer: true,
          },
          project: { id: 'P_1', item: `ITEM_${card.number}`, stage: 'Ready' },
        }),
        after(30),
        deployment.bot.login,
      )
      comment.user.type = 'Bot'
      comment.user.node_id = deployment.bot.nodeId
      runs.set(id, {
        id,
        workflow_id: 12,
        path: deployment.workflow.path,
        head_branch: 'github-gate',
        head_sha: TOOL,
        event: 'workflow_dispatch',
        run_attempt: 1,
        status: 'completed',
        conclusion: 'success',
        created_at: after(0),
        run_started_at: after(1),
        updated_at: after(60),
        repository: { full_name: deployment.repository },
        head_repository: { full_name: deployment.repository },
      })
    }
  }
  const original = f.ports.read
  f.ports.read = (args, timeout) => {
    expect(args.slice(0, 3)).toEqual(['api', '--method', 'GET'])
    const path = args.at(-1) ?? ''
    expect(path).not.toContain('graphql')
    expect(path).not.toContain('/environments/')
    const run = /^repos\/owner\/repo\/actions\/runs\/(\d+)(?:\/attempts\/1)?$/.exec(path)
    return run === null ? original(args, timeout) : structuredClone(runs.get(Number(run[1])))
  }
  Object.assign(
    f.ports,
    publishedAuthorityReaders(
      policy,
      { ...deployment, workflows: [deployment.workflow] },
      f.ports.read,
    ),
  )
}

async function cli(
  f: ReturnType<typeof fixture>,
  extra: string[] = [],
  id = randomUUID(),
  signal?: AbortSignal,
) {
  const input = f.input(id),
    stdout: string[] = [],
    stderr: string[] = []
  const code = await runReduceWatchCli(
    [
      'watch',
      '--repo',
      input.repo,
      '--parent',
      '10',
      '--operation-id',
      id,
      '--journal',
      input.journal,
      '--file',
      input.file,
      '--timeout',
      '0.1',
      ...extra,
    ],
    () => f.ports,
    { stdout: s => stdout.push(s), stderr: s => stderr.push(s), ...(signal ? { signal } : {}) },
  )
  return { code, stdout, stderr, result: JSON.parse(stdout[0]!) }
}

describe('one actual reduce per original wait result', () => {
  it.each([false, true])(
    'uses the original mandate after future cards appear during the same pending wait, published=%s',
    async published => {
      const f = fixture(['idle', 'active', 'terminal'], true)
      if (published) usePublishedFacts(f)
      const sources = f.ports.sources
      const future = [200, 300, 301].map(number => f.card(number))
      for (const card of future) f.cards.delete(card.number)
      f.card(100).state = 'open'
      const pending = cli(f)
      await new Promise(resolve => setTimeout(resolve, 15))
      expect(f.calls.some(path => path === 'repos/owner/repo/issues/200')).toBe(false)
      for (const card of future) f.cards.set(card.number, card)
      f.card(100).state = 'closed'
      appendFileSync(
        f.input().file,
        JSON.stringify({
          delivery: randomUUID(),
          event: 'issues',
          action: 'closed',
          number: 100,
          state: 'closed',
          draft: null,
          base: null,
          head: null,
          marker: null,
          html_url: null,
          receivedAt: new Date().toISOString(),
        }) + '\n',
      )
      const first = await pending
      expect(first.code).toBe(0)
      expect(first.result).toMatchObject({
        reduceIssue: 100,
        currentAction: 'rearm',
        next: { reduceIssue: 200 },
      })
      expect((await cli(f)).result).toMatchObject({
        reduceIssue: 200,
        currentAction: 'prepare',
        next: { reduceIssue: 300 },
      })
      expect((await cli(f)).result).toMatchObject({
        reduceIssue: 300,
        status: 'terminal',
        next: null,
      })
      expect(f.ports.sources).toBe(sources)
      expect(sources.entries).toEqual([])
      expect(sources.mandates).toHaveLength(1)
    },
  )
  it('refuses an otherwise valid task dispatched to another line writer', async () => {
    const f = fixture(['active', 'terminal']),
      task = f.card(201)
    task.body = task.body
      .replaceAll('"responsible":"line-owner"', '"responsible":"other"')
      .replaceAll('line-owner/collaboration', 'other/collaboration')
    for (const comment of task.comments)
      comment.body = comment.body
        .replaceAll('"responsible":"line-owner"', '"responsible":"other"')
        .replaceAll('line-owner/collaboration', 'other/collaboration')
    const result = await cli(f)
    expect(result.code).toBe(2)
    expect(result.result.errorCode).toBe('watch-task-line-owner-mismatch')
  })
  it('refuses an otherwise valid task attached to a different native parent', async () => {
    const f = fixture(['active', 'terminal']),
      read = f.ports.read
    f.ports.read = (args, timeout) =>
      args.at(-1)?.endsWith('/parent')
        ? { number: 20, html_url: 'https://github.com/owner/repo/issues/20' }
        : read(args, timeout)
    const result = await cli(f)
    expect(result.code).toBe(2)
    expect(result.result.errorCode).toBe('watch-task-line-parent-mismatch')
  })
  it('refuses an initial parent assignment from a different milestone', async () => {
    const f = fixture()
    f.card(10).milestone = { number: 999, title: 'Different milestone' }
    const result = await cli(f)
    expect(result.code).toBe(2)
    expect(result.result.errorCode).toBe('watch-parent-milestone-mismatch')
  })
  it('advances idle -> active -> terminal and never skips an already closed successor', async () => {
    const f = fixture()
    const a = await cli(f)
    expect(a.code).toBe(0)
    expect(a.result).toMatchObject({
      reduceIssue: 100,
      currentAction: 'rearm',
      next: { reduceIssue: 200 },
      source: 'github-rest',
      diagnostics: [],
    })
    expect(a.result.evidence).toHaveLength(3)
    const b = await cli(f)
    expect(b.result).toMatchObject({
      reduceIssue: 200,
      currentAction: 'prepare',
      taskAuthorization: 'current',
      next: { reduceIssue: 300 },
    })
    const c = await cli(f)
    expect(c.result).toMatchObject({
      status: 'terminal',
      reduceIssue: 300,
      currentAction: 'final-handoff',
      next: null,
    })
    expect((await cli(f)).code).toBe(2)
  })
  it('persists and replays one operation without consuming another node', async () => {
    const f = fixture(),
      id = randomUUID()
    const first = await cli(f, [], id),
      replay = await cli(f, [], id)
    expect(replay.result).toEqual(first.result)
    expect(JSON.parse(readFileSync(f.input().journal, 'utf8')).current.context.reduceIssue).toBe(
      200,
    )
    expect((await cli(f)).result.reduceIssue).toBe(200)
  })
  it('rejects explicit parent conflicts and hints that skip a node', async () => {
    const f = fixture()
    expect((await cli(f, ['--watch-reduce-issue', '200'])).code).toBe(2)
    expect((await cli(f, ['--next-reduce-issue', '300'])).code).toBe(2)
    expect((await cli(f, ['--next-reduce-issue', '200'])).code).toBe(0)
  })
  it('uses a valid terminal release despite an obsolete successor hint and replays it', async () => {
    const f = fixture(['terminal', 'terminal']),
      id = randomUUID()
    const first = await cli(f, ['--next-reduce-issue', '200'], id)
    expect(first.code).toBe(0)
    expect(first.result).toMatchObject({
      status: 'terminal',
      next: null,
      currentAction: 'final-handoff',
      diagnostics: ['watch-next-hint-changed:200->terminal'],
    })
    const saved = JSON.parse(readFileSync(f.input().journal, 'utf8'))
    expect(saved.current).toMatchObject({ terminal: true, consumedWave: 1 })
    expect((await cli(f, ['--next-reduce-issue', '200'], id)).result).toEqual(first.result)
  })

  it('rearms the authoritative successor instead of an existing obsolete hint', async () => {
    const f = fixture(['idle', 'terminal'])
    const hint = JSON.parse(
      JSON.stringify(f.card(200))
        .replace(/\b2\d\d\b/g, value => String(Number(value) + 50))
        .replaceAll('I_200', 'I_250'),
    )
    f.cards.set(250, hint)
    const result = await cli(f, ['--next-reduce-issue', '250'])
    expect(result.code).toBe(0)
    expect(result.result).toMatchObject({
      status: 'released',
      next: { reduceIssue: 200 },
      currentAction: 'rearm',
      diagnostics: ['watch-next-hint-changed:250->200'],
    })
    expect(JSON.parse(readFileSync(f.input().journal, 'utf8')).current.context.reduceIssue).toBe(
      200,
    )
  })

  it('recovers an expired active node, then idle, then a currently authorized active node', async () => {
    const f = fixture(['active', 'idle', 'active', 'terminal'])
    f.card(201).state = 'closed'
    const first = await cli(f)
    expect(first.result).toMatchObject({
      reduceIssue: 100,
      currentAction: 'recover-next',
      taskAuthorization: 'historical',
      continuation: { kind: 'active' },
    })
    expect((await cli(f)).result).toMatchObject({ reduceIssue: 200, currentAction: 'rearm' })
    expect((await cli(f)).result).toMatchObject({ reduceIssue: 300, currentAction: 'prepare' })
  })
  it('keeps an expired task blocked without proof of the next completed reduce', async () => {
    const f = fixture(['active', 'terminal'])
    f.card(201).state = 'closed'
    f.card(200).state = 'open'
    expect((await cli(f)).code).toBe(2)
    expect(JSON.parse(readFileSync(f.input().journal, 'utf8')).current.context.reduceIssue).toBe(
      100,
    )
  })
  it('does not reuse successful receipt as permission after reopening', async () => {
    const f = fixture(),
      id = randomUUID()
    expect((await cli(f, [], id)).code).toBe(0)
    f.card(100).events.push(
      { id: 170, event: 'reopened', created_at: at(1, 51) },
      { id: 171, event: 'closed', created_at: at(1, 52) },
    )
    expect((await cli(f, [], id)).code).toBe(2)
    expect(JSON.parse(readFileSync(f.input().journal, 'utf8')).operations[0].result.status).toBe(
      'released',
    )
  })
  it('returns only one JSON and distinct timeout/cancel/unknown exit codes', async () => {
    const f = fixture()
    f.card(100).state = 'open'
    const timed = await cli(f)
    expect(timed.code).toBe(3)
    expect(timed.stdout).toHaveLength(1)
    expect(timed.result.released).toBe(false)
    const controller = new AbortController()
    controller.abort()
    expect((await cli(f, [], randomUUID(), controller.signal)).code).toBe(130)
    f.ports.read = () => {
      throw new Error('network secret must not leak')
    }
    const unknown = await cli(f)
    expect(unknown.code).toBe(2)
    expect(unknown.stdout.join('')).not.toContain('secret')
  })
  it('does not poll GitHub while the local event wait is idle', async () => {
    const f = fixture()
    f.card(100).state = 'open'
    const pending = cli(f)
    await new Promise(resolve => setTimeout(resolve, 20))
    const reads = f.calls.length
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(f.calls.length).toBe(reads)
    expect((await pending).code).toBe(3)
  })
  it('returns through the same pending promise after a real local event append and authoritative close', async () => {
    const f = fixture()
    f.card(100).state = 'open'
    const pending = cli(f)
    await new Promise(resolve => setTimeout(resolve, 15))
    f.card(100).state = 'closed'
    appendFileSync(
      f.input().file,
      JSON.stringify({
        delivery: randomUUID(),
        event: 'issues',
        action: 'closed',
        number: 100,
        state: 'closed',
        draft: null,
        base: null,
        head: null,
        marker: null,
        html_url: null,
        receivedAt: new Date().toISOString(),
      }) + '\n',
    )
    expect((await pending).code).toBe(0)
  })
})

describe('release closure and material guards', () => {
  it.each([
    'release missing',
    'delta changed',
    'pending result',
    'wrong signature',
    'early close',
    'next missing',
    'material changed',
  ])('refuses %s', async problem => {
    const f = fixture()
    if (problem === 'release missing')
      f.card(100).comments = f.card(100).comments.filter(c => c.id !== 150)
    if (problem === 'delta changed') f.card(10).comments.find(c => c.id === 124)!.body += '\n'
    if (problem === 'pending result') {
      f.releases[0]!.expectedRequests = [UUID]
      f.releases[0]!.results = [{ issue: 100, commentId: 123, sha256: digest(text) }]
      f.rewrite()
    }
    if (problem === 'wrong signature') {
      f.decisions[0]!.decider = { login: 'owner', nodeId: 'U_owner' }
      f.rewrite()
    }
    if (problem === 'early close') f.card(100).events[0]!.created_at = at(1, 39)
    if (problem === 'next missing') f.cards.delete(200)
    if (problem === 'material changed') {
      await cli(f)
      f.ports.readEvidence = () => 'changed'
    }
    expect((await cli(f)).code).toBe(2)
  })
  it('rejects unknown schemas and duplicate options at the driver boundary', async () => {
    expect(() => parseReduceWatchArgs(['--repo', 'owner/repo', '--repo', 'owner/repo'])).toThrow()
    expect(() => parseReduceWatchArgs(['--made-up', 'true'])).toThrow()
    const f = fixture()
    f.card(100).comments.find(c => c.id === 150)!.body = f
      .card(100)
      .comments.find(c => c.id === 150)!
      .body.replace('"schemaVersion":1', '"schemaVersion":99')
    expect((await cli(f)).code).toBe(2)
  })
  it('prevents simultaneous operations on one line cursor', async () => {
    const f = fixture()
    f.card(100).state = 'open'
    const pending = cli(f)
    await new Promise(resolve => setTimeout(resolve, 10))
    const conflict = await cli(f)
    expect(conflict.code).toBe(2)
    expect(conflict.result.errorCode).toContain('already-running')
    await pending
  })
})

function blockedFixture(action: 'takeover' | 'redispatch' | 'rescope') {
  const f = fixture(['active', 'terminal'])
  const r = request()
  r.input = {
    ...r.input,
    outcome: 'blocked',
    pull: null,
    reason: 'Missing contract',
    remaining: ['finish task'],
    report: evidence,
    stopped: { writers: ['old'], confirmed: true, evidence },
  }
  r.input.tasks = [
    {
      issue: 11,
      revision: 1,
      attempt: '11-r1-a1',
      dispatch: 'https://github.com/owner/repo/issues/11#issuecomment-9',
    },
  ]
  r.workflow.inputDigest = digest(canonical(r.input))
  const receipt = f.add(100, 120, encodeRecordComment(r), at(1, 0), 'github-actions[bot]')
  receipt.user.type = 'Bot'
  const original = f.ports.read
  f.ports.read = (args, timeout) =>
    (args.at(-1) ?? '').includes('/actions/runs/')
      ? {
          repository: { full_name: 'owner/repo' },
          id: r.workflow.runId,
          run_attempt: 1,
          path: r.workflow.path,
          head_branch: r.workflow.ref,
          head_sha: r.workflow.head,
          event: 'workflow_dispatch',
          display_title: requestRunName(r.input, r.workflow.inputDigest),
          actor: { login: 'line-owner' },
          triggering_actor: { login: 'line-owner' },
          created_at: at(1, 0),
          status: 'completed',
          conclusion: 'success',
        }
      : original(args, timeout)
  const dispositionState: RequestStateRecord = {
    ...state(),
    requestHead: null,
    candidateHead: null,
    targetBase: null,
    mergeCommit: null,
    workflow: null,
    verification: [],
    writer: f.releases[0]!.writer,
    state: action === 'takeover' ? 'blocked' : 'superseded',
    recordedAt: at(1, 15),
    disposition: null,
  }
  if (action === 'takeover')
    dispositionState.disposition = {
      action,
      remainingOwner: 'owner',
      waitReduceIssue: 100,
      evidence: [evidence],
    }
  else if (action === 'rescope')
    dispositionState.disposition = {
      action,
      remainingOwner: 'owner',
      continuation: { kind: 'terminal', reason: 'Cancelled scope', authorization: evidence },
      authorization: evidence,
      consumerImpact: [evidence],
    }
  else {
    const old = f.deltas[0]!.continuation
    if (old.kind !== 'active') throw new Error('fixture active assignment required')
    const assignment: ActiveAssignment = { ...old.assignment, context: f.context(1) }
    const delta: LineDeltaRecord = {
      ...f.deltas[0]!,
      purpose: 'redispatch',
      newRequestId: NEXT_UUID,
      continuation: { kind: 'active', assignment },
    }
    f.card(10).comments = f.card(10).comments.filter(c => c.id !== 124 && c.id !== 224)
    const dc = f.add(10, 124, encodeRecordComment(delta), at(1, 10))
    dispositionState.disposition = {
      action,
      remainingOwner: 'line-owner',
      newRequestId: NEXT_UUID,
      assignment,
      delta: f.ref(dc),
      oldWritersStopped: evidence,
      reduceWriteReleased: evidence,
      authorization: evidence,
    }
  }
  const sc = f.add(100, 123, encodeRecordComment(dispositionState), at(1, 15))
  f.card(100).state = 'open'
  f.card(100).comments = f.card(100).comments.filter(c => c.id !== 140 && c.id !== 150)
  return {
    ...f,
    r,
    dispositionState,
    sc,
    inputDisposition: () => ({
      ...f.input(),
      purpose: { kind: 'disposition' as const, requestId: r.input.requestId, tasks: r.input.tasks },
    }),
  }
}

describe('non-success disposition while the current reduce stays open', () => {
  it.each(['takeover', 'rescope', 'redispatch'] as const)(
    'validates unpublished %s material before the state write',
    action => {
      const f = blockedFixture(action)
      f.card(100).comments = f.card(100).comments.filter(c => c.id !== f.sc.id)
      const verify = () =>
        verifyDisposition(f.ports, f.context(1), 10, f.r.input, f.dispositionState)
      expect(verify).not.toThrow()
      f.ports.readEvidence = () => 'changed material'
      expect(verify).toThrow('watch-material-digest-mismatch')
      expect(f.card(100).comments.some(c => c.id === f.sc.id)).toBe(false)
    },
  )
  it('rejects another request target before publishing disposition', () => {
    const f = blockedFixture('takeover')
    expect(() =>
      verifyDisposition(f.ports, f.context(1), 99, f.r.input, f.dispositionState),
    ).toThrow('watch-disposition-target-mismatch')
  })

  it('does not grant an old redispatch after the new attempt has handed off', async () => {
    const f = blockedFixture('redispatch'),
      input = f.inputDisposition()
    const first = await runReduceWatch(input, f.ports)
    if (first.status !== 'disposition' || first.facts.disposition.action !== 'redispatch')
      throw new Error('Expected redispatch fixture')
    const receipt = structuredClone(f.r)
    receipt.input.requestId = first.facts.disposition.newRequestId
    receipt.input.tasks = first.facts.disposition.assignment.tasks
    receipt.workflow.runId += 1
    receipt.workflow.inputDigest = digest(canonical(receipt.input))
    const posted = f.add(100, 126, encodeRecordComment(receipt), at(1, 20), 'github-actions[bot]')
    posted.user.type = 'Bot'
    const read = f.ports.read
    f.ports.read = (args, timeout) =>
      args.at(-1)?.includes(`/actions/runs/${receipt.workflow.runId}/`)
        ? {
            repository: { full_name: 'owner/repo' },
            id: receipt.workflow.runId,
            run_attempt: 1,
            path: receipt.workflow.path,
            head_branch: receipt.workflow.ref,
            head_sha: receipt.workflow.head,
            event: 'workflow_dispatch',
            display_title: requestRunName(receipt.input, receipt.workflow.inputDigest),
            actor: { login: 'line-owner' },
            triggering_actor: { login: 'line-owner' },
            created_at: at(1, 20),
            status: 'completed',
            conclusion: 'success',
          }
        : read(args, timeout)
    const saved = readFileSync(input.journal, 'utf8')
    await expect(runReduceWatch(input, f.ports)).rejects.toThrow('watch-task-already-handed-off')
    expect(readFileSync(input.journal, 'utf8')).toBe(saved)
  })
  it.each(['takeover', 'rescope'] as const)(
    '%s returns current wave rearm without treating disposition as release',
    async action => {
      const f = blockedFixture(action)
      const result = await runReduceWatch(f.inputDisposition(), f.ports)
      expect(result).toMatchObject({
        status: 'disposition',
        currentAction: 'rearm',
        next: { reduceIssue: 100 },
        wave: 1,
      })
      expect(JSON.parse(readFileSync(f.input().journal, 'utf8')).current.consumedWave).toBe(0)
    },
  )
  it('explicit redispatch returns a new attempt in the same wave without waiting for closure', async () => {
    const f = blockedFixture('redispatch')
    const result = await runReduceWatch(f.inputDisposition(), f.ports)
    expect(result).toMatchObject({
      status: 'disposition',
      currentAction: 'prepare',
      wave: 1,
      next: { reduceIssue: 100 },
      facts: { disposition: { newRequestId: NEXT_UUID } },
    })
    expect(f.card(100).state).toBe('open')
    expect(JSON.parse(readFileSync(f.input().journal, 'utf8')).current.consumedWave).toBe(0)
  })
  it('does not consume a late receipt for a different old attempt', async () => {
    const f = blockedFixture('takeover'),
      input = f.inputDisposition()
    input.purpose.tasks = [{ ...input.purpose.tasks[0], attempt: '11-r1-a2' }]
    await expect(runReduceWatch(input, f.ports)).rejects.toThrow('attempt-stale')
  })
  it('refuses redispatch when stopped-writer evidence cannot be read back', async () => {
    const f = blockedFixture('redispatch')
    f.ports.readEvidence = () => 'unknown'
    await expect(runReduceWatch(f.inputDisposition(), f.ports)).rejects.toThrow('material-digest')
  })
  it('refuses reusing the old attempt for a new request', async () => {
    const f = blockedFixture('redispatch')
    if (f.dispositionState.disposition?.action !== 'redispatch') throw new Error('fixture')
    f.dispositionState.disposition.assignment.tasks = f.r.input.tasks
    f.sc.body = encodeRecordComment(f.dispositionState)
    await expect(runReduceWatch(f.inputDisposition(), f.ports)).rejects.toThrow('old-attempt')
  })
  it('keeps an undisposed registered result pending', async () => {
    const f = blockedFixture('takeover')
    f.dispositionState.disposition = null
    f.sc.body = encodeRecordComment(f.dispositionState)
    await expect(runReduceWatch(f.inputDisposition(), f.ports)).rejects.toThrow('No matching event')
  })
  it('rejects an untrusted request marker instead of granting redispatch', async () => {
    const f = blockedFixture('redispatch')
    f.card(100).comments.find(c => c.id === 120)!.user.type = 'User'
    await expect(runReduceWatch(f.inputDisposition(), f.ports)).rejects.toThrow('author-untrusted')
  })
})

describe('executable injected-bootstrap driver', () => {
  it('runs the actual Node driver with a committed isolated adoption and REST transport fixture', () => {
    const f = fixture(),
      input = f.input()
    writeFileSync(
      join(f.root, 'fixture.json'),
      JSON.stringify({ cards: [...f.cards], source: f.ports.sources.source }),
    )
    const driver = new URL('../src/delivery/reduce-watch-cli.ts', import.meta.url).href
    const sources = new URL('../src/delivery/collaboration-acceptance-source.ts', import.meta.url)
      .href
    const policies = new URL('./fixtures/collaboration-authority.ts', import.meta.url).href
    const script = `
import { readFileSync } from 'node:fs'
import { runReduceWatchCli } from ${JSON.stringify(driver)}
import { readAcceptanceSources } from ${JSON.stringify(sources)}
import { policy } from ${JSON.stringify(policies)}
const root = ${JSON.stringify(f.root)}
const data = JSON.parse(readFileSync(root + '/fixture.json', 'utf8'))
const cards = new Map(data.cards)
const read = args => {
 const path = args.at(-1)
 if (path.endsWith('/environments/publish')) return { protection_rules: [{ type: 'required_reviewers', reviewers: [{type:'User',reviewer:{login:'owner',node_id:'U_owner'}}] }] }
 const single = /issues\\/comments\\/(\\d+)$/.exec(path)
 if (single) { for (const card of cards.values()) { const comment = card.comments.find(c => c.id === Number(single[1])); if (comment) return comment } }
 const match = /issues\\/(\\d+)(?:\\/(comments|events)\\?per_page=100&page=(\\d+))?$/.exec(path)
 if (match) { const card = cards.get(Number(match[1])); if (!card) throw Error('missing'); if (match[2]) return card[match[2]].slice((Number(match[3])-1)*100,Number(match[3])*100); return {...card, comments:card.comments.length} }
 throw Error('unexpected fixture endpoint')
}
process.exitCode = await runReduceWatchCli(process.argv.slice(2), () => ({ read, authorityFor: () => ({policy}), sources: readAcceptanceSources(root, data.source), readEvidence: () => ${JSON.stringify(text)} }), {stdout:s=>process.stdout.write(s), stderr:s=>process.stderr.write(s)})
`
    const entry = join(f.root, 'fixture-driver.mjs')
    writeFileSync(entry, script)
    const output = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        entry,
        '--repo',
        input.repo,
        '--parent',
        '10',
        '--operation-id',
        input.operationId,
        '--journal',
        input.journal,
        '--file',
        input.file,
      ],
      { encoding: 'utf8' },
    )
    expect(output.trim().split('\n')).toHaveLength(1)
    expect(JSON.parse(output)).toMatchObject({
      status: 'released',
      reduceIssue: 100,
      currentAction: 'rearm',
    })
  })
  it('has no permissive default bootstrap or caller-selected module override', () => {
    const f = fixture(),
      input = f.input()
    try {
      execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          fileURLToPath(new URL('../src/delivery/reduce-watch-cli.ts', import.meta.url)),
          '--repo',
          input.repo,
          '--parent',
          '10',
          '--operation-id',
          input.operationId,
          '--journal',
          input.journal,
          '--file',
          input.file,
        ],
        { encoding: 'utf8', stdio: 'pipe' },
      )
      throw new Error('expected closed bootstrap failure')
    } catch (error) {
      expect(error).toMatchObject({ status: 2 })
      if (!(error instanceof Error) || !('stdout' in error)) throw error
      expect(JSON.parse(String(error.stdout))).toMatchObject({ status: 'unknown', released: false })
    }
    expect(() => parseReduceWatchArgs(['--bootstrap', pathToFileURL(f.root).href])).toThrow()
  })
})

describe('explicit crashed-wait recovery', () => {
  it('reclaims only a stopped local process lock and continues the saved operation', async () => {
    const f = fixture(),
      input = f.input()
    f.card(100).state = 'open'
    await expect(runReduceWatch(input, f.ports)).rejects.toThrow('No matching event')
    const deadPid = Number(
      execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], {
        encoding: 'utf8',
      }),
    )
    writeFileSync(`${input.journal}.lock`, JSON.stringify({ host: hostname(), pid: deadPid }))
    f.card(100).state = 'closed'
    expect((await runReduceWatch({ ...input, recoverLock: true }, f.ports)).reduceIssue).toBe(100)
  })
  it('refuses a still-live or foreign-host lock', async () => {
    const f = fixture(),
      input = f.input()
    writeFileSync(`${input.journal}.lock`, JSON.stringify({ host: hostname(), pid: process.pid }))
    await expect(runReduceWatch({ ...input, recoverLock: true }, f.ports)).rejects.toThrow(
      'still-running',
    )
    writeFileSync(
      `${input.journal}.lock`,
      JSON.stringify({ host: 'another-host', pid: process.pid }),
    )
    await expect(runReduceWatch({ ...input, recoverLock: true }, f.ports)).rejects.toThrow(
      'foreign-host',
    )
  })
  it('preserves an old receipt after a newer acceptance revocation', async () => {
    const f = fixture(),
      id = randomUUID()
    expect((await cli(f, [], id)).code).toBe(0)
    const original = f.card(100).comments.find(c => c.id === 140)!
    const revoked: ReleaseAcceptanceDecision = {
      ...f.decisions[0]!,
      operationId: randomUUID(),
      decision: 'revoke',
      previous: f.ref(original),
      recordedAt: at(1, 55),
    }
    f.add(100, 180, encodeReleaseAcceptance(revoked), at(1, 55), 'acceptor')
    const refused = await cli(f, [], id)
    expect(refused.code).toBe(2)
    expect(refused.result.released).toBe(false)
    expect(JSON.parse(readFileSync(f.input().journal, 'utf8')).operations[0].result.status).toBe(
      'released',
    )
  })
})

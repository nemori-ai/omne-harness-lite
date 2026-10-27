import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonical, digest } from '../src/integration/parse.ts'
import { BINDING_MARKERS, type TaskBindingV2 } from '../src/delivery/binding.ts'
import { encodeRecordComment } from '../src/delivery/collaboration-comments.ts'
import type { ActiveAssignment, RequestInput } from '../src/delivery/collaboration-records.ts'
import { requestRunName } from '../src/delivery/collaboration-trust.ts'
import { dispatchComment } from '../src/delivery/dispatch.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { registerIntegrationRequest } from '../src/delivery/integration-request-action.ts'
import { runIntegrationRequestAction } from '../src/delivery/integration-request-action-cli.ts'
import { runIntegrationRequestCli } from '../src/delivery/integration-request-cli.ts'
import {
  githubRequestEvidence,
  verifyRequestEvidence,
} from '../src/delivery/integration-request-evidence.ts'
import { RequestJournal } from '../src/delivery/integration-request-journal.ts'
import { findRequestRuns } from '../src/delivery/integration-request-runs.ts'
import { submitIntegrationRequest } from '../src/delivery/integration-request.ts'
import {
  backend,
  block,
  policy,
  rawComment,
  taskBinding,
} from './fixtures/collaboration-authority.ts'
import {
  HEAD,
  NEXT_UUID,
  request,
  requestInput,
  state,
  delta,
  assignment,
  TIME,
  TOOL,
  UUID,
} from './fixtures/collaboration.ts'

const directories: string[] = []
function temporary(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'integration-request-')))
  directories.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fixture() {
  const api = backend(),
    input = requestInput()
  input.targetRef = 'integration/runtime'
  const binding: TaskBindingV2 = {
    ...taskBinding(),
    issue: {
      repository: 'owner/repo',
      number: 11,
      id: 'I_11',
      url: 'https://github.com/owner/repo/issues/11',
    },
    responsible: 'line-owner',
    branch: 'line-owner/task',
    attempt: '11-r1-a1',
    dispatch: 'https://github.com/owner/repo/issues/11#issuecomment-2',
    line: 'tools',
  }
  input.tasks = [{ issue: 11, revision: 1, attempt: binding.attempt, dispatch: binding.dispatch }]
  const decision = {
    ...rawComment(
      2,
      dispatchComment('', {
        schemaVersion: 1,
        responsible: 'owner',
        basis: ['Fixture authority'],
        action: 'dispatch',
        task: binding,
        confirmations: [],
      }),
    ),
    html_url: binding.dispatch,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/11',
  }
  const card = {
    ...api.data,
    number: 11,
    node_id: 'I_11',
    html_url: binding.issue.url,
    body: `- 交付修订：1\n${block(BINDING_MARKERS[2], binding)}`,
    comments: 1,
  }
  const parent = {
    ...api.data,
    number: 10,
    node_id: 'I_10',
    html_url: 'https://github.com/owner/repo/issues/10',
  }
  const report = rawComment(
    9,
    'Report: remaining work and actual verification.',
    TIME,
    'line-owner',
  )
  const stopped = rawComment(
    10,
    'line-owner-session stopped; child build PID 123 exited; no remaining writers.',
    TIME,
    'line-owner',
  )
  api.comments.push(report, stopped)
  input.report = { url: report.html_url, sha256: digest(report.body), description: 'Frozen report' }
  input.verification = [{ ...input.report }]
  input.stopped.evidence = {
    url: stopped.html_url,
    sha256: digest(stopped.body),
    description: 'Named writer stop declaration',
  }
  const pull = {
    number: 12,
    html_url: 'https://github.com/owner/repo/pull/12',
    state: 'open',
    merged: false,
    draft: false,
    head: { sha: HEAD, ref: binding.branch, repo: { full_name: 'owner/repo' } },
    base: { ref: input.targetRef, repo: { full_name: 'owner/repo' } },
  }
  const runs: ReturnType<typeof runValue>[] = []
  function runValue(requestInput: RequestInput, id = 30, attempt = 1) {
    return {
      id,
      run_attempt: attempt,
      path: '.github/workflows/integration-request.yml',
      head_branch: 'github-gate',
      head_sha: TOOL,
      event: 'workflow_dispatch',
      display_title: requestRunName(requestInput, digest(canonical(requestInput))),
      repository: { full_name: 'owner/repo' },
      actor: { login: 'line-owner' },
      triggering_actor: { login: 'line-owner' },
      created_at: TIME,
      status: 'in_progress',
      conclusion: null as string | null,
    }
  }
  let nextRunId = 30
  const posts: string[][] = []
  let lostDispatch = false,
    lostComment = false,
    dropDispatch = false,
    dropComment = false
  const call: GhCommand = argv => {
    const path = argv.find(arg => arg.startsWith('repos/') || arg === 'user') ?? ''
    if (argv.includes('POST')) {
      posts.push([...argv])
      if (path.endsWith('/dispatches')) {
        const json = argv
          .find(arg => arg.startsWith('inputs[request]='))
          ?.slice('inputs[request]='.length)
        if (json === undefined) throw new Error('Missing dispatch request')
        const value: unknown = JSON.parse(json)
        expect(value).toEqual(input)
        const runId = nextRunId++
        if (!dropDispatch) runs.push(runValue(input, runId))
        if (lostDispatch) throw new Error('Lost dispatch response')
        return {
          workflow_run_id: runId,
          run_url: `https://api.github.com/repos/owner/repo/actions/runs/${runId}`,
          html_url: `https://github.com/owner/repo/actions/runs/${runId}`,
        }
      }
      if (path.endsWith('/issues/100/comments')) {
        const body = argv.find(arg => arg.startsWith('body='))?.slice(5)
        if (body === undefined) throw new Error('Missing receipt')
        if (!dropComment)
          api.comments.push({
            ...rawComment(40, body, new Date().toISOString(), 'github-actions[bot]'),
            user: { login: 'github-actions[bot]', node_id: 'BOT', type: 'Bot' },
          })
        if (lostComment) throw new Error('Lost comment response')
        return api.comments.at(-1)
      }
      throw new Error(`Unexpected POST ${path}`)
    }
    if (path === 'user') return { login: 'line-owner', type: 'User' }
    if (path === 'repos/owner/repo/issues/10') return parent
    if (path === 'repos/owner/repo/issues/11') return card
    if (path === 'repos/owner/repo/issues/11/comments?per_page=100&page=1') return [decision]
    if (path === 'repos/owner/repo/issues/comments/2') return decision
    if (path === 'repos/owner/repo/issues/11/parent') return parent
    if (path === 'repos/owner/repo/pulls/12') return pull
    if (path === 'repos/owner/repo/git/ref/heads/github-gate')
      return { ref: 'refs/heads/github-gate', object: { sha: TOOL } }
    if (path.includes('/actions/workflows/integration-request.yml/runs?')) {
      const page = Number(new URL('https://fixture/' + path).searchParams.get('page'))
      return { total_count: runs.length, workflow_runs: runs.slice((page - 1) * 100, page * 100) }
    }
    const attempt = /actions\/runs\/(\d+)\/attempts\/(\d+)$/.exec(path)
    if (attempt !== null) {
      const run = runs.find(run => run.id === Number(attempt[1]))
      if (run === undefined) throw new Error('Missing run')
      return { ...run, run_attempt: Number(attempt[2]) }
    }
    return api.read(argv, 15_000)
  }
  const journalRoot = temporary()
  const options = {
    mode: 'submit' as const,
    input,
    operationId: NEXT_UUID,
    journalRoot,
    bootstrap: { policy },
    call,
  }
  const workflow = () => ({ ...request().workflow, inputDigest: digest(canonical(input)) })
  const action = () =>
    registerIntegrationRequest({
      input,
      workflow: workflow(),
      bootstrap: { policy },
      journalRoot: temporary(),
      call,
    })
  return {
    api,
    input,
    binding,
    decision,
    card,
    parent,
    pull,
    runs,
    runValue,
    posts,
    call,
    options,
    action,
    workflow,
    dispatchLoss: (drop = false) => {
      lostDispatch = true
      dropDispatch = drop
    },
    commentLoss: (drop = false) => {
      lostComment = true
      dropComment = drop
    },
  }
}

describe('integration request command to trusted Action receipt', () => {
  it.each(['ready', 'blocked', 'failed'] as const)(
    'hands over %s only after exact successful Action readback',
    outcome => {
      const f = fixture()
      if (outcome !== 'ready') {
        Object.assign(f.input, {
          outcome,
          pull: null,
          reason: 'Required input unavailable',
          remaining: ['Remaining implementation'],
        })
      }
      const first = submitIntegrationRequest(f.options)
      expect(first.status).toBe('unknown')
      expect(first.evidence.receipt).toBeNull()
      expect(f.posts).toHaveLength(1)
      expect(f.action().status).toBe('recorded')
      expect(submitIntegrationRequest({ ...f.options, mode: 'recover' }).status).toBe('unknown')
      f.runs[0]!.status = 'completed'
      f.runs[0]!.conclusion = 'success'
      for (let retry = 0; retry < 3; retry++) {
        const result = submitIntegrationRequest({ ...f.options, mode: 'recover' })
        expect(result.status).toBe('registered')
        expect(result.outcome).toBe(outcome)
        expect(result.evidence.receipt?.commentId).toBe(40)
      }
      expect(f.posts).toHaveLength(2)
      expect(
        f.api.comments.filter(comment => comment.body.includes('<!-- integration-request -->')),
      ).toHaveLength(1)
    },
  )

  it('recovers a lost dispatch response without another POST or request ID', () => {
    const f = fixture()
    f.dispatchLoss()
    expect(submitIntegrationRequest(f.options).status).toBe('unknown')
    expect(f.action().status).toBe('recorded')
    f.runs[0]!.status = 'completed'
    f.runs[0]!.conclusion = 'success'
    expect(submitIntegrationRequest(f.options).status).toBe('registered')
    expect(f.posts.filter(post => post.some(arg => arg.endsWith('/dispatches')))).toHaveLength(1)
  })

  it('keeps absent dispatch outcome unknown through submit and recover retries', () => {
    const f = fixture()
    f.dispatchLoss(true)
    for (let retry = 0; retry < 3; retry++)
      expect(submitIntegrationRequest(f.options).status).toBe('unknown')
    expect(f.posts).toHaveLength(1)
    const journal = new RequestJournal(f.options.journalRoot, f.input)
    expect(journal.attempted).toBe(true)
    expect(journal.read()?.input).toEqual(f.input)
  })

  it('recovers a lost comment response and reuses an already successful receipt on rerun', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    f.commentLoss()
    expect(f.action().status).toBe('recorded')
    f.runs[0]!.status = 'completed'
    f.runs[0]!.conclusion = 'success'
    const priorCall = f.call
    const rerun: GhCommand = (argv, timeout) => {
      if (argv.some(arg => arg.endsWith('/attempts/2')))
        return { ...f.runs[0], run_attempt: 2, status: 'in_progress', conclusion: null }
      return priorCall(argv, timeout)
    }
    const result = registerIntegrationRequest({
      input: f.input,
      workflow: { ...f.workflow(), runAttempt: 2 },
      bootstrap: { policy },
      journalRoot: temporary(),
      call: rerun,
    })
    expect(result.status).toBe('reused')
    expect(f.posts).toHaveLength(2)
  })

  it('does not repost after a failed Action with an unknown comment outcome', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    f.commentLoss(true)
    expect(f.action().status).toBe('unknown')
    f.runs[0]!.run_attempt = 2
    const result = registerIntegrationRequest({
      input: f.input,
      workflow: { ...f.workflow(), runAttempt: 2 },
      bootstrap: { policy },
      journalRoot: temporary(),
      call: f.call,
    })
    expect(result.status).toBe('unknown')
    expect(f.posts).toHaveLength(2)
  })

  it('rejects changed input under the stable request identity before dispatch', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    f.input.report.description = 'Changed after freeze'
    expect(() => submitIntegrationRequest(f.options)).toThrow('journal-conflict')
    expect(f.posts).toHaveLength(1)
  })

  it.each(['head', 'draft', 'parent', 'attempt', 'target', 'report', 'stopped', 'actor'] as const)(
    'refuses %s drift before any mutation',
    kind => {
      const f = fixture()
      switch (kind) {
        case 'head':
          f.pull.head.sha = 'f'.repeat(40)
          break
        case 'draft':
          f.pull.draft = true
          break
        case 'parent':
          f.parent.number = 999
          break
        case 'attempt':
          f.input.tasks[0].attempt = 'old-attempt'
          break
        case 'target':
          f.input.targetRef = 'integration/unrelated'
          break
        case 'report':
          f.input.report.sha256 = 'f'.repeat(64)
          break
        case 'stopped':
          f.input.stopped.evidence.sha256 = 'f'.repeat(64)
          break
        case 'actor': {
          const original = f.options.call
          f.options.call = (argv, timeout) =>
            argv.at(-1) === 'user' ? { login: 'stranger' } : original(argv, timeout)
          break
        }
      }
      expect(() => submitIntegrationRequest(f.options)).toThrow()
      expect(f.posts).toHaveLength(0)
    },
  )

  it('permits a draft PR for a non-success handoff', () => {
    const f = fixture()
    f.pull.draft = true
    Object.assign(f.input, {
      outcome: 'blocked',
      reason: 'Missing dependency',
      remaining: ['Finish implementation'],
    })
    expect(submitIntegrationRequest(f.options).status).toBe('unknown')
    expect(f.posts).toHaveLength(1)
  })

  it('reports Action failure distinctly without registering', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    f.runs[0]!.status = 'completed'
    f.runs[0]!.conclusion = 'failure'
    expect(submitIntegrationRequest({ ...f.options, mode: 'recover' })).toMatchObject({
      status: 'failed',
      errorCode: 'integration-request-action-failed',
    })
    expect(f.posts).toHaveLength(1)
  })

  it.each(['actor', 'head', 'input', 'repo'] as const)(
    'rejects mismatched Action %s before registration',
    kind => {
      const f = fixture()
      submitIntegrationRequest(f.options)
      const run = f.runs[0]!
      if (kind === 'actor') run.actor.login = 'stranger'
      if (kind === 'head') run.head_sha = 'f'.repeat(40)
      if (kind === 'input') run.display_title += '-different'
      if (kind === 'repo') run.repository.full_name = 'other/repo'
      expect(() => f.action()).toThrow()
      expect(f.posts).toHaveLength(1)
    },
  )

  it('refuses a user-forged marker even when the payload matches', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    const record = { ...request(), input: f.input, workflow: f.workflow() }
    f.api.comments.push(rawComment(40, encodeRecordComment(record), TIME, 'line-owner'))
    expect(() => submitIntegrationRequest({ ...f.options, mode: 'recover' })).toThrow(
      'author-untrusted',
    )
    expect(f.posts).toHaveLength(1)
  })

  it('does not reopen a line with a new request before authorized replacement', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    f.action()
    f.runs[0]!.status = 'completed'
    f.runs[0]!.conclusion = 'success'
    f.input.requestId = NEXT_UUID
    expect(() => submitIntegrationRequest(f.options)).toThrow('line-already-active')
    expect(f.posts).toHaveLength(2)
  })

  it('refuses truncated workflow pagination rather than selecting the latest run', () => {
    const f = fixture()
    const read: GhCommand = (argv, timeout) =>
      argv.some(arg => arg.includes('/runs?'))
        ? { total_count: 2, workflow_runs: [f.runValue(f.input)] }
        : f.call(argv, timeout)
    f.runs.push(f.runValue(f.input))
    expect(() => findRequestRuns(f.input, f.workflow(), read)).toThrow('runs-incomplete')
  })

  it('passes injection-shaped report text only as data and never reads arbitrary origins with credentials', () => {
    const f = fixture()
    const comment = f.api.comments.find(item => item.id === 9)!
    comment.body = '$(touch /tmp/forbidden) `uname` ${secrets.TOKEN}'
    f.input.report.sha256 = digest(comment.body)
    f.input.verification = [{ ...f.input.report }]
    expect(submitIntegrationRequest(f.options).status).toBe('unknown')
    expect(f.posts[0]?.find(arg => arg.startsWith('inputs[request]='))).toContain('Frozen report')
    f.input.stopped.evidence.url = 'https://untrusted.example/secret'
    expect(() => verifyRequestEvidence(f.input, githubRequestEvidence(f.call))).toThrow(
      'locator-unsupported',
    )
  })

  it('exposes a real node-prefixed help entry and structured driver output', () => {
    const source = resolve('src/delivery/integration-request-cli.ts')
    expect(
      execFileSync(process.execPath, ['--experimental-strip-types', source, '--help'], {
        encoding: 'utf8',
      }),
    ).toContain('recover')
    const f = fixture(),
      inputFile = join(temporary(), 'request.json'),
      output: string[] = []
    writeFileSync(inputFile, canonical(f.input))
    const exit = runIntegrationRequestCli(
      [
        'submit',
        '--repo',
        'owner/repo',
        '--input',
        inputFile,
        '--operation-id',
        NEXT_UUID,
        '--journal',
        f.options.journalRoot,
      ],
      {
        bootstrap: () => ({ policy }),
        call: f.call,
        stdout: value => output.push(value),
        stderr: () => {},
      },
    )
    expect(exit).toBe(2)
    expect(output).toHaveLength(1)
    expect(JSON.parse(output[0]!)).toMatchObject({
      operation: 'submit',
      status: 'unknown',
      requestId: UUID,
    })
    const workflow = readFileSync(
      resolve('../../.github/workflows/integration-request.yml'),
      'utf8',
    )
    expect(workflow).toContain('ref: ${{ github.sha }}')
    expect(workflow).toContain('queue: max')
    expect(workflow).not.toContain('pull_request_target')
    expect(workflow).not.toContain('ref: ${{ fromJSON(inputs.request).pull.head }}')
  })
  it('can recover after a dead submitter leaves its lock behind', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    f.action()
    f.runs[0]!.status = 'completed'
    f.runs[0]!.conclusion = 'success'
    const journal = new RequestJournal(f.options.journalRoot, f.input)
    writeFileSync(join(journal.directory, 'lock'), '{"pid":99999999}')
    expect(() => submitIntegrationRequest(f.options)).toThrow('journal-locked')
    expect(submitIntegrationRequest({ ...f.options, mode: 'recover' }).status).toBe('registered')
    expect(readFileSync(join(journal.directory, 'lock'), 'utf8')).toBe('{"pid":99999999}')
    expect(f.posts).toHaveLength(2)
  })

  it('keeps network readback failures unknown after persisting dispatch intent', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    const result = submitIntegrationRequest({
      ...f.options,
      mode: 'recover',
      call: () => {
        throw new Error('offline')
      },
    })
    expect(result).toMatchObject({
      status: 'unknown',
      errorCode: 'integration-request-readback-unavailable',
    })
    expect(f.posts).toHaveLength(1)
  })

  it('does not publish from recover even if the crash occurred before the dispatch checkpoint', () => {
    const f = fixture(),
      journal = new RequestJournal(f.options.journalRoot, f.input)
    journal.prepare({
      schemaVersion: 1,
      operationId: NEXT_UUID,
      input: f.input,
      workflow: {
        path: '.github/workflows/integration-request.yml',
        ref: 'github-gate',
        head: TOOL,
        inputDigest: digest(canonical(f.input)),
      },
      preparedAt: TIME,
    })
    expect(submitIntegrationRequest({ ...f.options, mode: 'recover' }).status).toBe('unknown')
    expect(f.posts).toHaveLength(0)
    expect(journal.attempted).toBe(false)
  })

  it('refuses corrupt durable bytes and does not replace the request', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    const journal = new RequestJournal(f.options.journalRoot, f.input)
    writeFileSync(join(journal.directory, 'intent.json'), '{"schemaVersion":1,')
    expect(() => submitIntegrationRequest({ ...f.options, mode: 'recover' })).toThrow(
      'json-invalid',
    )
    expect(f.posts).toHaveLength(1)
  })

  it('requires the supplied stop declaration and immutable evidence to exist before dispatch', () => {
    const f = fixture()
    f.api.comments.splice(
      f.api.comments.findIndex(item => item.id === 10),
      1,
    )
    expect(() => submitIntegrationRequest(f.options)).toThrow()
    expect(f.posts).toHaveLength(0)
    const other = fixture()
    Object.assign(other.input.stopped, { confirmed: false })
    expect(() => submitIntegrationRequest(other.options)).toThrow()
    expect(other.posts).toHaveLength(0)
  })
  it.each([false, true])(
    'requires matching redispatch delta and stop evidence before the same-wave next attempt (tampered=%s)',
    tampered => {
      const f = fixture()
      submitIntegrationRequest(f.options)
      f.action()
      f.runs[0]!.status = 'completed'
      f.runs[0]!.conclusion = 'success'
      const nextTask = { ...f.input.tasks[0], attempt: '11-r1-a2' }
      const nextAssignment: ActiveAssignment = {
        ...assignment(),
        context: f.input.context,
        tasks: [nextTask],
        inputs: [f.input.report],
        acceptance: [f.input.report],
      }
      const nextDelta = {
        ...delta(),
        context: f.input.context,
        purpose: 'redispatch' as const,
        newRequestId: NEXT_UUID,
        writer: { ...state().writer, authorization: taskBinding().dispatch },
        continuation: { kind: 'active' as const, assignment: nextAssignment },
        integrationResults: [],
      }
      const deltaBody = encodeRecordComment(nextDelta)
      const deltaComment = {
        ...rawComment(50, deltaBody, TIME),
        html_url: 'https://github.com/owner/repo/issues/10#issuecomment-50',
        issue_url: 'https://api.github.com/repos/owner/repo/issues/10',
      }
      const oldState = {
        ...state(),
        state: 'superseded' as const,
        writer: { ...state().writer, authorization: taskBinding().dispatch },
        disposition: {
          action: 'redispatch' as const,
          remainingOwner: 'line-owner',
          newRequestId: NEXT_UUID,
          assignment: nextAssignment,
          delta: { issue: 10, commentId: 50, sha256: digest(deltaBody) },
          oldWritersStopped: f.input.stopped.evidence,
          reduceWriteReleased: f.input.report,
          authorization: f.input.report,
        },
      }
      f.api.comments.push(rawComment(41, encodeRecordComment(oldState), TIME))
      f.binding.attempt = nextTask.attempt
      f.card.body = `- 交付修订：1\n${block(BINDING_MARKERS[2], f.binding)}`
      f.decision.body = dispatchComment('', {
        schemaVersion: 1,
        responsible: 'owner',
        basis: ['Fixture authority'],
        action: 'dispatch',
        task: f.binding,
        confirmations: [],
      })
      f.input.previousRequestId = f.input.requestId
      f.input.requestId = NEXT_UUID
      f.input.tasks = [nextTask]
      const original = f.call
      const read: GhCommand = (argv, timeout) =>
        argv.at(-1) === 'repos/owner/repo/issues/comments/50'
          ? { ...deltaComment, body: deltaBody + (tampered ? 'changed' : '') }
          : original(argv, timeout)
      const operation = () => submitIntegrationRequest({ ...f.options, call: read })
      if (tampered) {
        expect(operation).toThrow('digest-mismatch')
        expect(f.posts).toHaveLength(2)
      } else {
        expect(operation().status).toBe('unknown')
        expect(f.posts).toHaveLength(3)
        expect(f.api.data.state).toBe('open')
      }
    },
  )

  it.each([false, true])(
    'Action environment driver binds exact dispatch inputs before registration (tampered=%s)',
    tampered => {
      const f = fixture()
      submitIntegrationRequest(f.options)
      const dir = temporary(),
        eventPath = join(dir, 'event.json'),
        json = canonical(f.input),
        hash = digest(json)
      writeFileSync(
        eventPath,
        JSON.stringify({
          inputs: { request: json, 'input-digest': tampered ? 'f'.repeat(64) : hash },
        }),
      )
      const stdout: string[] = [],
        stderr: string[] = []
      const result = runIntegrationRequestAction(
        {
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_REF_TYPE: 'branch',
          OMNE_REQUEST: json,
          OMNE_INPUT_DIGEST: hash,
          GITHUB_REPOSITORY: 'owner/repo',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REF_NAME: 'github-gate',
          GITHUB_WORKFLOW_REF:
            'owner/repo/.github/workflows/integration-request.yml@refs/heads/github-gate',
          GITHUB_RUN_ID: '30',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_SHA: TOOL,
          RUNNER_TEMP: dir,
        },
        {
          call: f.call,
          bootstrap: () => ({ policy }),
          stdout: text => stdout.push(text),
          stderr: text => stderr.push(text),
        },
      )
      expect(result).toBe(tampered ? 2 : 0)
      expect(stdout).toHaveLength(1)
      expect(JSON.parse(stdout[0]!).status).toBe(tampered ? 'error' : 'recorded')
      expect(f.posts).toHaveLength(tampered ? 1 : 2)
    },
  )
  it('refuses recovery when the frozen report evidence was edited after registration', () => {
    const f = fixture()
    submitIntegrationRequest(f.options)
    f.action()
    f.runs[0]!.status = 'completed'
    f.runs[0]!.conclusion = 'success'
    f.api.comments.find(comment => comment.id === 9)!.body += ' edited'
    expect(() => submitIntegrationRequest({ ...f.options, mode: 'recover' })).toThrow(
      'evidence-digest-mismatch',
    )
    expect(f.posts).toHaveLength(2)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createFactsPreparation,
  type PreparationPorts,
  type FactsPreparationPolicy,
} from '../src/integration/prepare-delivery-facts.ts'
import { InputError } from '../src/delivery/protocol.ts'
import { runFactsPreparationCli } from '../src/delivery/facts-preparation-cli.ts'
import { factsRunName, readPreparedFactsRun } from '../src/integration/prepared-facts-run.ts'
import type { FactsDeployment } from '../src/integration/published-delivery-facts.ts'
import { FACTS_MARKER } from '../src/integration/delivery-facts-record.ts'
import { digest, IntegrationError, object } from '../src/integration/parse.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { backend, block, dispatch, rawComment } from './fixtures/collaboration-authority.ts'
import { TOOL } from './fixtures/collaboration.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'facts-preparation-')))
  roots.push(root)
  const current = dispatch(),
    api = backend(undefined, [current])
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
  const inputs = new Map<number, { issue: string; authority: string; nonce: string }>()
  const runs = new Map<number, Record<string, unknown>>()
  const historicalWorkflows: FactsDeployment['workflow'][] = []
  const priorInstallations: PreparationPorts['priorInstallations'][number][] = []
  const state = {
    posts: 0,
    loseResponse: false,
    hideRuns: false,
    installation: 'a'.repeat(64),
    nonce: 0,
    malformedList: false,
    budget: false,
    currentDeployment: deployment,
    historicalWorkflows,
    priorInstallations,
    retired: false,
  }
  const calls: (readonly string[])[] = []
  const call: GhCommand = (args, timeout) => {
    calls.push(args)
    const path = args.find(a => a.startsWith('repos/')) ?? ''
    if (args[2] === 'POST') {
      expect(path).toBe(
        `repos/owner/repo/actions/workflows/${state.currentDeployment.workflow.id}/dispatches`,
      )
      const values = Object.fromEntries(
        args
          .filter(a => a.startsWith('inputs['))
          .map(a => {
            const eq = a.indexOf(']=')
            return [a.slice(7, eq), a.slice(eq + 2)]
          }),
      )
      const input = { issue: values.issue!, authority: values.authority!, nonce: values.nonce! }
      const id = 202 + state.posts++
      inputs.set(id, input)
      runs.set(id, {
        id,
        workflow_id: state.currentDeployment.workflow.id,
        path: state.currentDeployment.workflow.path,
        head_branch: state.currentDeployment.workflow.ref,
        head_sha: state.currentDeployment.workflow.head,
        event: 'workflow_dispatch',
        run_attempt: 1,
        display_title: factsRunName(input),
        status: 'queued',
        conclusion: null,
        created_at: '2026-10-27T10:00:00Z',
        run_started_at: '2026-10-27T10:00:01Z',
        updated_at: '2026-10-27T10:01:00Z',
        repository: { full_name: 'owner/repo' },
        head_repository: { full_name: 'owner/repo' },
      })
      if (state.loseResponse) throw new Error('response lost')
      return {
        workflow_run_id: id,
        run_url: `https://api.github.com/repos/owner/repo/actions/runs/${id}`,
        html_url: `https://github.com/owner/repo/actions/runs/${id}`,
      }
    }
    expect(args[2]).toBe('GET')
    if (path === `repos/owner/repo/actions/workflows/${state.currentDeployment.workflow.id}`)
      return {
        id: state.currentDeployment.workflow.id,
        path: state.currentDeployment.workflow.path,
        state: 'active',
      }
    if (path === `repos/owner/repo/git/ref/heads/${state.currentDeployment.workflow.ref}`)
      return {
        ref: `refs/heads/${state.currentDeployment.workflow.ref}`,
        object: { sha: state.currentDeployment.workflow.head },
      }
    const listing = /\/workflows\/(\d+)\/runs\?/.exec(path)
    if (listing !== null) {
      const matching = [...runs.values()].filter(run => run.workflow_id === Number(listing[1]))
      return {
        total_count: state.malformedList ? 2 : state.hideRuns ? 0 : matching.length,
        workflow_runs: state.hideRuns ? [] : matching.map(r => structuredClone(r)),
      }
    }
    const runPath = /\/actions\/runs\/(\d+)(?:\/attempts\/1)?$/.exec(path)
    if (runPath !== null) {
      const run = runs.get(Number(runPath[1]))
      if (run === undefined) throw new Error('run missing')
      return structuredClone(run)
    }
    return structuredClone(api.read(args, timeout))
  }
  const create = (
    transport = call,
    overrides: Partial<PreparationPorts> = {},
    policy?: Partial<FactsPreparationPolicy>,
  ) =>
    createFactsPreparation(
      {
        deployment: state.currentDeployment,
        installationDigest: state.installation,
        historicalWorkflows: state.historicalWorkflows,
        priorInstallations: state.priorInstallations,
        assertActive: () => {
          if (state.retired) throw new InputError('producer-retired')
        },
        journalRoot: root,
        call: transport,
        nonce: () => (++state.nonce).toString(16).padStart(32, '0'),
        ...(state.budget
          ? {
              now: (() => {
                let n = 0
                return () => n++ * 30_000
              })(),
            }
          : {}),
        ...overrides,
      },
      policy,
    )
  const prepare = (
    retryFailed = false,
    transport = call,
    overrides: Partial<PreparationPorts> = {},
    policy?: Partial<FactsPreparationPolicy>,
  ) => create(transport, overrides, policy)(current.html_url, { retryFailed })
  const adopt = () => {
    state.priorInstallations.push({
      installationDigest: state.installation,
      deployment: state.currentDeployment,
    })
    state.historicalWorkflows.push(state.currentDeployment.workflow)
    state.installation = 'b'.repeat(64)
    state.currentDeployment = {
      ...deployment,
      workflow: {
        id: 13,
        path: '.github/workflows/new-facts.yml',
        ref: 'new-gate',
        head: 'c'.repeat(40),
      },
    }
  }
  const publish = (id = 202, reviewer = true) => {
    const input = inputs.get(id)!
    const run = runs.get(id)!
    Object.assign(run, { status: 'completed', conclusion: 'success' })
    const facts = {
      schemaVersion: 1,
      nonce: input.nonce,
      run: id,
      issue: 100,
      authority: {
        url: current.html_url,
        author: current.user.login,
        authorNodeId: current.user.node_id,
        bodySha256: digest(current.body),
        updatedAt: current.updated_at,
        reviewer,
      },
      project: { id: 'P_1', item: 'ITEM_1', stage: 'Ready' },
    }
    const comment = rawComment(
      20 + id - 202,
      block(FACTS_MARKER, facts),
      '2026-10-27T10:00:30Z',
      deployment.bot.login,
    )
    comment.user = { login: deployment.bot.login, node_id: deployment.bot.nodeId, type: 'Bot' }
    api.comments.push(comment)
    return comment
  }
  const slot = () => join(root, readdirSync(root)[0]!)
  return {
    root,
    current,
    deployment,
    api,
    state,
    runs,
    inputs,
    call,
    calls,
    prepare,
    create,
    adopt,
    publish,
    slot,
  }
}

describe('durable single-dispatch facts preparation', () => {
  it.each([
    null,
    [],
    { totalMs: undefined },
    { totalMs: 0 },
    { totalMs: 2_147_483_648 },
    { totalMs: NaN },
    { maxCalls: 0 },
    { maxCalls: 1.5 },
    { maxCalls: Infinity },
    { maxCalls: Number.MAX_SAFE_INTEGER + 1 },
    { maxCalls: undefined },
    { unknown: 1 },
  ])('rejects invalid facts policy %j before authority or network reads', policy => {
    const f = fixture()
    let authorityCalls = 0
    expect(() =>
      f.create(
        f.call,
        {
          assertActive: () => {
            authorityCalls++
          },
        },
        policy as Partial<FactsPreparationPolicy>,
      ),
    ).toThrow()
    expect(authorityCalls).toBe(0)
    expect(f.calls).toHaveLength(0)
  })

  it('uses copied policy for nested reads', () => {
    const f = fixture()
    const policy = { networkMs: 25_000, totalMs: 60_000, maxCalls: 128 }
    const timeouts: number[] = []
    const prepare = f.create(
      (args, timeout) => {
        timeouts.push(timeout)
        return f.call(args, timeout)
      },
      { now: () => 0 },
      policy,
    )
    policy.networkMs = 1
    policy.maxCalls = 1
    expect(prepare(f.current.html_url).status).toBe('pending')
    f.publish()
    expect(prepare(f.current.html_url).status).toBe('ready')
    expect(timeouts.length).toBeGreaterThan(10)
    expect(new Set(timeouts)).toEqual(new Set([25_000]))
    expect(f.state.posts).toBe(1)
  })

  it('stops before the first call beyond the configured request budget', () => {
    const f = fixture()
    expect(f.prepare(false, f.call, { now: () => 0 }, { maxCalls: 1 })).toMatchObject({
      status: 'unknown',
      diagnostic: 'facts-preparation-observation-budget',
    })
    expect(f.calls).toHaveLength(1)
    expect(f.state.posts).toBe(0)
  })

  it('starts a fresh deadline and request count for each call to the same factory', () => {
    const f = fixture()
    let now = 0
    const timeouts: number[] = []
    const prepare = f.create(
      (args, timeout) => {
        timeouts.push(timeout)
        return f.call(args, timeout)
      },
      { now: () => now },
      { maxCalls: 1, totalMs: 500 },
    )
    expect(prepare(f.current.html_url)).toMatchObject({
      status: 'unknown',
      diagnostic: 'facts-preparation-observation-budget',
    })
    now = 60_000
    expect(prepare(f.current.html_url)).toMatchObject({
      status: 'unknown',
      diagnostic: 'facts-preparation-observation-budget',
    })
    expect(timeouts).toEqual([500, 500])
    expect(f.state.posts).toBe(0)
  })

  it('limits requests by remaining time and recovers the original intent without another POST', () => {
    const f = fixture()
    f.prepare()
    const timeouts: number[] = []
    let now = 0
    const prepare = f.create(
      (args, timeout) => {
        timeouts.push(timeout)
        const result = f.call(args, timeout)
        now += 600
        return result
      },
      { now: () => now },
      { totalMs: 1000, networkMs: 25_000 },
    )
    expect(prepare(f.current.html_url)).toMatchObject({
      status: 'unknown',
      diagnostic: 'facts-preparation-observation-budget',
    })
    expect(timeouts).toEqual([1000, 400])
    expect(f.state.posts).toBe(1)
    expect(f.prepare().status).toBe('pending')
    expect(f.state.posts).toBe(1)
  })

  it('runs source CLI help from another cwd without loading installation', () => {
    const path = fileURLToPath(new URL('../src/delivery/facts-preparation-cli.ts', import.meta.url))
    const help = spawnSync(process.execPath, ['--experimental-strip-types', path, '--help'], {
      cwd: tmpdir(),
      encoding: 'utf8',
    })
    expect(help.status, help.stderr).toBe(0)
    expect(help.stdout).toContain('--retry-failed')
    const invalid = spawnSync(
      process.execPath,
      ['--experimental-strip-types', path, '--installation', 'caller.json'],
      {
        cwd: tmpdir(),
        encoding: 'utf8',
      },
    )
    expect(invalid.status).toBe(2)
    expect(JSON.parse(invalid.stderr).status).toBe('unknown')
  })

  it('the CLI forwards only exact dispatch data and the explicit retry choice', () => {
    const calls: unknown[] = []
    const result = runFactsPreparationCli(
      ['--repo', 'owner/repo', '--dispatch', 'url', '--retry-failed'],
      repo => ({
        prepareFacts: (dispatch, options) => {
          calls.push({ repo, dispatch, options })
          return { status: 'unknown', generation: null, run: null, diagnostic: 'unresolved' }
        },
      }),
    )
    expect(calls).toEqual([{ repo: 'owner/repo', dispatch: 'url', options: { retryFailed: true } }])
    expect(result.code).toBe(2)
    expect(JSON.parse(result.output).diagnostic).toBe('unresolved')
    expect(() =>
      runFactsPreparationCli(['--repo', 'owner/repo', '--dispatch', 'url'], () => ({
        prepareFacts: undefined,
      })),
    ).toThrow('producer-installation-required')
  })
  it('returns pending without sleeping and resumes to authenticated ready', () => {
    const f = fixture()
    expect(f.prepare()).toMatchObject({ status: 'pending', generation: 1, run: { id: 202 } })
    expect(f.prepare()).toMatchObject({ status: 'pending', generation: 1 })
    f.publish()
    expect(f.prepare()).toMatchObject({
      status: 'ready',
      facts: { observations: [{ facts: { run: 202 } }] },
    })
    expect(f.state.posts).toBe(1)
  })

  it('uses existing valid facts without dispatching another operation', () => {
    const f = fixture()
    f.prepare()
    f.publish()
    const before = f.state.posts
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'facts-existing-')))
    roots.push(elsewhere)
    const prepare = createFactsPreparation({
      deployment: f.deployment,
      installationDigest: f.state.installation,
      historicalWorkflows: [],
      priorInstallations: [],
      assertActive: () => {},
      journalRoot: elsewhere,
      call: f.call,
    })
    expect(prepare(f.current.html_url).status).toBe('ready')
    expect(f.state.posts).toBe(before)
  })

  it('recovers the same successful operation when attempt creation metadata differs', () => {
    const f = fixture()
    expect(f.prepare()).toMatchObject({ status: 'pending', generation: 1, run: { id: 202 } })
    const journal = () =>
      readdirSync(f.slot()).map(name => [name, readFileSync(join(f.slot(), name), 'utf8')])
    const before = journal()
    f.publish()
    const transport: GhCommand = (args, timeout) => {
      const result = f.call(args, timeout)
      return args.some(arg => arg.endsWith('/actions/runs/202/attempts/1'))
        ? { ...object(result, 'test run'), created_at: '2026-10-27T10:00:02Z' }
        : result
    }
    expect(readPreparedFactsRun(f.deployment, f.inputs.get(202)!, 202, transport).createdAt).toBe(
      '2026-10-27T10:00:00Z',
    )
    expect(f.prepare(false, transport)).toMatchObject({
      status: 'ready',
      facts: { observations: [{ facts: { run: 202 } }] },
    })
    expect(f.state.posts).toBe(1)
    expect(journal()).toEqual(before)
  })

  it.each(['', '/attempts/1'])('refuses creation metadata drift within endpoint %s', suffix => {
    const f = fixture()
    f.prepare()
    f.publish()
    let reads = 0
    const transport: GhCommand = (args, timeout) => {
      const result = f.call(args, timeout)
      if (args.includes(`repos/owner/repo/actions/runs/202${suffix}`) && ++reads === 2)
        return { ...object(result, 'test run'), created_at: '2026-10-27T10:00:02Z' }
      return result
    }
    expect(() => readPreparedFactsRun(f.deployment, f.inputs.get(202)!, 202, transport)).toThrow(
      suffix === '' ? 'facts-preparation-run-changed' : 'facts-preparation-attempt-changed',
    )
    expect(f.state.posts).toBe(1)
  })

  it('recovers a lost response from a complete exact-title search without reposting', () => {
    const f = fixture()
    f.state.loseResponse = true
    expect(f.prepare().status).toBe('unknown')
    expect(f.prepare()).toMatchObject({ status: 'pending', run: { id: 202 } })
    Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
    expect(f.prepare()).toMatchObject({ status: 'failed', run: { id: 202, conclusion: 'failure' } })
    expect(f.state.posts).toBe(1)
  })

  it('permits one explicit successor after an exact failure without changing authorization', () => {
    const f = fixture()
    f.prepare()
    Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
    expect(f.prepare().status).toBe('failed')
    expect(f.prepare(true)).toMatchObject({ status: 'pending', generation: 2, run: { id: 203 } })
    expect(f.prepare(true)).toMatchObject({ status: 'pending', generation: 2 })
    f.publish(203)
    expect(f.prepare().status).toBe('ready')
    expect(f.state.posts).toBe(2)
    expect(f.inputs.get(202)!.authority).toBe(f.inputs.get(203)!.authority)
    expect(f.inputs.get(202)!.nonce).not.toBe(f.inputs.get(203)!.nonce)
  })

  it('does not retry unknown outcomes even when explicitly requested', () => {
    const f = fixture()
    f.state.loseResponse = true
    f.prepare()
    f.state.hideRuns = true
    expect(f.prepare(true).status).toBe('unknown')
    expect(f.state.posts).toBe(1)
  })

  it.each(['unrecognized-conclusion', '', null, 42, {}, 'queued'])(
    'keeps unsupported terminal conclusion %j unknown without a retry POST',
    conclusion => {
      const f = fixture()
      f.prepare()
      Object.assign(f.runs.get(202)!, { status: 'completed', conclusion })
      expect(f.prepare(true).status).toBe('unknown')
      expect(f.state.posts).toBe(1)
    },
  )

  it('refuses a changed installation or same-URL dispatch revision', () => {
    const f = fixture()
    f.prepare()
    f.state.installation = 'b'.repeat(64)
    expect(f.prepare()).toMatchObject({
      status: 'unknown',
      diagnostic: 'facts-preparation-operation-conflict',
    })
    f.state.installation = 'a'.repeat(64)
    f.current.body += '\nchanged'
    expect(f.prepare()).toMatchObject({
      status: 'unknown',
      diagnostic: 'facts-preparation-operation-conflict',
    })
    expect(f.state.posts).toBe(1)
  })

  it('does not adopt a previous ready result after negative facts appear', () => {
    const f = fixture()
    f.prepare()
    const comment = f.publish()
    expect(f.prepare().status).toBe('ready')
    comment.body = comment.body.replace('"reviewer":true', '"reviewer":false')
    expect(f.prepare(true).status).toBe('failed')
    expect(f.state.posts).toBe(1)
  })

  it.each(['head_sha', 'display_title', 'run_attempt', 'head_repository'])(
    'refuses altered run %s',
    field => {
      const f = fixture()
      f.prepare()
      f.runs.get(202)![field] =
        field === 'run_attempt'
          ? 2
          : field === 'head_repository'
            ? { full_name: 'other/repo' }
            : 'different'
      expect(f.prepare(true).status).toBe('unknown')
      expect(f.state.posts).toBe(1)
    },
  )

  it('keeps success without facts unknown and does not retry it', () => {
    const f = fixture()
    f.prepare()
    Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'success' })
    expect(f.prepare(true).status).toBe('unknown')
    expect(f.state.posts).toBe(1)
  })

  it('refuses incomplete and duplicated recovery listings', () => {
    const f = fixture()
    f.state.loseResponse = true
    f.prepare()
    f.state.malformedList = true
    expect(f.prepare(true).status).toBe('unknown')
    f.state.malformedList = false
    f.runs.set(203, { ...f.runs.get(202)!, id: 203 })
    expect(f.prepare(true).status).toBe('unknown')
    expect(f.state.posts).toBe(1)
  })

  it('never treats partial durable records as a fresh operation', () => {
    const f = fixture()
    f.prepare()
    writeFileSync(join(f.slot(), 'intent-1.json'), '{')
    expect(f.prepare(true).status).toBe('unknown')
    expect(f.state.posts).toBe(1)
  })

  it('refuses an unsupported conclusion in persisted predecessor evidence', () => {
    const f = fixture()
    f.prepare()
    Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
    f.prepare(true)
    const path = join(f.slot(), 'intent-2.json')
    const saved = JSON.parse(readFileSync(path, 'utf8'))
    saved.predecessor.run.conclusion = 'unrecognized-conclusion'
    writeFileSync(path, JSON.stringify(saved))
    expect(f.prepare(true).status).toBe('unknown')
    expect(f.state.posts).toBe(2)
  })

  it('does not repost an intact intent when no run was ever created', () => {
    const f = fixture()
    f.state.loseResponse = true
    f.prepare()
    f.runs.clear()
    const intent = JSON.parse(readFileSync(join(f.slot(), 'intent-1.json'), 'utf8'))
    expect(intent.input.authority).toBe(f.current.html_url)
    expect(f.prepare(true).status).toBe('unknown')
    expect(f.state.posts).toBe(1)
  })

  it('bounds calls even when a transport or listing cannot converge', () => {
    const f = fixture()
    f.state.budget = true
    expect(f.prepare()).toMatchObject({
      status: 'unknown',
      diagnostic: 'facts-preparation-observation-budget',
    })
    expect(f.state.posts).toBe(0)
  })

  describe('original generation recovery after installation adoption', () => {
    it.each(['receipt', 'lost response'] as const)(
      'preserves all four old operation outcomes with %s',
      response => {
        for (const status of ['pending', 'success', 'failed', 'unknown'] as const) {
          const f = fixture()
          f.state.loseResponse = response === 'lost response'
          f.prepare()
          if (status === 'success') f.publish()
          if (status === 'failed')
            Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
          if (status === 'unknown') {
            f.runs.clear()
            f.state.hideRuns = true
          }
          const original = readFileSync(join(f.slot(), 'intent-1.json'), 'utf8')
          f.adopt()
          f.calls.length = 0
          const result = f.prepare()
          expect(result.status, status).toBe(status === 'success' ? 'ready' : status)
          if (status === 'pending' || status === 'failed')
            expect(result).toMatchObject({ generation: 1, run: { id: 202 } })
          expect(f.state.posts).toBe(1)
          expect(f.calls.every(args => args[2] === 'GET')).toBe(true)
          expect(f.calls.some(args => args.some(arg => arg.includes('/git/ref/')))).toBe(false)
          expect(readFileSync(join(f.slot(), 'intent-1.json'), 'utf8')).toBe(original)
        }
      },
    )

    it('recovers an old run when its workflow branch now points at a new head', () => {
      const f = fixture()
      f.prepare()
      f.adopt()
      f.state.currentDeployment = {
        ...f.deployment,
        workflow: { ...f.deployment.workflow, head: 'c'.repeat(40) },
      }
      expect(f.prepare()).toMatchObject({ status: 'pending', run: { id: 202 } })
      f.publish()
      expect(f.prepare().status).toBe('ready')
      expect(f.state.posts).toBe(1)
    })

    it('creates only one current-workflow successor after explicit retry of an old failure', () => {
      const f = fixture()
      f.prepare()
      Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
      const original = readFileSync(join(f.slot(), 'intent-1.json'), 'utf8')
      f.adopt()
      expect(f.prepare().status).toBe('failed')
      f.calls.length = 0
      expect(f.prepare(true)).toMatchObject({ status: 'pending', generation: 2, run: { id: 203 } })
      expect(f.prepare(true)).toMatchObject({ status: 'pending', generation: 2 })
      const saved = JSON.parse(readFileSync(join(f.slot(), 'intent-2.json'), 'utf8'))
      expect(saved.binding).toMatchObject({
        installationDigest: 'b'.repeat(64),
        deployment: f.state.currentDeployment,
      })
      expect(saved.predecessor).toMatchObject({
        generation: 1,
        run: { id: 202, conclusion: 'failure' },
      })
      expect(saved.input.authority).toBe(f.current.html_url)
      expect(saved.input.nonce).not.toBe(f.inputs.get(202)!.nonce)
      expect(readFileSync(join(f.slot(), 'intent-1.json'), 'utf8')).toBe(original)
      const posts = f.calls.filter(args => args[2] === 'POST')
      expect(posts).toHaveLength(1)
      expect(posts[0]).toContain('repos/owner/repo/actions/workflows/13/dispatches')
      expect(posts[0]).toContain('ref=new-gate')
      expect(
        f.calls.filter(args => args.includes('repos/owner/repo/actions/runs/202')),
      ).toHaveLength(4)
      f.publish(203)
      expect(f.prepare().status).toBe('ready')
      expect(f.state.posts).toBe(2)
    })

    it.each(['unknown', 'success without own facts', 'pending', 'failed'] as const)(
      'does not substitute current ready facts for an old %s operation',
      status => {
        const f = fixture()
        f.state.loseResponse = status === 'unknown'
        f.prepare()
        f.adopt()
        f.state.loseResponse = false
        const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'facts-new-installation-')))
        roots.push(elsewhere)
        expect(f.prepare(false, f.call, { journalRoot: elsewhere }).status).toBe('pending')
        f.publish(203)
        if (status === 'unknown') f.state.hideRuns = true
        if (status === 'success without own facts')
          Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'success' })
        if (status === 'failed')
          Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
        expect(f.prepare(true).status).toBe(
          status === 'success without own facts' ? 'unknown' : status,
        )
        expect(f.state.posts).toBe(2)
        expect(existsSync(join(f.slot(), 'intent-2.json'))).toBe(false)
      },
    )

    it('refuses a changed old predecessor at the final retry observation', () => {
      const f = fixture()
      f.prepare()
      Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
      f.adopt()
      const call: GhCommand = (args, timeout) => {
        if (args.includes('repos/owner/repo/actions/workflows/13'))
          Object.assign(f.runs.get(202)!, { status: 'queued', conclusion: null })
        return f.call(args, timeout)
      }
      expect(f.prepare(true, call)).toMatchObject({
        status: 'unknown',
        diagnostic: 'facts-preparation-predecessor-changed',
      })
      expect(f.state.posts).toBe(1)
      expect(existsSync(join(f.slot(), 'intent-2.json'))).toBe(false)
    })

    it.each(['digest', 'workflow', 'repository', 'project', 'bot', 'dispatch'] as const)(
      'rejects a changed original %s binding before a current ready shortcut',
      field => {
        const f = fixture()
        f.prepare()
        Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
        f.adopt()
        f.prepare(true)
        f.publish(203)
        const path = join(f.slot(), 'intent-1.json')
        const saved = JSON.parse(readFileSync(path, 'utf8'))
        if (field === 'digest') saved.binding.installationDigest = 'd'.repeat(64)
        if (field === 'workflow') saved.binding.deployment.workflow.head = 'e'.repeat(40)
        if (field === 'repository') saved.binding.deployment.repository = 'other/repo'
        if (field === 'project') saved.binding.deployment.projectId = 'P_2'
        if (field === 'bot') saved.binding.deployment.bot.nodeId = 'OTHER_BOT'
        if (field === 'dispatch') saved.binding.dispatch.authorNodeId = 'OTHER_USER'
        writeFileSync(path, JSON.stringify(saved))
        expect(f.prepare(true)).toMatchObject({
          status: 'unknown',
          diagnostic: 'facts-preparation-operation-conflict',
        })
        expect(f.state.posts).toBe(2)
      },
    )

    it('admits multiple descriptor digests for one explicitly readable workflow', () => {
      const f = fixture()
      f.prepare()
      f.state.priorInstallations.push({
        installationDigest: f.state.installation,
        deployment: f.deployment,
      })
      f.state.installation = 'b'.repeat(64)
      expect(f.prepare()).toMatchObject({ status: 'pending', generation: 1 })
      Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
      expect(f.prepare(true)).toMatchObject({ status: 'pending', generation: 2 })
      f.state.priorInstallations.push({
        installationDigest: f.state.installation,
        deployment: f.deployment,
      })
      f.state.installation = 'c'.repeat(64)
      f.publish(203)
      expect(f.prepare().status).toBe('ready')
      expect(f.state.posts).toBe(2)
    })

    it('never reuses an original nonce for a current-installation retry', () => {
      const f = fixture()
      f.prepare()
      Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
      f.adopt()
      expect(f.prepare(true, f.call, { nonce: () => f.inputs.get(202)!.nonce })).toMatchObject({
        status: 'unknown',
        diagnostic: 'facts-preparation-nonce-reused',
      })
      expect(f.state.posts).toBe(1)
      expect(existsSync(join(f.slot(), 'intent-2.json'))).toBe(false)
    })

    it.each([
      'repository',
      'project',
      'bot',
      'unreadable workflow',
      'digest conflict',
      'duplicate history',
      'repeated current',
    ] as const)('refuses invalid trusted bootstrap records for %s', field => {
      const f = fixture()
      f.prepare()
      f.adopt()
      const prior = f.state.priorInstallations[0]!
      if (field === 'repository')
        prior.deployment = { ...prior.deployment, repository: 'other/repo' }
      if (field === 'project') prior.deployment = { ...prior.deployment, projectId: 'P_2' }
      if (field === 'bot')
        prior.deployment = { ...prior.deployment, bot: { login: 'other[bot]', nodeId: 'OTHER' } }
      if (field === 'unreadable workflow') f.state.historicalWorkflows = []
      if (field === 'digest conflict')
        f.state.priorInstallations.push({ ...prior, deployment: f.state.currentDeployment })
      if (field === 'duplicate history') f.state.historicalWorkflows.push(f.deployment.workflow)
      if (field === 'repeated current')
        f.state.historicalWorkflows.push(f.state.currentDeployment.workflow)
      expect(() => f.prepare()).toThrow(/facts-preparation-/)
      expect(f.state.posts).toBe(1)
    })
  })

  describe('complete journal and active writer guards', () => {
    it.each([
      'leading gap',
      'middle gap',
      'orphan run',
      'unexpected file',
      'zero generation',
      'unbounded generation',
    ] as const)('refuses %s even when latest facts are ready', defect => {
      const f = fixture()
      f.prepare()
      Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
      f.prepare(true)
      Object.assign(f.runs.get(203)!, { status: 'completed', conclusion: 'failure' })
      f.prepare(true)
      f.publish(204)
      const slot = f.slot()
      if (defect === 'leading gap' || defect === 'middle gap') {
        const generation = defect === 'leading gap' ? 1 : 2
        rmSync(join(slot, `intent-${generation}.json`))
        rmSync(join(slot, `run-${generation}.json`))
      }
      if (defect === 'orphan run') writeFileSync(join(slot, 'run-4.json'), '{}')
      if (defect === 'unexpected file') writeFileSync(join(slot, 'partial.tmp'), '{}')
      if (defect === 'zero generation') writeFileSync(join(slot, 'intent-0.json'), '{}')
      if (defect === 'unbounded generation') writeFileSync(join(slot, 'intent-1001.json'), '{}')
      expect(f.prepare(true).status).toBe('unknown')
      expect(f.state.posts).toBe(3)
    })

    it('does not treat an orphan first run receipt as an absent operation', () => {
      const f = fixture()
      f.prepare()
      rmSync(join(f.slot(), 'intent-1.json'))
      expect(f.prepare(true)).toMatchObject({
        status: 'unknown',
        diagnostic: 'facts-preparation-orphan-run',
      })
      expect(f.state.posts).toBe(1)
    })

    it.each(['malformed receipt', 'predecessor receipt mismatch', 'reused nonce'] as const)(
      'refuses an old %s before returning a ready successor',
      defect => {
        const f = fixture()
        f.prepare()
        Object.assign(f.runs.get(202)!, { status: 'completed', conclusion: 'failure' })
        f.prepare(true)
        f.publish(203)
        if (defect === 'malformed receipt') writeFileSync(join(f.slot(), 'run-1.json'), '{')
        if (defect === 'predecessor receipt mismatch') {
          const path = join(f.slot(), 'intent-2.json')
          const intent = JSON.parse(readFileSync(path, 'utf8'))
          intent.predecessor.run.id = 999
          writeFileSync(path, JSON.stringify(intent))
        }
        if (defect === 'reused nonce') {
          const path = join(f.slot(), 'intent-2.json')
          const intent = JSON.parse(readFileSync(path, 'utf8'))
          intent.input.nonce = f.inputs.get(202)!.nonce
          writeFileSync(path, JSON.stringify(intent))
          rmSync(join(f.slot(), 'run-2.json'))
        }
        expect(f.prepare(true).status).toBe('unknown')
        expect(f.state.posts).toBe(2)
      },
    )

    it('refuses a retired writer at entry before reads or journal creation', () => {
      const f = fixture()
      f.state.retired = true
      expect(f.prepare()).toMatchObject({ status: 'unknown', diagnostic: 'producer-retired' })
      expect(f.calls).toEqual([])
      expect(readdirSync(f.root)).toEqual([])
    })

    it('keeps a rejected active-writer guard unknown regardless of its error classification', () => {
      const f = fixture()
      expect(
        f.prepare(false, f.call, {
          assertActive: () => {
            throw new IntegrationError('refused', 'producer-retired')
          },
        }),
      ).toMatchObject({ status: 'unknown', diagnostic: 'producer-retired' })
      expect(f.calls).toEqual([])
      expect(readdirSync(f.root)).toEqual([])
    })

    it('checks retirement again before creating the journal directory', () => {
      const f = fixture()
      const call: GhCommand = (args, timeout) => {
        f.state.retired = true
        return f.call(args, timeout)
      }
      expect(f.prepare(false, call)).toMatchObject({
        status: 'unknown',
        diagnostic: 'producer-retired',
      })
      expect(readdirSync(f.root)).toEqual([])
      expect(f.state.posts).toBe(0)
    })

    it('checks retirement immediately before intent creation', () => {
      const f = fixture()
      expect(
        f.prepare(false, f.call, {
          nonce: () => {
            f.state.retired = true
            return '1'.repeat(32)
          },
        }),
      ).toMatchObject({ status: 'unknown', diagnostic: 'producer-retired' })
      expect(readdirSync(f.slot())).toEqual([])
      expect(f.state.posts).toBe(0)
    })

    it('retains a durable intent when retired before POST and never automatically reposts it', () => {
      const f = fixture()
      expect(
        f.prepare(false, f.call, {
          assertActive: () => {
            const slot = readdirSync(f.root)[0]
            if (slot !== undefined && existsSync(join(f.root, slot, 'intent-1.json')))
              throw new InputError('producer-retired')
          },
        }),
      ).toMatchObject({ status: 'unknown', generation: 1, diagnostic: 'producer-retired' })
      expect(readdirSync(f.slot())).toEqual(['intent-1.json'])
      expect(f.state.posts).toBe(0)
      expect(f.prepare(true).status).toBe('unknown')
      expect(f.state.posts).toBe(0)
    })

    it('does not write a receipt after retirement and recovers the existing POST by observation', () => {
      const f = fixture()
      const call: GhCommand = (args, timeout) => {
        const result = f.call(args, timeout)
        if (args[2] === 'POST') f.state.retired = true
        return result
      }
      expect(f.prepare(false, call)).toMatchObject({
        status: 'unknown',
        diagnostic: 'producer-retired',
      })
      expect(readdirSync(f.slot())).toEqual(['intent-1.json'])
      expect(f.state.posts).toBe(1)
      f.state.retired = false
      expect(f.prepare(true)).toMatchObject({ status: 'pending', generation: 1, run: { id: 202 } })
      expect(f.state.posts).toBe(1)
    })
  })

  function processFixture() {
    const f = fixture(),
      responses: Record<string, unknown> = {}
    f.prepare(false, (args, timeout) => {
      const value = f.call(args, timeout)
      if (args[2] === 'GET') responses[args.find(a => a.startsWith('repos/'))!] = value
      return value
    })
    writeFileSync(
      join(f.root, 'input.json'),
      JSON.stringify({
        responses,
        deployment: f.deployment,
        installation: f.state.installation,
        dispatch: f.current.html_url,
        run: f.runs.get(202),
      }),
    )
    const start = (mode = 'normal') => {
      const child = spawn(
        process.execPath,
        [
          '--experimental-strip-types',
          fileURLToPath(new URL('./fixtures/facts-preparation-worker.mjs', import.meta.url)),
          f.root,
          mode,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let stdout = '',
        stderr = ''
      child.stdout.on('data', chunk => {
        stdout += String(chunk)
      })
      child.stderr.on('data', chunk => {
        stderr += String(chunk)
      })
      const done = new Promise<{ code: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
          child.once('error', reject)
          child.once('close', code => resolve({ code, stdout, stderr }))
        },
      )
      return { child, done }
    }
    const awaitPaused = async () => {
      const deadline = Date.now() + 10_000
      while (!existsSync(join(f.root, 'paused'))) {
        if (Date.now() > deadline) throw new Error('worker did not reach pause')
        await delay(10)
      }
    }
    const posts = () =>
      existsSync(join(f.root, 'posts.jsonl'))
        ? readFileSync(join(f.root, 'posts.jsonl'), 'utf8').trim().split('\n').length
        : 0
    return { ...f, start, awaitPaused, posts }
  }

  it('allows at most one POST across six independent processes for the same dispatch', async () => {
    const f = processFixture()
    const results = await Promise.all(Array.from({ length: 6 }, () => f.start().done))
    for (const result of results) {
      expect(result.code, result.stderr).toBe(0)
      expect(['pending', 'unknown']).toContain(JSON.parse(result.stdout).status)
    }
    expect(f.posts()).toBe(1)
    expect(JSON.parse((await f.start().done).stdout).status).toBe('pending')
    expect(f.posts()).toBe(1)
  }, 20_000)

  it.each([false, true])(
    'six concurrent retries create only one successor after a failed generation with adoption %s',
    async adopted => {
      const f = processFixture()
      expect(JSON.parse((await f.start().done).stdout).status).toBe('pending')
      const path = join(f.root, 'remote-run-202.json')
      const run = JSON.parse(readFileSync(path, 'utf8'))
      writeFileSync(path, JSON.stringify({ ...run, status: 'completed', conclusion: 'failure' }))
      if (adopted) {
        f.adopt()
        const inputPath = join(f.root, 'input.json')
        const data = JSON.parse(readFileSync(inputPath, 'utf8'))
        const workflow = f.state.currentDeployment.workflow
        Object.assign(data, {
          installation: f.state.installation,
          deployment: f.state.currentDeployment,
          historicalWorkflows: f.state.historicalWorkflows,
          priorInstallations: f.state.priorInstallations,
        })
        data.responses[`repos/owner/repo/actions/workflows/${workflow.id}`] = {
          id: workflow.id,
          path: workflow.path,
          state: 'active',
        }
        data.responses[`repos/owner/repo/git/ref/heads/${workflow.ref}`] = {
          ref: `refs/heads/${workflow.ref}`,
          object: { sha: workflow.head },
        }
        writeFileSync(inputPath, JSON.stringify(data))
      }
      const results = await Promise.all(Array.from({ length: 6 }, () => f.start('retry').done))
      for (const result of results) {
        expect(result.code, result.stderr).toBe(0)
        expect(['pending', 'unknown']).toContain(JSON.parse(result.stdout).status)
      }
      expect(f.posts()).toBe(2)
      expect(JSON.parse((await f.start('retry').done).stdout)).toMatchObject({
        status: 'pending',
        generation: 2,
        run: { id: 203 },
      })
      expect(f.posts()).toBe(2)
      const slot = join(f.root, 'journal', readdirSync(join(f.root, 'journal'))[0]!)
      expect(
        readdirSync(slot)
          .filter(name => name.startsWith('intent-'))
          .sort(),
      ).toEqual(['intent-1.json', 'intent-2.json'])
      const successor = JSON.parse(readFileSync(join(slot, 'intent-2.json'), 'utf8'))
      expect(successor.binding.installationDigest).toBe(f.state.installation)
      expect(successor.binding.deployment).toEqual(f.state.currentDeployment)
      expect(
        JSON.parse(readFileSync(join(f.root, 'remote-run-203.json'), 'utf8')).workflow_id,
      ).toBe(f.state.currentDeployment.workflow.id)
    },
    20_000,
  )

  it('a second process cannot dispatch from complete intent bytes before their fsync', async () => {
    const f = processFixture(),
      first = f.start('intent-fsync')
    try {
      await f.awaitPaused()
      expect(JSON.parse((await f.start().done).stdout).status).toBe('unknown')
      expect(f.posts()).toBe(0)
      writeFileSync(join(f.root, 'resume'), '')
      expect(JSON.parse((await first.done).stdout).status).toBe('unknown')
      expect(JSON.parse((await f.start().done).stdout).status).toBe('unknown')
      expect(f.posts()).toBe(0)
    } finally {
      first.child.kill('SIGKILL')
      await first.done
    }
  }, 20_000)

  it('does not POST after directory fsync fails or on its later recovery', async () => {
    const f = processFixture()
    expect(JSON.parse((await f.start('directory-fsync').done).stdout).status).toBe('unknown')
    expect(JSON.parse((await f.start().done).stdout).status).toBe('unknown')
    expect(f.posts()).toBe(0)
  }, 20_000)

  it('a killed creator before POST leaves a permanent observation-only operation', async () => {
    const f = processFixture(),
      first = f.start('before-post')
    try {
      await f.awaitPaused()
      first.child.kill('SIGKILL')
      await first.done
      expect(JSON.parse((await f.start().done).stdout).status).toBe('unknown')
      expect(f.posts()).toBe(0)
    } finally {
      first.child.kill('SIGKILL')
      await first.done
    }
  }, 20_000)
})

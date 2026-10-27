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
import { createFactsPreparation } from '../src/integration/prepare-delivery-facts.ts'
import { runFactsPreparationCli } from '../src/delivery/facts-preparation-cli.ts'
import { factsRunName } from '../src/integration/prepared-facts-run.ts'
import type { FactsDeployment } from '../src/integration/published-delivery-facts.ts'
import { FACTS_MARKER } from '../src/integration/delivery-facts-record.ts'
import { digest } from '../src/integration/parse.ts'
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
  const state = {
    posts: 0,
    loseResponse: false,
    hideRuns: false,
    installation: 'a'.repeat(64),
    nonce: 0,
    malformedList: false,
    budget: false,
  }
  const calls: (readonly string[])[] = []
  const call: GhCommand = (args, timeout) => {
    calls.push(args)
    const path = args.find(a => a.startsWith('repos/')) ?? ''
    if (args[2] === 'POST') {
      expect(path).toBe('repos/owner/repo/actions/workflows/12/dispatches')
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
        workflow_id: 12,
        path: deployment.workflow.path,
        head_branch: 'github-gate',
        head_sha: TOOL,
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
    if (path === 'repos/owner/repo/actions/workflows/12')
      return { id: 12, path: deployment.workflow.path, state: 'active' }
    if (path === 'repos/owner/repo/git/ref/heads/github-gate')
      return { ref: 'refs/heads/github-gate', object: { sha: TOOL } }
    if (path.includes('/workflows/12/runs?'))
      return {
        total_count: state.malformedList ? 2 : state.hideRuns ? 0 : runs.size,
        workflow_runs: state.hideRuns ? [] : [...runs.values()].map(r => structuredClone(r)),
      }
    const runPath = /\/actions\/runs\/(\d+)(?:\/attempts\/1)?$/.exec(path)
    if (runPath !== null) {
      const run = runs.get(Number(runPath[1]))
      if (run === undefined) throw new Error('run missing')
      return structuredClone(run)
    }
    return structuredClone(api.read(args, timeout))
  }
  const prepare = (retryFailed = false, transport = call) =>
    createFactsPreparation({
      deployment,
      installationDigest: state.installation,
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
    })(current.html_url, { retryFailed })
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
    publish,
    slot,
  }
}

describe('durable single-dispatch facts preparation', () => {
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
      journalRoot: elsewhere,
      call: f.call,
    })
    expect(prepare(f.current.html_url).status).toBe('ready')
    expect(f.state.posts).toBe(before)
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

  it('six concurrent retries create only one successor after a failed generation', async () => {
    const f = processFixture()
    expect(JSON.parse((await f.start().done).stdout).status).toBe('pending')
    const path = join(f.root, 'remote-run-202.json')
    const run = JSON.parse(readFileSync(path, 'utf8'))
    writeFileSync(path, JSON.stringify({ ...run, status: 'completed', conclusion: 'failure' }))
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
  }, 20_000)

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

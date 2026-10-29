import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { releaseRun, type ReleaseRunOptions } from '../src/integration/release-run.ts'
import { releaseRunMain } from '../src/integration/release-run-cli.ts'
import { releaseInputs } from '../src/integration/release-run-protocol.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { HEAD, TOOL, UUID, NEXT_UUID } from './fixtures/identifiers.ts'

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
})
function fixture() {
  const journalRoot = realpathSync(mkdtempSync(join(tmpdir(), 'release-run-')))
  roots.push(journalRoot)
  const input = {
    schemaVersion: 1 as const,
    repo: 'owner/repo',
    operationId: UUID,
    package: 'repo-config' as const,
    commit: HEAD,
    issue: 12,
    dryRun: true,
    workflowHead: TOOL,
  }
  const run = {
    id: 44,
    workflow_id: 99,
    run_attempt: 1,
    head_sha: TOOL,
    head_branch: 'github-gate',
    path: '.github/workflows/gate-release.yml',
    repository: { full_name: input.repo },
    event: 'workflow_dispatch',
    status: 'queued',
    conclusion: null as string | null,
    inputs: releaseInputs(input),
  }
  const pending = [{ environment: { id: 17, name: 'npm-release' }, current_user_can_approve: true }]
  const approvals: unknown[] = []
  const calls: string[][] = []
  let now = 0,
    dispatches = 0,
    reviews = 0,
    loseDispatch = false,
    loseApproval = false,
    completeOnSleep = false
  const call: GhCommand = args => {
    calls.push([...args])
    const path = args.find(arg => arg.startsWith('repos/'))
    if (path === 'repos/owner/repo/actions/workflows/gate-release.yml')
      return { id: 99, path: '.github/workflows/gate-release.yml', state: 'active' }
    if (path === 'repos/owner/repo/git/ref/heads/github-gate')
      return { ref: 'refs/heads/github-gate', object: { sha: TOOL } }
    if (path?.endsWith('/dispatches')) {
      dispatches++
      if (loseDispatch) throw new Error('dispatch response lost')
      return {
        workflow_run_id: 44,
        run_url: 'https://api.github.com/repos/owner/repo/actions/runs/44',
        html_url: 'https://github.com/owner/repo/actions/runs/44',
      }
    }
    if (path?.endsWith('/pending_deployments')) {
      if (args[2] === 'POST') {
        reviews++
        if (loseApproval) throw new Error('approval response lost')
        approvals.push({
          state: 'approved',
          environments: [{ id: 17, name: 'npm-release' }],
          user: { login: 'human' },
          comment: 'Checks passed on exact candidate',
        })
        pending.splice(0)
        run.status = 'completed'
        run.conclusion = 'success'
        return []
      }
      return pending
    }
    if (path?.endsWith('/approvals')) return approvals
    if (
      path === 'repos/owner/repo/actions/runs/44' ||
      path === 'repos/owner/repo/actions/runs/44/attempts/1'
    )
      return run
    throw new Error(`unexpected endpoint ${path}`)
  }
  const options: ReleaseRunOptions = {
    input,
    journalRoot,
    call,
    approval: { kind: 'observe' },
    timeoutMs: 20,
    intervalMs: 10,
    now: () => now,
    sleep: async ms => {
      now += ms
      if (completeOnSleep) {
        run.status = 'completed'
        run.conclusion = 'success'
      }
    },
  }
  return {
    input,
    options,
    run,
    pending,
    calls,
    approvals,
    counts: () => ({ dispatches, reviews }),
    loseDispatch: () => {
      loseDispatch = true
    },
    loseApproval: () => {
      loseApproval = true
    },
    complete: () => {
      completeOnSleep = true
    },
  }
}

describe('npm release-run exact dispatch and approval boundary', () => {
  it('binds all inputs to the exact dispatch receipt and waits only for that workflow/head/run/attempt', async () => {
    const f = fixture()
    f.complete()
    const result = await releaseRun(f.options)
    expect(result).toMatchObject({
      status: 'completed',
      conclusion: 'success',
      runId: 44,
      runAttempt: 1,
      approvals: [],
    })
    const post = f.calls.find(args =>
      args.includes('repos/owner/repo/actions/workflows/99/dispatches'),
    )
    expect(post).toEqual(
      expect.arrayContaining([
        'ref=github-gate',
        'inputs[package]=repo-config',
        `inputs[commit]=${HEAD}`,
        'inputs[issue]=12',
        'inputs[dry_run]=true',
        'X-GitHub-Api-Version: 2026-03-10',
      ]),
    )
    expect(
      f.calls.some(args => args.includes('list') || args.some(arg => /runs\?/.test(arg))),
    ).toBe(false)
    expect(f.counts()).toEqual({ dispatches: 1, reviews: 0 })
    await releaseRun(f.options)
    expect(f.counts().dispatches).toBe(1)
  })
  it.each([
    'id',
    'workflow_id',
    'run_attempt',
    'head_sha',
    'head_branch',
    'path',
    'repository',
    'event',
    'inputs',
  ])('rejects a mismatching %s before approval', async field => {
    const f = fixture()
    Object.assign(f.run, {
      [field]:
        field === 'inputs'
          ? { ...f.run.inputs, issue: '13' }
          : field === 'repository'
            ? { full_name: 'foreign/repo' }
            : typeof Reflect.get(f.run, field) === 'number'
              ? 999
              : 'wrong',
    })
    await expect(
      releaseRun({ ...f.options, approval: { kind: 'approve', note: 'checks' } }),
    ).rejects.toThrow(field === 'inputs' ? 'input-mismatch' : 'identity-mismatch')
    expect(f.counts().reviews).toBe(0)
  })
  it('does not choose another run or redispatch after dispatch response loss, including restart', async () => {
    const f = fixture()
    f.loseDispatch()
    expect(await releaseRun(f.options)).toMatchObject({
      status: 'unknown',
      runId: null,
      diagnostic: 'dispatch-response-unknown-no-repost',
    })
    expect(await releaseRun(f.options)).toMatchObject({ status: 'unknown' })
    expect(f.counts()).toEqual({ dispatches: 1, reviews: 0 })
  })
  it('refuses changed package inputs with a reused operation identity', async () => {
    const f = fixture()
    f.loseDispatch()
    await releaseRun(f.options)
    await expect(releaseRun({ ...f.options, input: { ...f.input, issue: 13 } })).rejects.toThrow(
      'operation-conflict',
    )
    expect(f.counts().dispatches).toBe(1)
  })
  it('requires explicit approval, selects only npm-release, and reads actual platform approvals', async () => {
    const f = fixture()
    f.pending.unshift({ environment: { id: 16, name: 'publish' }, current_user_can_approve: true })
    const result = await releaseRun({
      ...f.options,
      approval: { kind: 'approve', note: 'Checks passed on exact candidate' },
    })
    expect(result).toMatchObject({
      status: 'completed',
      approvals: [
        { environmentId: 17, reviewer: 'human', note: 'Checks passed on exact candidate' },
      ],
    })
    const post = f.calls.find(
      args => args[2] === 'POST' && args.some(arg => arg.endsWith('/pending_deployments')),
    )
    expect(post).toContain('environment_ids[]=17')
    expect(post).not.toContain('environment_ids[]=16')
    expect(f.counts().reviews).toBe(1)
  })
  it('cannot widen GitHub approval permission', async () => {
    const f = fixture()
    const pending = f.pending[0]
    if (pending !== undefined) pending.current_user_can_approve = false
    expect(
      await releaseRun({ ...f.options, approval: { kind: 'approve', note: 'checks' } }),
    ).toMatchObject({ status: 'approval-required' })
    expect(f.counts().reviews).toBe(0)
  })
  it('persists unknown approval and never repeats it while it remains pending', async () => {
    const f = fixture()
    f.loseApproval()
    const options = { ...f.options, approval: { kind: 'approve' as const, note: 'checks' } }
    expect(await releaseRun(options)).toMatchObject({
      status: 'unknown',
      diagnostic: 'approval-response-unknown-no-repeat',
    })
    expect(await releaseRun(options)).toMatchObject({ status: 'timed-out' })
    expect(f.counts()).toEqual({ dispatches: 1, reviews: 1 })
  })
  it('does not dispatch after cancellation and distinguishes timeout from a completed failure', async () => {
    const f = fixture()
    expect(await releaseRun({ ...f.options, signal: AbortSignal.abort() })).toMatchObject({
      status: 'cancelled',
      runId: null,
    })
    expect(f.counts().dispatches).toBe(0)
    expect(await releaseRun(f.options)).toMatchObject({ status: 'timed-out', conclusion: null })
    f.run.status = 'completed'
    f.run.conclusion = 'failure'
    expect(await releaseRun(f.options)).toMatchObject({
      status: 'completed',
      conclusion: 'failure',
    })
  })
  it('isolates concurrent operations and never writes shared approval files', async () => {
    const f = fixture()
    const a = await releaseRun(f.options)
    const b = await releaseRun({ ...f.options, input: { ...f.input, operationId: NEXT_UUID } })
    expect(a.journal).not.toBe(b.journal)
    expect(f.calls.flat().some(arg => arg.startsWith('/tmp/release-approve'))).toBe(false)
  })
  it('returns failure from the command adapter for a failed exact run, and rejects mismatched approval options', async () => {
    const f = fixture()
    f.run.status = 'completed'
    f.run.conclusion = 'failure'
    const file = join(f.options.journalRoot, 'input.json')
    writeFileSync(file, JSON.stringify(f.input))
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    expect(
      await releaseRunMain(['--input', file, '--journal', f.options.journalRoot], {
        call: f.options.call,
      }),
    ).toBe(1)
    await expect(
      releaseRunMain(['--input', file, '--journal', f.options.journalRoot, '--approve']),
    ).rejects.toThrow('approval-options-invalid')
  })
})

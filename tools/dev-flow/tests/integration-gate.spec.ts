import { describe, expect, it } from 'vitest'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { confirmationNote, NOTE_LIMIT, waitGate } from '../src/integration/gate.ts'

type Poll = { status: string; conclusion?: string; pending?: unknown[] }
/**
 * A GitHub stand-in that answers poll `i` with `polls[i]`: the run read returns its status,
 * the pending read that follows returns its pending deployments. Approvals are recorded.
 */
function gate(polls: Poll[]) {
  const calls: string[][] = []
  let poll = 0
  const call: GhCommand = argv => {
    calls.push([...argv])
    const path = argv.find(item => item.startsWith('repos/')) ?? ''
    const current = polls[Math.min(poll, polls.length - 1)] ?? { status: 'completed' }
    if (argv[2] === 'POST') return {}
    if (path.endsWith('/pending_deployments')) {
      poll += 1
      return current.pending ?? []
    }
    return { status: current.status, conclusion: current.conclusion ?? null }
  }
  const posts = () => calls.filter(c => c[2] === 'POST')
  return { call, calls, posts }
}
const pending = (id: number, name: string, can = true) => ({
  environment: { id, name },
  current_user_can_approve: can,
})
const options = {
  repository: 'owner/repo',
  run: 42,
  note: 'admission exit 0; D-I90 checked; confirmed for PanQiWei',
  environments: ['publish'],
  sleep: async () => {},
  now: () => 0,
}

describe('gate wait', () => {
  it('approves only the named environments the caller can approve, again on each poll', async () => {
    const g = gate([
      {
        status: 'waiting',
        pending: [
          pending(5, 'publish'),
          pending(6, 'publish', false),
          pending(7, 'repo-toolchain-review'),
        ],
      },
      { status: 'waiting', pending: [pending(5, 'publish')] },
      { status: 'completed', conclusion: 'success' },
    ])
    await expect(waitGate({ ...options, call: g.call })).resolves.toEqual({
      run: 42,
      conclusion: 'success',
      approvals: [[5], [5]],
    })
    const posts = g.posts()
    expect(posts).toHaveLength(2)
    for (const post of posts) {
      expect(post).toEqual(
        expect.arrayContaining([
          'environment_ids[]=5',
          'state=approved',
          `comment=${options.note}`,
        ]),
      )
      expect(post).not.toContain('environment_ids[]=6')
      expect(post).not.toContain('environment_ids[]=7')
    }
  })

  it('approves a toolchain review environment only when it is named', async () => {
    const g = gate([
      { status: 'waiting', pending: [pending(7, 'repo-toolchain-review'), pending(5, 'publish')] },
      { status: 'completed', conclusion: 'failure' },
    ])
    const result = await waitGate({
      ...options,
      environments: ['repo-toolchain-review', 'publish'],
      call: g.call,
    })
    expect(result).toEqual({ run: 42, conclusion: 'failure', approvals: [[7, 5]] })
  })

  it('refuses a note over the limit in characters, before any request', async () => {
    const g = gate([{ status: 'completed', conclusion: 'success' }])
    // Astral characters count once each, though each takes two UTF-16 code units.
    const astral = '😀'.repeat(NOTE_LIMIT)
    expect(confirmationNote(astral)).toBe(astral)
    await expect(waitGate({ ...options, note: `${astral}😀`, call: g.call })).rejects.toThrow(
      'at most 1024',
    )
    expect(g.calls).toEqual([])
    expect(() => confirmationNote('  ')).toThrow('empty')
    await expect(waitGate({ ...options, environments: [], call: g.call })).rejects.toThrow(
      'at least one environment',
    )
  })

  it('stops with unknown after the wait', async () => {
    let clock = 0
    const g = gate([{ status: 'in_progress' }])
    await expect(
      waitGate({
        ...options,
        call: g.call,
        now: () => clock,
        sleep: async ms => void (clock += ms),
        intervalMs: 10,
        timeoutMs: 25,
      }),
    ).rejects.toThrow('did not complete')
  })
})

import {
  gateInputs,
  gateRunName,
  readGateRun,
  verifyGateRun,
  type GateCorrelation,
} from '../src/integration/gate-correlation.ts'
import { canonical, digest } from '../src/integration/parse.ts'

describe('exact read-only integration gate correlation', () => {
  function correlation(): GateCorrelation {
    const subject = { pull: 91, candidateHead: 'a'.repeat(40), checkpoint: 'release-1' }
    return {
      repo: 'owner/repo',
      ...subject,
      adoptedWorkflowHead: 'b'.repeat(40),
      workflow: {
        path: '.github/workflows/gate-publish.yml',
        ref: 'github-gate',
        head: 'b'.repeat(40),
        runId: 42,
        runAttempt: 2,
        inputDigest: digest(canonical(gateInputs(subject))),
      },
    }
  }
  function run(input = correlation()) {
    return {
      repository: { full_name: input.repo },
      id: input.workflow.runId,
      run_attempt: input.workflow.runAttempt,
      path: input.workflow.path,
      head_branch: input.workflow.ref,
      head_sha: input.workflow.head,
      event: 'workflow_dispatch',
      display_title: gateRunName(input),
      status: 'completed',
      conclusion: 'success',
      inputs: gateInputs(input),
    }
  }
  it('checks current run and exact attempt without approving or selecting the latest run', () => {
    const calls: string[][] = [],
      input = correlation()
    const result = readGateRun(args => {
      calls.push([...args])
      return run(input)
    }, input)
    expect(result).toMatchObject({ runId: 42, runAttempt: 2, conclusion: 'success' })
    expect(calls.map(args => args.at(-1))).toEqual([
      'repos/owner/repo/actions/runs/42',
      'repos/owner/repo/actions/runs/42/attempts/2',
    ])
    expect(calls.every(args => args[2] === 'GET')).toBe(true)
  })
  it.each([
    { id: 43 },
    { run_attempt: 3 },
    { head_sha: 'c'.repeat(40) },
    { head_branch: 'main' },
    { path: '.github/workflows/other.yml' },
    { repository: { full_name: 'attacker/repo' } },
    { display_title: 'gate-publish #91' },
    { inputs: { pr: '92', head: 'a'.repeat(40), checkpoint: 'release-1' } },
  ])('rejects a changed identity or dispatch input: %j', patch => {
    expect(() => verifyGateRun({ ...run(), ...patch }, correlation())).toThrow(
      /reduce-gate-(run|input)-mismatch/,
    )
  })
  it('rejects old green evidence for a new candidate and an unadopted workflow', () => {
    const input = correlation()
    expect(() => verifyGateRun(run(input), { ...input, candidateHead: 'c'.repeat(40) })).toThrow(
      'reduce-gate-input-mismatch',
    )
    expect(() =>
      verifyGateRun(run(input), { ...input, adoptedWorkflowHead: 'c'.repeat(40) }),
    ).toThrow('reduce-gate-input-mismatch')
  })
})

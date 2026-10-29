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

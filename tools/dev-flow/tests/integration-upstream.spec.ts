// @module-tag slow
// I14 upstream chain checks and route targets against a real task worktree and a local bare
// remote; every case runs Git subprocesses, and the CLI case starts a Node process.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  gateRecord,
  integrationFixture,
  policyDocument,
  setGate,
  setStartTag,
  trackEntry,
} from './fixtures/integration.ts'
import { stubGhEnv } from './fixtures/gh.ts'
import type { Route } from '../src/delivery/binding.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { contextPath } from '../src/integration/context.ts'
import { git, maybeRef } from '../src/integration/git.ts'
import { IntegrationError } from '../src/integration/parse.ts'
import { parsePolicy } from '../src/integration/policy.ts'
import { taskStatus, taskSync } from '../src/integration/sync.ts'
import { checkUpstream } from '../src/integration/upstream.ts'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
type Entry = ReturnType<typeof trackEntry>
const cliPath = fileURLToPath(new URL('../src/integration/cli.ts', import.meta.url))

/**
 * `runtime` is top level with a cutover entry and no start tag, like the existing repository
 * tracks. `child` (parent runtime) and `grand` (parent child) have start tags with `parent`.
 * The tags exist only on the remote, so a check has to fetch them.
 */
function chainFixture() {
  const f = integrationFixture()
  homes.push(f.home)
  stubGhEnv(f.bin, (name, value) => vi.stubEnv(name, value))
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  branchAt(f.remote, 'child', f.initial)
  branchAt(f.remote, 'grand', f.main)
  setStartTag(f.remote, 'child', f.initial, gateRecord('child', f.initial, 'runtime'))
  setStartTag(f.remote, 'grand', f.main, gateRecord('grand', f.main, 'child'))
  const tracks = {
    runtime: trackEntry('runtime', f.initial),
    child: trackEntry('child', f.initial, 'runtime'),
    grand: trackEntry('grand', f.main, 'child'),
  }
  function policy(entries: Entry[] = Object.values(tracks), location = f.remote) {
    return parsePolicy(policyDocument(f.initial, location, entries))
  }
  return { ...f, tracks, policy }
}
type Chain = ReturnType<typeof chainFixture>
function branchAt(remote: string, id: string, start: string): void {
  git(remote, ['update-ref', `refs/heads/integration/${id}`, start])
}
function deleteRef(remote: string, ref: string): void {
  git(remote, ['update-ref', '-d', ref])
}
function route(track: string, kind: Route['kind'] = 'track'): Route {
  return kind === 'track' ? { kind, track } : { kind, track, owners: ['human'] }
}
function failure(action: () => unknown): { code: string; message: string } {
  try {
    action()
  } catch (error) {
    if (error instanceof IntegrationError) return { code: error.code, message: error.message }
    throw error
  }
  throw new Error('Expected the upstream check to fail')
}
function hasObject(root: string, oid: string): boolean {
  return maybeRef(root, `${oid}^{object}`) !== null
}

describe('I14 upstream chain', () => {
  it('accepts a three-level chain, with a paused upstream, and returns the fetched target branch', () => {
    const f = chainFixture()
    const paused = { ...f.tracks.child, status: 'paused' as const }
    const result = checkUpstream(
      f.root,
      f.policy([f.tracks.runtime, paused, f.tracks.grand]),
      route('grand'),
    )
    expect(result).toEqual({ ref: 'refs/heads/integration/grand', head: f.main })
    expect(hasObject(f.root, result.head)).toBe(true)
  })

  it.each<[string, (f: Chain) => { entries?: Entry[]; target: string }, string]>([
    ['an unregistered target', () => ({ target: 'missing' }), 'Track missing is not registered'],
    [
      'an unregistered upstream',
      f => ({
        entries: [f.tracks.runtime, { ...f.tracks.child, parent: 'ghost' }, f.tracks.grand],
        target: 'grand',
      }),
      'Upstream track ghost of child is not registered',
    ],
    [
      'a repeated track in the chain',
      f => ({
        entries: [{ ...f.tracks.child, parent: 'grand' }, f.tracks.grand, f.tracks.runtime],
        target: 'grand',
      }),
      'Track grand appears twice',
    ],
    ...(['paused', 'retiring', 'retired'] as const).map(
      status =>
        [
          `a ${status} target`,
          (f: Chain) => ({
            entries: [f.tracks.runtime, { ...f.tracks.child, status }],
            target: 'child',
          }),
          'Track child is not active and registered',
        ] as [string, (f: Chain) => { entries?: Entry[]; target: string }, string],
    ),
    ...(['retiring', 'retired'] as const).map(
      status =>
        [
          `a ${status} upstream`,
          (f: Chain) => ({
            entries: [{ ...f.tracks.runtime, status }, f.tracks.child],
            target: 'child',
          }),
          `Upstream track runtime is ${status}`,
        ] as [string, (f: Chain) => { entries?: Entry[]; target: string }, string],
    ),
    [
      'a target whose branch does not exist on the remote',
      f => {
        deleteRef(f.remote, 'refs/heads/integration/grand')
        return { target: 'grand' }
      },
      'Remote branch integration/grand does not exist',
    ],
    [
      'an upstream that the registry lists as active after its branch was deleted',
      f => {
        deleteRef(f.remote, 'refs/heads/integration/runtime')
        return { target: 'grand' }
      },
      'Remote branch integration/runtime does not exist',
    ],
    [
      'a registry parent that differs from the start tag',
      f => ({
        entries: [f.tracks.runtime, f.tracks.child, { ...f.tracks.grand, parent: 'runtime' }],
        target: 'grand',
      }),
      'Registry parent runtime of grand differs from the trusted upstream child',
    ],
    [
      'a child track whose old start tag has no parent and so records main',
      f => {
        branchAt(f.remote, 'legacy', f.initial)
        setStartTag(f.remote, 'legacy', f.initial, gateRecord('legacy', f.initial))
        return {
          entries: [f.tracks.runtime, trackEntry('legacy', f.initial, 'runtime')],
          target: 'legacy',
        }
      },
      'Registry parent runtime of legacy differs from the trusted upstream main',
    ],
    [
      'a child track without a start tag whose cutover entry makes its upstream main',
      f => {
        deleteRef(f.remote, 'refs/tags/omne/gate/track/child')
        setGate(
          f.remote,
          JSON.stringify({ 'integration/runtime': f.initial, 'integration/child': f.initial }),
        )
        return { target: 'child' }
      },
      'Registry parent runtime of child differs from the trusted upstream main',
    ],
    [
      'a track with neither a start tag nor a cutover entry',
      f => {
        setGate(f.remote, JSON.stringify({ main: f.main }))
        return { target: 'child' }
      },
      'Track runtime has neither a start tag nor a cutover entry',
    ],
    [
      'a track without a start tag when the remote has no github-gate branch',
      f => {
        deleteRef(f.remote, 'refs/heads/github-gate')
        return { target: 'runtime' }
      },
      'Track runtime has neither a start tag nor a cutover entry',
    ],
    [
      'a track without a start tag when github-gate has no gate/cutover.json',
      f => {
        setGate(f.remote)
        return { target: 'runtime' }
      },
      'Track runtime has neither a start tag nor a cutover entry',
    ],
  ])('refuses %s', (_, setup, message) => {
    const f = chainFixture(),
      { entries, target } = setup(f)
    expect(failure(() => checkUpstream(f.root, f.policy(entries), route(target)))).toEqual({
      code: 'refused',
      message: expect.stringContaining(message),
    })
  })

  it('accepts an old start tag without parent, or with a null parent, as main and prefers a start tag over a cutover entry', () => {
    const f = chainFixture()
    branchAt(f.remote, 'legacy', f.initial)
    setStartTag(f.remote, 'legacy', f.initial, gateRecord('legacy', f.initial))
    expect(
      checkUpstream(f.root, f.policy([trackEntry('legacy', f.initial)]), route('legacy')).ref,
    ).toBe('refs/heads/integration/legacy')
    branchAt(f.remote, 'nulled', f.initial)
    setStartTag(
      f.remote,
      'nulled',
      f.initial,
      JSON.stringify({ ...JSON.parse(gateRecord('nulled', f.initial)), parent: null }),
    )
    expect(
      checkUpstream(f.root, f.policy([trackEntry('nulled', f.initial)]), route('nulled')).ref,
    ).toBe('refs/heads/integration/nulled')
    // An admin may register a check floor for a child track; its upstream still comes from the tag.
    setGate(
      f.remote,
      JSON.stringify({ 'integration/runtime': f.initial, 'integration/child': f.main }),
    )
    expect(checkUpstream(f.root, f.policy(), route('child')).ref).toBe(
      'refs/heads/integration/child',
    )
  })

  it.each<[string, (f: Chain) => void]>([
    [
      'a lightweight start tag',
      f => {
        deleteRef(f.remote, 'refs/tags/omne/gate/track/child')
        setStartTag(f.remote, 'child', f.initial)
      },
    ],
    [
      'a start tag whose message is not JSON',
      f => {
        deleteRef(f.remote, 'refs/tags/omne/gate/track/child')
        setStartTag(f.remote, 'child', f.initial, 'created by hand')
      },
    ],
    [
      'a start tag whose JSON is not a gate record',
      f => {
        deleteRef(f.remote, 'refs/tags/omne/gate/track/child')
        setStartTag(f.remote, 'child', f.initial, JSON.stringify({ parent: 'runtime' }))
      },
    ],
    ...['integration/runtime', 'stable', 42].map(
      parent =>
        [
          `a start tag with parent ${JSON.stringify(parent)}`,
          (f: Chain) => {
            deleteRef(f.remote, 'refs/tags/omne/gate/track/child')
            setStartTag(
              f.remote,
              'child',
              f.initial,
              JSON.stringify({ ...JSON.parse(gateRecord('child', f.initial)), parent }),
            )
          },
        ] as [string, (f: Chain) => void],
    ),
    ['a cutover file that is not JSON', f => void setGate(f.remote, '{')],
    ['a cutover file that is an array', f => void setGate(f.remote, '["integration/runtime"]')],
    [
      'a cutover entry whose value is not a commit',
      f => void setGate(f.remote, JSON.stringify({ 'integration/runtime': 'HEAD' })),
    ],
    [
      'a cutover key that is not a branch name',
      f =>
        void setGate(
          f.remote,
          JSON.stringify({ 'integration/runtime': f.initial, 'bad..name': f.initial }),
        ),
    ],
  ])('reports %s as unknown', (_, setup) => {
    const f = chainFixture()
    setup(f)
    expect(failure(() => checkUpstream(f.root, f.policy(), route('child'))).code).toBe('unknown')
  })

  it('reports an unreadable remote as unknown', () => {
    const f = chainFixture()
    expect(
      failure(() =>
        checkUpstream(f.root, f.policy(undefined, join(f.home, 'missing.git')), route('runtime')),
      ),
    ).toEqual({ code: 'unknown', message: expect.stringContaining('Cannot read remote refs') })
  })

  it('ignores problems of registry entries outside the chain', () => {
    const f = chainFixture()
    const entries = [
      ...Object.values(f.tracks),
      trackEntry('orphan', f.initial, 'ghost'),
      trackEntry('retired', f.initial, 'main', 'retired'),
      trackEntry('branchless', f.initial),
      trackEntry('untrusted', f.initial, 'runtime'),
      { ...f.tracks.child, id: 'sibling', branch: 'integration/sibling', parent: 'grand' },
    ]
    branchAt(f.remote, 'untrusted', f.initial)
    expect(checkUpstream(f.root, f.policy(entries), route('grand')).head).toBe(f.main)
  })

  it('reads only the chain branches and start tags, and the cutover file only when needed', () => {
    const f = chainFixture()
    const other = setStartTag(f.remote, 'other', f.initial, gateRecord('other', f.initial, 'main'))
    git(f.remote, ['tag', '-a', 'unrelated', '-m', 'unrelated', f.initial])
    const unrelated = git(f.remote, ['rev-parse', 'refs/tags/unrelated'])
    const gate = git(f.remote, ['rev-parse', 'refs/heads/github-gate'])
    const runtimeTag = setStartTag(
      f.remote,
      'runtime',
      f.initial,
      gateRecord('runtime', f.initial, 'main'),
    )
    checkUpstream(f.root, f.policy(), route('grand'))
    expect(hasObject(f.root, runtimeTag)).toBe(true)
    expect(hasObject(f.root, gate)).toBe(false)
    expect(hasObject(f.root, other)).toBe(false)
    expect(hasObject(f.root, unrelated)).toBe(false)
    expect(git(f.root, ['for-each-ref', '--format=%(refname)', 'refs/tags/'])).toBe('')
    deleteRef(f.remote, 'refs/tags/omne/gate/track/runtime')
    checkUpstream(f.root, f.policy(), route('grand'))
    expect(hasObject(f.root, gate)).toBe(true)
    expect(hasObject(f.root, other)).toBe(false)
  })
})

describe('route targets at start', () => {
  const common = {
    schemaVersion: 1,
    responsible: 'human',
    basis: ['fixture authority'],
    action: 'dispatch',
    confirmations: [],
  } as const
  /**
   * Commits a registry with the chain tracks and a line table whose one line owns the write
   * scope, binds the task to `route` with a version 2 binding of that line and runs start. A
   * `grand` route belongs to a line of the grand track; any other route to a line without a
   * track, whose cards enter the integration track `runtime`. The card attributes agree with
   * the route, so no attribute finding refuses it.
   */
  async function start(f: Chain, taskRoute: Route, entries: Entry[] = Object.values(f.tracks)) {
    writeFileSync(
      join(f.root, 'docs/engineering/integration-policy.json'),
      JSON.stringify(policyDocument(f.initial, f.remote, entries)),
    )
    const line = taskRoute.track === 'grand' ? 'grand-line' : 'tools-line'
    writeFileSync(
      join(f.root, 'docs/engineering/delivery-lines.json'),
      JSON.stringify({
        schemaVersion: 1,
        integration: { track: 'runtime', paths: ['apps'] },
        shared: [],
        lines: [
          {
            id: line,
            title: line,
            owner: 'human',
            track: line === 'grand-line' ? 'grand' : null,
            paths: ['feature'],
            contracts: [],
          },
        ],
      }),
    )
    git(f.root, ['commit', '-qam', 'Fixture chain registry and line table'])
    const attributes = { line, nature: 'impl', contractChange: 'none' }
    Object.assign(f.binding, { schemaVersion: 2, ...attributes, milestone: 'M1' })
    f.binding.route = taskRoute
    f.binding.completionTarget = 'track'
    f.update(f.binding, [], 'open', attributes)
    const platform = join(f.home, 'platform.json')
    writeFileSync(
      platform,
      JSON.stringify({
        ...JSON.parse(readFileSync(platform, 'utf8')),
        labels: ['kind:feature', `line:${line}`, 'nature:impl'],
      }),
    )
    f.authority({ ...common, basis: [...common.basis], task: f.binding, confirmations: [] }, 1)
    return (await openIntegration({ root: f.root })).execute({
      kind: 'start',
      authority: f.binding.dispatch,
      issue: f.binding.issue.url,
      revision: 1,
      attempt: 'one',
    })
  }

  it.each<[Route, string, (f: Chain) => string]>([
    [route('grand'), 'refs/heads/integration/grand', f => f.main],
    [route('runtime', 'global'), 'refs/heads/integration/runtime', f => f.initial],
    [route('runtime', 'cross-track'), 'refs/heads/integration/runtime', f => f.initial],
  ])('starts a %j route on its named track branch', async (taskRoute, ref, head) => {
    const f = chainFixture()
    await expect(start(f, taskRoute)).resolves.toMatchObject({
      targetBase: head(f),
      ownerTask: { route: taskRoute, completionTarget: 'track' },
    })
    expect(taskStatus(f.root)).toMatchObject({
      bound: true,
      target: { ref, head: head(f) },
      relation: 'current',
    })
  })

  it.each(['global', 'cross-track'] as const)(
    'refuses a %s route that names a track below the top level and writes no context',
    async kind => {
      const f = chainFixture()
      await expect(start(f, route('child', kind))).rejects.toMatchObject({
        code: 'refused',
        message: expect.stringContaining('must name a top-level track'),
      })
      expect(existsSync(contextPath(f.root))).toBe(false)
    },
  )

  it('refuses a failed chain check through the CLI with code refused and writes no context', () => {
    const f = chainFixture()
    deleteRef(f.remote, 'refs/heads/integration/runtime')
    writeFileSync(
      join(f.root, 'docs/engineering/integration-policy.json'),
      JSON.stringify(policyDocument(f.initial, f.remote, Object.values(f.tracks))),
    )
    git(f.root, ['commit', '-qam', 'Fixture chain registry'])
    f.binding.route = route('child')
    f.update(f.binding)
    f.authority({ ...common, basis: [...common.basis], task: f.binding, confirmations: [] }, 1)
    const input = join(f.home, 'start.json')
    writeFileSync(
      input,
      JSON.stringify({
        kind: 'start',
        authority: f.binding.dispatch,
        issue: f.binding.issue.url,
        revision: 1,
        attempt: 'one',
      }),
    )
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cliPath, 'execute', '--input', input, '--root', f.root],
      { encoding: 'utf8', env: process.env },
    )
    expect(result.status, result.stderr).toBe(2)
    expect(JSON.parse(result.stderr)).toEqual({
      code: 'refused',
      message: 'Remote branch integration/runtime does not exist',
    })
    expect(existsSync(contextPath(f.root))).toBe(false)
  })

  it('does not check the upstream chain in status or task-sync', async () => {
    const f = chainFixture()
    await start(f, route('grand'))
    const before = readFileSync(contextPath(f.root), 'utf8')
    deleteRef(f.remote, 'refs/heads/integration/runtime')
    deleteRef(f.remote, 'refs/tags/omne/gate/track/child')
    expect(taskStatus(f.root)).toMatchObject({ bound: true, relation: 'current' })
    expect(taskSync(f.root, f.main)).toMatchObject({ targetBase: f.main })
    expect(readFileSync(contextPath(f.root), 'utf8')).toBe(before)
  })
})

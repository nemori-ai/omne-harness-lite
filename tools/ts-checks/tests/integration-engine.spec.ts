// @module-tag slow
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { integrationFixture, commit, init } from './fixtures/integration.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { prepare } from '../src/integration/candidate.ts'
import { runCommands, verify } from '../src/integration/verify.ts'
import { parsePolicy } from '../src/integration/policy.ts'
import { publish, resume } from '../src/integration/publish.ts'
import { canonical, digest } from '../src/integration/parse.ts'
import { conditionDigest, type Decision, type Confirmation } from '../src/integration/authority.ts'
import { baselines } from '../src/integration/context.ts'
import { auditHistory, scopeViolations } from '../src/integration/audit.ts'
import { git } from '../src/integration/git.ts'
import type { Condition } from '../src/delivery/protocol.ts'
import type { Candidate } from '../src/integration/records.ts'
const homes: string[] = []

it('policy revision 2 uses the complete check for both profiles and only full sets FULL=1', () => {
  const policy = parsePolicy(
    JSON.parse(
      readFileSync(
        new URL('../../../docs/engineering/integration-policy.json', import.meta.url),
        'utf8',
      ),
    ),
  )
  expect(policy.revision).toBe('2')
  expect(policy.profiles.integration).toContain('check')
  expect(policy.profiles.full).toContain('check')
  expect(policy.tracks.find(track => track.id === 'development')?.checks).toEqual(['check'])
  expect(policy.commands.find(command => command.id === 'check')?.argv).toEqual([
    'bash',
    '{runner}/scripts/check.sh',
  ])
  expect(policy.commands.some(command => command.id === 'engineering-check')).toBe(false)
  expect(policy.checkpointCoverage).toEqual({
    startup: ['startup'],
    install: ['runner-dependencies', 'runner-python', 'subject-dependencies'],
    migration: ['migration-tests'],
    mainPath: ['context-main-path', 'check'],
  })
  const home = mkdtempSync(join(tmpdir(), 'omne-policy-profiles-'))
  homes.push(home)
  const observed = {
    ...policy,
    commands: policy.commands.map(command => ({
      ...command,
      argv: [
        process.execPath,
        '-e',
        'process.stdout.write(JSON.stringify({id:process.argv[1],full:process.env.FULL,subject:process.env.OMNE_SUBJECT_ROOT,runner:process.env.OMNE_RUNNER_ROOT,gitDir:process.env.GIT_DIR,index:process.env.GIT_INDEX_FILE}))',
        command.id,
      ],
    })),
  }
  vi.stubEnv('FULL', 'hostile-inherited-value')
  vi.stubEnv('GIT_DIR', '/foreign/repository')
  vi.stubEnv('GIT_INDEX_FILE', '/foreign/index')
  for (const profile of ['integration', 'full'] as const) {
    const commands = runCommands(observed, profile, home, home, join(home, profile), null, [
      'check',
    ])
    expect(commands.map(command => command.id)).toEqual(policy.profiles[profile])
    expect(commands.filter(command => command.id === 'check')).toHaveLength(1)
    for (const command of commands)
      expect(JSON.parse(readFileSync(command.log, 'utf8'))).toEqual({
        id: command.id,
        full: profile === 'full' ? '1' : '',
        subject: home,
        runner: home,
      })
  }
})
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
function fixture() {
  const f = integrationFixture()
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  return f
}
const common = {
  schemaVersion: 1,
  policyRevision: '1',
  responsible: 'human',
  basis: ['fixture explicit authorization'],
} as const
function grant(
  f: ReturnType<typeof fixture>,
  c: Candidate,
  receiptDigest: string,
  confirmations: Confirmation[] = [],
  revalidations: Extract<Decision, { action: 'publish' }>['revalidations'] = [],
) {
  return f.authority({
    ...common,
    basis: [...common.basis],
    action: 'publish',
    operation: c.operation,
    candidate: c.candidate,
    expectedBase: c.expectedBase,
    sources: c.sources,
    tasks: c.tasks,
    receiptDigest,
    allowedRefs: [
      c.target,
      `refs/tags/omne/integration/unit/${c.operation}`,
      ...(c.checkpoint === null ? [] : [`refs/tags/omne/integration/checkpoint/${c.checkpoint}`]),
    ],
    confirmations,
    revalidations,
  })
}
async function start(f: ReturnType<typeof fixture>) {
  f.authority(
    { ...common, basis: [...common.basis], action: 'dispatch', task: f.binding, confirmations: [] },
    1,
  )
  await (
    await openIntegration({ root: f.root })
  ).execute({
    kind: 'start',
    authority: f.binding.dispatch,
    issue: f.binding.issue.url,
    revision: 1,
    attempt: 'one',
  })
}
describe('real candidate CLI and trusted execution', () => {
  it('keeps pending CLI observational', () => {
    const root = mkdtempSync(join(tmpdir(), 'omne-integration-pending-'))
    homes.push(root)
    init(root)
    commit(root, 'README.md', 'Unadopted fixture\n')
    const cli = new URL('../src/integration/cli.ts', import.meta.url).pathname
    const result = spawnSync(
      'node',
      ['--experimental-strip-types', cli, 'status', '--root', root],
      { encoding: 'utf8' },
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).kind).toBe('pending')
  })
  it('lands work before main-scoped conditions, then requires revalidation and main/stable conditions for later transport', async () => {
    const f = fixture()
    const mainCondition: Condition = {
      id: 'D1',
      kind: 'decision',
      target: 'main review',
      phase: 'integration',
      predicate: 'Owner confirmed main readiness',
      evidence: 'human',
      scope: 'main',
    }
    const stableCondition: Condition = {
      ...mainCondition,
      id: 'D2',
      target: 'stable readiness',
      scope: 'stable',
    }
    const resultCondition: Condition = {
      ...mainCondition,
      id: 'D3',
      phase: 'acceptance',
      target: 'main contains result',
      scope: 'all',
    }
    f.binding.conditions.push('D1', 'D2', 'D3')
    f.update(f.binding, [mainCondition, stableCondition, resultCondition])
    await start(f)
    const source = commit(f.root, 'feature', 'feature')
    const prepared = prepare(f.root, {
      kind: 'prepare',
      mode: 'work',
      sources: [{ kind: 'work', source }],
    })
    if (prepared.kind !== 'candidate') throw new Error('unexpected conflict')
    const receipt = verify(f.root, prepared.operation)
    const authorization = grant(f, prepared.candidate, receipt.receiptDigest)
    expect(publish(f.root, prepared.operation, authorization).observation.kind).toBe('published')
    expect(resume(f.root, prepared.operation).kind).toBe('published')
    f.update(f.binding, [mainCondition, stableCondition, resultCondition], 'closed')
    const ri = prepare(f.root, {
      kind: 'prepare',
      mode: 'ri',
      sources: [{ kind: 'track', track: 'runtime', source: prepared.candidate.candidate }],
    })
    if (ri.kind !== 'candidate') throw new Error('unexpected conflict')
    expect(ri.candidate.tasks).toHaveLength(1)
    const verified = verify(f.root, ri.operation)
    const revalidations = ri.candidate.tasks.map(task => ({
      historical: digest(canonical(task)),
      current: digest(
        canonical({ binding: f.binding, state: 'closed', updatedAt: '2026-10-11T00:00:00Z' }),
      ),
      evidence: 'owner confirms historical result remains applicable and not revoked',
    }))
    expect(() =>
      publish(f.root, ri.operation, grant(f, ri.candidate, verified.receiptDigest)),
    ).toThrow('revalidation')
    expect(() =>
      publish(
        f.root,
        ri.operation,
        grant(f, ri.candidate, verified.receiptDigest, [], revalidations),
      ),
    ).toThrow('D1')
    const confirmed = [
      {
        issue: f.binding.issue.url,
        condition: 'D1',
        digest: conditionDigest(mainCondition),
        evidence: 'main review',
      },
    ]
    expect(
      publish(
        f.root,
        ri.operation,
        grant(f, ri.candidate, verified.receiptDigest, confirmed, revalidations),
      ).observation.kind,
    ).toBe('published')
    const stable = prepare(f.root, {
      kind: 'prepare',
      mode: 'checkpoint',
      sources: [{ kind: 'main', source: ri.candidate.candidate }],
      checkpoint: 'v-fixture',
      initialAudit: f.main,
    })
    if (stable.kind !== 'candidate') throw new Error('unexpected conflict')
    expect(stable.candidate.candidate).toBe(ri.candidate.candidate)
    expect(stable.candidate.tasks).toHaveLength(1)
    const stableReceipt = verify(f.root, stable.operation)
    expect(() =>
      publish(
        f.root,
        stable.operation,
        grant(f, stable.candidate, stableReceipt.receiptDigest, [], revalidations),
      ),
    ).toThrow('D2')
    const stableConfirmed = [
      {
        issue: f.binding.issue.url,
        condition: 'D2',
        digest: conditionDigest(stableCondition),
        evidence: 'stable review',
      },
    ]
    const result = publish(
      f.root,
      stable.operation,
      grant(f, stable.candidate, stableReceipt.receiptDigest, stableConfirmed, revalidations),
    )
    expect(result.observation.kind).toBe('published')
    expect(JSON.stringify(result.handoff)).toContain('"acceptance":"unknown"')
    for (const line of readFileSync(f.calls, 'utf8').trim().split('\n')) {
      const args = JSON.parse(line)
      expect(args[0]).toBe('api')
      expect(args[1] === 'graphql' || args[2] === 'GET').toBe(true)
    }
  })
  it.each(['main', 'track'] as const)(
    'keeps original task base and passes real audit after %s task sync',
    async kind => {
      const f = fixture()
      await start(f)
      const work = commit(f.root, 'feature', 'work')
      git(f.root, ['push', 'origin', 'HEAD:refs/heads/human/task'])
      git(f.root, ['checkout', 'main'])
      const main = commit(f.root, 'external', 'main outside task scope')
      git(f.root, ['push', 'origin', 'main'])
      git(f.root, ['checkout', 'human/task'])
      let syncSource = main
      if (kind === 'track') {
        const fi = prepare(f.root, {
          kind: 'prepare',
          mode: 'fi',
          track: 'runtime',
          sources: [{ kind: 'main', source: main }],
        })
        if (fi.kind !== 'candidate') throw new Error('conflict')
        const verified = verify(f.root, fi.operation)
        expect(
          publish(f.root, fi.operation, grant(f, fi.candidate, verified.receiptDigest)).observation
            .kind,
        ).toBe('published')
        syncSource = fi.candidate.candidate
      }
      const sync = prepare(f.root, {
        kind: 'prepare',
        mode: 'task-sync',
        sources: [
          kind === 'main'
            ? { kind, source: syncSource }
            : { kind, source: syncSource, track: 'runtime' },
        ],
      })
      if (sync.kind !== 'candidate') throw new Error('conflict')
      expect(sync.candidate.expectedBase).toBe(work)
      expect(sync.candidate.ownerTask?.taskBase).toBe(f.main)
      const syncReceipt = verify(f.root, sync.operation)
      expect(
        publish(f.root, sync.operation, grant(f, sync.candidate, syncReceipt.receiptDigest))
          .observation.kind,
      ).toBe('published')
      const next = prepare(sync.candidate.subject, {
        kind: 'prepare',
        mode: 'work',
        sources: [{ kind: 'work', source: sync.candidate.candidate }],
      })
      if (next.kind !== 'candidate') throw new Error('conflict')
      expect(baselines(next.candidate.subject).audits[0]?.binding.taskBase).toBe(f.main)
      expect(scopeViolations(next.candidate.subject)).toEqual([])
      expect(
        auditHistory(next.candidate.subject, undefined, {
          memberRoots: ['apps'],
          directory: 'acceptance',
          ownerRoles: ['main', 'qa'],
        }).every(range => range.acceptance.violations.length === 0),
      ).toBe(true)
      expect(verify(sync.candidate.subject, next.operation).kind).toBe('verified')
    },
  )
  it('carries two historical revisions of one Issue through complete RI and stable, with separate revalidation', async () => {
    const f = fixture()
    await start(f)
    const firstSource = commit(f.root, 'feature', 'one')
    const first = prepare(f.root, {
      kind: 'prepare',
      mode: 'work',
      sources: [{ kind: 'work', source: firstSource }],
    })
    if (first.kind !== 'candidate') throw new Error('conflict')
    const firstReceipt = verify(f.root, first.operation)
    expect(
      publish(f.root, first.operation, grant(f, first.candidate, firstReceipt.receiptDigest))
        .observation.kind,
    ).toBe('published')
    const nextRoot = join(f.home, 'second-task')
    git(f.root, ['worktree', 'add', '-b', 'human/task2', nextRoot, first.candidate.candidate])
    const nextBinding = {
      ...f.binding,
      revision: 2,
      attempt: 'two',
      branch: 'human/task2',
      taskBase: first.candidate.candidate,
      dispatch: 'https://github.com/owner/repo/issues/1#issuecomment-100',
    }
    f.update(nextBinding)
    f.authority(
      {
        ...common,
        basis: [...common.basis],
        action: 'dispatch',
        task: nextBinding,
        confirmations: [],
      },
      100,
    )
    await (
      await openIntegration({ root: nextRoot })
    ).execute({
      kind: 'start',
      issue: nextBinding.issue.url,
      revision: 2,
      attempt: 'two',
      authority: nextBinding.dispatch,
    })
    const nextSource = commit(nextRoot, 'feature', 'two')
    const second = prepare(nextRoot, {
      kind: 'prepare',
      mode: 'work',
      sources: [{ kind: 'work', source: nextSource }],
    })
    if (second.kind !== 'candidate') throw new Error('conflict')
    const secondReceipt = verify(nextRoot, second.operation)
    expect(
      publish(nextRoot, second.operation, grant(f, second.candidate, secondReceipt.receiptDigest))
        .observation.kind,
    ).toBe('published')
    const ri = prepare(f.root, {
      kind: 'prepare',
      mode: 'ri',
      sources: [{ kind: 'track', track: 'runtime', source: second.candidate.candidate }],
    })
    if (ri.kind !== 'candidate') throw new Error('conflict')
    expect(ri.candidate.tasks.map(task => task.binding.revision)).toEqual([1, 2])
    expect(ri.candidate.tasks.map(task => task.binding.taskBase)).toEqual([
      f.main,
      first.candidate.candidate,
    ])
    const verified = verify(f.root, ri.operation)
    expect(() =>
      publish(f.root, ri.operation, grant(f, ri.candidate, verified.receiptDigest)),
    ).toThrow('revalidation')
    const revalidations = ri.candidate.tasks
      .filter(task => task.binding.revision === 1)
      .map(task => ({
        historical: digest(canonical(task)),
        current: digest(
          canonical({ binding: nextBinding, state: 'open', updatedAt: '2026-10-11T00:00:00Z' }),
        ),
        evidence: 'historical revision remains applicable',
      }))
    expect(
      publish(
        f.root,
        ri.operation,
        grant(f, ri.candidate, verified.receiptDigest, [], revalidations),
      ).observation.kind,
    ).toBe('published')
    git(f.root, ['push', 'origin', `${f.initial}:refs/heads/stable`])
    const stable = prepare(f.root, {
      kind: 'prepare',
      mode: 'checkpoint',
      sources: [{ kind: 'main', source: ri.candidate.candidate }],
      checkpoint: 'two-revisions',
    })
    if (stable.kind !== 'candidate') throw new Error('conflict')
    expect(stable.candidate.expectedBase).toBe(f.initial)
    expect(stable.candidate.parents[0]).not.toBe(f.initial)
    expect(stable.candidate.tasks).toHaveLength(2)
    const receipt = verify(f.root, stable.operation)
    expect(
      publish(
        f.root,
        stable.operation,
        grant(f, stable.candidate, receipt.receiptDigest, [], revalidations),
      ).observation.kind,
    ).toBe('published')
    const before = git(f.remote, ['show-ref'])
    const repeated = prepare(f.root, {
      kind: 'prepare',
      mode: 'checkpoint',
      sources: [{ kind: 'main', source: ri.candidate.candidate }],
      checkpoint: 'two-revisions',
    })
    if (repeated.kind !== 'candidate') throw new Error('conflict')
    const checked = verify(f.root, repeated.operation)
    expect(
      publish(f.root, repeated.operation, grant(f, repeated.candidate, checked.receiptDigest))
        .observation.kind,
    ).toBe('published')
    expect(git(f.remote, ['show-ref'])).toBe(before)
    expect(() =>
      prepare(f.root, {
        kind: 'prepare',
        mode: 'checkpoint',
        sources: [{ kind: 'main', source: f.main }],
        checkpoint: 'two-revisions',
      }),
    ).toThrow()
  })
  it('rejects candidate checker weakening, dirty execution and clean HEAD changes', async () => {
    const f = fixture()
    await start(f)
    commit(f.root, 'check.mjs', 'process.exit(0)')
    const source = commit(f.root, 'bad', 'invalid')
    const p = prepare(f.root, {
      kind: 'prepare',
      mode: 'work',
      sources: [{ kind: 'work', source }],
    })
    if (p.kind !== 'candidate') throw new Error('conflict')
    expect(() => verify(f.root, p.operation)).toThrow('Required command check failed')
    git(f.root, ['rm', 'bad'])
    git(f.root, ['commit', '-m', 'Remove invalid fixture'])
    const dirty = commit(f.root, 'dirty-trigger', 'trigger')
    const q = prepare(f.root, {
      kind: 'prepare',
      mode: 'work',
      sources: [{ kind: 'work', source: dirty }],
    })
    if (q.kind !== 'candidate') throw new Error('conflict')
    expect(() => verify(f.root, q.operation)).toThrow('not clean')
    git(f.root, ['rm', 'dirty-trigger'])
    git(f.root, ['commit', '-m', 'Remove dirty trigger'])
    const moved = commit(f.root, 'head-trigger', 'trigger')
    const r = prepare(f.root, {
      kind: 'prepare',
      mode: 'work',
      sources: [{ kind: 'work', source: moved }],
    })
    if (r.kind !== 'candidate') throw new Error('conflict')
    expect(() => verify(f.root, r.operation)).toThrow('Candidate changed since it was sealed')
  })
})

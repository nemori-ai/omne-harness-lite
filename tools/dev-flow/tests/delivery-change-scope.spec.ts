// @module-tag slow
// Slow: every case builds a real temporary Git repository with a hand-written task context;
// the CLI cases also start a Node process.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { TaskBinding } from '../src/delivery/binding.ts'
import { changeScope } from '../src/delivery/change-scope.ts'
import { LINES_PATH } from '../src/delivery/lines.ts'
import { writeContext } from '../src/integration/context.ts'
import { git, repository } from '../src/integration/git.ts'
import { init } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
/** `tools-line` owns `tools`, `model` owns `model`, the integration track owns `apps`. */
const lines = {
  schemaVersion: 1,
  integration: { track: 'runtime', paths: ['apps'] },
  shared: ['pnpm-lock.yaml'],
  lines: [
    { id: 'tools-line', title: '工具', owner: 'a', track: null, paths: ['tools'], contracts: [] },
    { id: 'model', title: '模型', owner: 'b', track: null, paths: ['model'], contracts: [] },
  ],
}
function write(root: string, file: string, content: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), content)
}
function commitFiles(root: string, files: Record<string, string>, message = 'change'): string {
  for (const [file, content] of Object.entries(files)) write(root, file, content)
  git(root, ['add', '-A'])
  git(root, ['commit', '-m', message])
  return git(root, ['rev-parse', 'HEAD'])
}
/**
 * A repository whose `main` is the batch head the card starts from, with the line table and
 * one file in each owned path. The card branch `a/card` starts at `main`.
 */
function repo() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-change-scope-')))
  homes.push(home)
  const root = join(home, 'work')
  init(root)
  const initial = commitFiles(root, {
    '.gitignore': 'tmp/\n',
    [LINES_PATH]: JSON.stringify(lines),
    'tools/a.ts': 'a\n',
    'tools/b.ts': 'b\n',
    'model/m.ts': 'm\n',
    'apps/x.ts': 'x\n',
    'pnpm-lock.yaml': 'lock\n',
    'README.md': 'readme\n',
  })
  return { home, root, initial }
}
type Repo = ReturnType<typeof repo>
function binding(taskBase: string, patch: Partial<Record<string, unknown>> = {}): TaskBinding {
  return {
    schemaVersion: 2,
    issue: {
      repository: 'owner/repo',
      id: 'I_1',
      number: 1,
      url: 'https://github.com/owner/repo/issues/1',
    },
    revision: 1,
    attempt: 'one',
    responsible: 'a',
    branch: 'a/card',
    route: { kind: 'track', track: 'runtime' },
    completionTarget: 'stable',
    taskBase,
    writeScope: ['tools/a.ts', 'tmp/issue-1'],
    dispatch: 'https://github.com/owner/repo/issues/1#issuecomment-1',
    conditions: [],
    authorization: [],
    line: 'tools-line',
    nature: 'impl',
    contractChange: 'none',
    milestone: 'M1',
    ...patch,
  } as TaskBinding
}
/** Starts the card at the current HEAD with a context whose targetBase is `targetBase`. */
function bind(r: Repo, options: { targetBase?: string; binding?: Record<string, unknown> } = {}) {
  git(r.root, ['checkout', '-b', 'a/card'])
  const head = git(r.root, ['rev-parse', 'HEAD']),
    info = repository(r.root),
    task = binding(head, options.binding)
  writeContext(r.root, {
    schemaVersion: 1,
    root: info.root,
    gitDir: info.gitDir,
    branch: info.branch,
    targetBase: options.targetBase ?? head,
    tasks: [{ binding: task, taskSource: head }],
    ownerTask: task,
    operation: null,
  })
  return head
}
const codes = (r: Repo) => {
  const report = changeScope({ root: r.root })
  if (!report.bound) throw new Error('expected a bound tree')
  return report.findings.map(finding => [finding.code, finding.file])
}

describe('the changes of the card', () => {
  it('passes the card commits inside its write scope', () => {
    const r = repo()
    bind(r)
    commitFiles(r.root, { 'tools/a.ts': 'a2\n' })
    const report = changeScope({ root: r.root })
    expect(report).toMatchObject({ bound: true, files: ['tools/a.ts'], findings: [] })
  })

  it('refuses a card commit outside the write scope', () => {
    const r = repo()
    bind(r)
    commitFiles(r.root, { 'tools/a.ts': 'a2\n' })
    commitFiles(r.root, { 'tools/b.ts': 'b2\n' })
    expect(codes(r)).toEqual([['change-outside-scope', 'tools/b.ts']])
  })

  it('counts both paths of a rename and a deleted file', () => {
    const r = repo()
    bind(r, { binding: { writeScope: ['tools/a.ts', 'tools/c.ts'] } })
    git(r.root, ['mv', 'tools/b.ts', 'tools/c.ts'])
    git(r.root, ['commit', '-m', 'rename'])
    expect(codes(r)).toEqual([['change-outside-scope', 'tools/b.ts']])
  })

  it('does not count the files a sync merge of the target brings in', () => {
    const r = repo()
    const base = bind(r)
    commitFiles(r.root, { 'tools/a.ts': 'a2\n' })
    git(r.root, ['checkout', '-b', 'target', base])
    commitFiles(r.root, { 'apps/x.ts': 'x2\n', 'README.md': 'r2\n' }, 'target fix')
    git(r.root, ['checkout', 'a/card'])
    git(r.root, ['merge', '--no-ff', '--no-edit', 'target'])
    expect(codes(r)).toEqual([])
  })

  it('does not count the commits of another card that a merge of the batch brings in', () => {
    const r = repo()
    const base = bind(r)
    git(r.root, ['checkout', '-b', 'other-card', base])
    commitFiles(r.root, { 'tools/b.ts': 'other\n' }, 'other card 1')
    commitFiles(r.root, { 'model/m.ts': 'other\n' }, 'other card 2')
    git(r.root, ['checkout', 'a/card'])
    commitFiles(r.root, { 'tools/a.ts': 'a2\n' })
    git(r.root, ['merge', '--no-ff', '--no-edit', 'other-card'])
    expect(codes(r)).toEqual([])
  })

  it('refuses a conflict resolution outside the write scope', () => {
    const r = repo()
    const base = bind(r)
    git(r.root, ['checkout', '-b', 'other-card', base])
    commitFiles(r.root, { 'tools/b.ts': 'theirs\n' }, 'other card')
    git(r.root, ['checkout', 'a/card'])
    commitFiles(r.root, { 'tools/a.ts': 'a2\n' })
    // The resolution differs from both sides, so the merge itself changes tools/b.ts.
    git(r.root, ['merge', '--no-commit', 'other-card'])
    write(r.root, 'tools/b.ts', 'resolved\n')
    git(r.root, ['add', 'tools/b.ts'])
    git(r.root, ['commit', '--no-edit'])
    expect(codes(r)).toEqual([['change-outside-scope', 'tools/b.ts']])
  })

  it('takes taskBase, not an earlier targetBase, as the start of the card', () => {
    const r = repo()
    // The batch head carries another card after the remote target head.
    const target = commitFiles(r.root, { 'apps/x.ts': 'track\n' }, 'track head')
    commitFiles(r.root, { 'tools/b.ts': 'batch card\n', 'model/m.ts': 'batch\n' }, 'batch card')
    bind(r, { targetBase: target })
    commitFiles(r.root, { 'tools/a.ts': 'a2\n' })
    expect(codes(r)).toEqual([])
  })

  it('refuses uncommitted changes outside the write scope', () => {
    const r = repo()
    bind(r)
    write(r.root, 'tools/b.ts', 'edited\n')
    write(r.root, 'tools/new.ts', 'new\n')
    write(r.root, 'tools/a.ts', 'in scope\n')
    expect(codes(r)).toEqual([
      ['change-outside-scope', 'tools/b.ts'],
      ['change-outside-scope', 'tools/new.ts'],
    ])
  })

  it('does not count task tmp or shared paths', () => {
    const r = repo()
    bind(r)
    commitFiles(r.root, { 'pnpm-lock.yaml': 'lock2\n' })
    write(r.root, 'tmp/issue-1/notes.md', 'notes\n')
    write(r.root, 'tmp/elsewhere.md', 'ignored by Git\n')
    expect(codes(r)).toEqual([])
  })
})

describe('the line of the card', () => {
  it('refuses a change to another line or to the integration track, even inside the scope', () => {
    const r = repo()
    bind(r, { binding: { writeScope: ['tools', 'model/m.ts', 'apps/x.ts'] } })
    commitFiles(r.root, { 'tools/b.ts': 'b2\n', 'model/m.ts': 'm2\n', 'apps/x.ts': 'x2\n' })
    expect(codes(r)).toEqual([
      ['change-outside-line', 'apps/x.ts'],
      ['change-outside-line', 'model/m.ts'],
    ])
  })

  it('reports both codes for a file outside the scope and the line', () => {
    const r = repo()
    bind(r)
    commitFiles(r.root, { 'model/m.ts': 'm2\n' })
    expect(codes(r)).toEqual([
      ['change-outside-scope', 'model/m.ts'],
      ['change-outside-line', 'model/m.ts'],
    ])
  })

  it('does not check the line of an integration card', () => {
    const r = repo()
    bind(r, {
      binding: { line: 'integration', nature: 'integration', writeScope: ['model', 'apps'] },
    })
    commitFiles(r.root, { 'model/m.ts': 'm2\n', 'apps/x.ts': 'x2\n' })
    expect(codes(r)).toEqual([])
  })

  it('reads the line table of taskBase, not a later edit of it', () => {
    const r = repo()
    bind(r, { binding: { writeScope: ['tools', 'docs/engineering'] } })
    // The card moves `model` into its own line; ownership still comes from taskBase.
    write(
      r.root,
      LINES_PATH,
      JSON.stringify({
        ...lines,
        lines: [{ ...lines.lines[0], paths: ['tools', 'model'] }],
      }),
    )
    commitFiles(r.root, { 'model/m.ts': 'm2\n' })
    expect(codes(r)).toContainEqual(['change-outside-line', 'model/m.ts'])
  })
})

/** Runs the CLI as `scripts/check.sh` does. */
function cli(root: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      fileURLToPath(new URL('../src/delivery/change-scope-cli.ts', import.meta.url)),
      ...args,
    ],
    { cwd: root, encoding: 'utf8', env: process.env },
  )
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
describe('change-scope-cli', () => {
  it('reports an unbound tree and exits 0', () => {
    const r = repo()
    const result = cli(r.root)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ bound: false })
    expect(result.stderr).toContain('未绑定')
  })

  it('exits 0 for a bound tree without findings', () => {
    const r = repo()
    bind(r)
    commitFiles(r.root, { 'tools/a.ts': 'a2\n' })
    const result = cli(r.root)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      bound: true,
      issue: 'https://github.com/owner/repo/issues/1',
      findings: [],
    })
  })

  it('exits 1 and lists each file with its code and remedy', () => {
    const r = repo()
    bind(r)
    commitFiles(r.root, { 'tools/b.ts': 'b2\n', 'model/m.ts': 'm2\n' })
    const result = cli(r.root, '--root', r.root)
    expect(result.status).toBe(1)
    const report = JSON.parse(result.stdout)
    expect(report.findings).toEqual([
      expect.objectContaining({ code: 'change-outside-scope', file: 'model/m.ts' }),
      expect.objectContaining({ code: 'change-outside-line', file: 'model/m.ts' }),
      expect.objectContaining({ code: 'change-outside-scope', file: 'tools/b.ts' }),
    ])
    for (const finding of report.findings) {
      expect(finding.message).toContain(finding.file)
      expect(finding.remedy).not.toBe('')
    }
    expect(result.stderr).toContain('change-outside-scope tools/b.ts')
  })

  it('exits 2 when taskBase is not an ancestor of HEAD', () => {
    const r = repo()
    bind(r)
    commitFiles(r.root, { 'tools/a.ts': 'a2\n' })
    // Rewrite history so that taskBase is no longer reachable from HEAD.
    git(r.root, ['checkout', '--orphan', 'tmp-orphan'])
    git(r.root, ['commit', '-m', 'orphan'])
    git(r.root, ['branch', '-D', 'a/card'])
    git(r.root, ['branch', '-m', 'a/card'])
    const result = cli(r.root)
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr.trim().split('\n').at(-1) ?? '')).toMatchObject({
      code: 'refused',
    })
  })

  it('exits 2 on an unknown option', () => {
    const r = repo()
    const result = cli(r.root, '--bogus')
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
  })
})

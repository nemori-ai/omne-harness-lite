// Each case builds a spec text and checks it against a small throwaway git repository. The CLI
// cases start brief-check-cli.ts as a child process (about 0.2 s each), so the file stays in the
// fast tier.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkBrief, gitRepository, type BriefReport } from '../src/delegate/brief-check.ts'

const cli = fileURLToPath(new URL('../src/delegate/brief-check-cli.ts', import.meta.url))
const homes: string[] = []
afterAll(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))

const GIT_ENV = {
  PATH: process.env['PATH'] ?? '',
  SystemRoot: process.env['SystemRoot'] ?? '',
  GIT_AUTHOR_NAME: 'tester',
  GIT_AUTHOR_EMAIL: 'tester@example.com',
  GIT_COMMITTER_NAME: 'tester',
  GIT_COMMITTER_EMAIL: 'tester@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
}
function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', root, '-c', 'core.autocrlf=false', ...args], {
    encoding: 'utf8',
    env: GIT_ENV,
  })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}
function tempDirectory(): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'omne-brief-check-')))
  homes.push(path)
  return path
}
/** A repository with one commit holding `files`; returns its root and the commit. */
function repository(files: Record<string, string>): { root: string; base: string } {
  const root = tempDirectory()
  git(root, 'init', '-q')
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'base')
  return { root, base: git(root, 'rev-parse', 'HEAD') }
}

const BASE_FILES = {
  'package.json': '{"scripts":{"check":"true"}}\n',
  'src/a.ts':
    'export function makeThing(): number {\n  return 1\n}\nexport type Shape = { n: number }\n',
  'src/caller.ts': "import { makeThing } from '@demo/a'\nexport const value = makeThing()\n",
  'src/typeonly.ts': "import type { Shape } from './a.ts'\nexport type Alias = Shape\n",
  'src/other.ts': 'export const other = 1\n',
  'docs/note.md': 'note\n',
}
let fixture: { root: string; base: string }
let conventions: string
beforeAll(() => {
  fixture = repository(BASE_FILES)
  conventions = join(tempDirectory(), 'writer-conventions.md')
  writeFileSync(conventions, 'conventions\n')
})

const FIELDS = [
  '身份与位置',
  '模型与推理强度',
  '目标边界',
  '验收清单',
  '实施规格',
  '性质及证据义务',
  '施工计划',
  '自主范围与动作授权',
  '工作树与协调',
  '方法与知识入口',
  '当前认知',
  '返回与恢复',
  '已知会受影响的现有用例',
  '停止条件',
  '追加记录',
] as const
const BASELINE = 'a'.repeat(40)
interface SpecOptions {
  omit?: string
  base?: string
  clarity?: string
  worktree?: string
  scope?: string[]
  excluded?: string[]
  acceptance?: string[]
  stop?: string[]
  read?: string
  specification?: string[]
}
/** A spec that passes every check against the fixture repository, with the named parts replaced. */
function specText(options: SpecOptions = {}): string {
  const bodies: Record<string, string[]> = {
    身份与位置: [
      '- 闭包：W7-x',
      '- 卡与修订：#960 r1',
      `- 工作树：${options.worktree ?? '/work/tree'}`,
      '- 分支：PanQiWei/w7-x',
      `- 基线：${options.base ?? BASELINE}`,
      `- 清晰度：${options.clarity ?? '定'}`,
    ],
    目标边界: [
      '### 写范围',
      '',
      ...(options.scope ?? [
        '- `src/a.ts` — 被 caller.ts 调用',
        '- `src/caller.ts` — 调用 makeThing',
        '- `src/typeonly.ts` — 读 Shape',
        '- `src/new.ts`（新建） — 被 a.ts 导入',
      ]),
      '',
      '### 排除的调用方',
      '',
      ...(options.excluded ?? []),
    ],
    验收清单: options.acceptance ?? ['- `pnpm run check`，预期退出 0；变异：改 a.ts → 用例 1 变红'],
    实施规格: options.specification ?? ['改 `makeThing` 的返回值。'],
    方法与知识入口: [options.read ?? `- 先读：${conventions}`],
    停止条件: options.stop ?? ['- 需要改写范围外的文件时停下交回'],
  }
  const lines = ['# 闭包规格', '']
  for (const field of FIELDS) {
    if (field === options.omit) continue
    lines.push(`## ${field}`, '', ...(bodies[field] ?? ['不适用：测试用']), '')
  }
  return lines.join('\n')
}
function check(text: string, strict = false, repo = fixture): BriefReport {
  return checkBrief(text, gitRepository(repo.root, repo.base), { strict })
}
const items = (findings: readonly { item: number }[]) => findings.map(finding => finding.item)
const messages = (findings: readonly { message: string }[]) =>
  findings.map(finding => finding.message).join('\n')
function runCli(args: string[], cwd?: string) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'] ?? '',
      SystemRoot: process.env['SystemRoot'] ?? '',
      NO_COLOR: '1',
    },
    ...(cwd === undefined ? {} : { cwd }),
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
function specFile(text: string): string {
  const path = join(tempDirectory(), 'spec.md')
  writeFileSync(path, text)
  return path
}
function cliArgs(text: string, extra: string[] = []) {
  return ['--spec', specFile(text), '--base', fixture.base, '--root', fixture.root, ...extra]
}
const A_ONLY = ['- `src/a.ts` — 定义 makeThing']

describe('brief-check', () => {
  it('B1 reports nothing for a complete spec and the CLI exits 0', () => {
    expect(check(specText())).toEqual({ errors: [], warnings: [] })
    const result = runCli(cliArgs(specText()))
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('B2 reports a missing section as item 1', () => {
    const report = check(specText({ omit: '追加记录' }))
    expect(items(report.errors)).toEqual([1])
    expect(report.errors[0]?.message).toContain('追加记录')
  })

  it('reports a missing developer-task field as item 1', () => {
    expect(items(check(specText({ omit: '当前认知' })).errors)).toEqual([1])
  })

  it('B3 rejects a baseline that is not 40 hexadecimal digits', () => {
    const report = check(specText({ base: 'abc1234' }))
    expect(items(report.errors)).toEqual([1])
    expect(report.errors[0]?.message).toContain('基线')
    expect(report.errors[0]?.line).not.toBeNull()
  })

  it('rejects a clarity outside 定、界、探 and a relative worktree path as item 1', () => {
    expect(items(check(specText({ clarity: '清楚' })).errors)).toEqual([1])
    expect(items(check(specText({ worktree: 'relative/tree' })).errors)).toEqual([1])
    expect(check(specText({ worktree: 'D:\\dev\\tree' })).errors).toEqual([])
  })

  it('B4 rejects a descriptive write scope as item 2', () => {
    const report = check(specText({ scope: ['- 定义 `makeThing` 的文件及其测试 — 要改'] }))
    expect(items(report.errors)).toEqual([2])
    expect(report.errors[0]?.message).toContain('scope-line-descriptive')
  })

  it('rejects a write-scope line outside the fixed form or without a reason as item 2', () => {
    expect(items(check(specText({ scope: ['- src/a.ts — 路径没有反引号'] })).errors)).toEqual([2])
    const report = check(specText({ scope: ['- `src/a.ts`'] }))
    expect(items(report.errors)).toEqual([2])
    expect(report.errors[0]?.message).toContain('scope-line-reason')
  })

  it('B5 checks write-scope paths on the base, not in the working tree', () => {
    const repo = repository(BASE_FILES)
    writeFileSync(join(repo.root, 'src/later.ts'), 'export const later = 1\n')
    const scope = ['- `src/a.ts` — 改', '- `src/later.ts` — 只在工作区']
    const report = check(specText({ scope }), false, repo)
    expect(items(report.errors)).toEqual([3])
    expect(report.errors[0]?.message).toContain('src/later.ts')
    const marked = ['- `src/a.ts` — 改', '- `src/later.ts`（新建） — 新文件']
    expect(check(specText({ scope: marked }), false, repo).errors).toEqual([])
  })

  it('B6 warns about a caller outside the write scope, with file, line and symbol', () => {
    const report = check(specText({ scope: A_ONLY }))
    expect(report.errors).toEqual([])
    expect(items(report.warnings)).toContain(4)
    expect(messages(report.warnings)).toMatch(
      /caller-outside-scope: src\/caller\.ts:\d+ references makeThing \(defined in src\/a\.ts\)/,
    )
    const result = runCli(cliArgs(specText({ scope: A_ONLY })))
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('warning: caller-outside-scope: src/caller.ts:')
  })

  it('B7 warns about a module that imports the defining file with import type', () => {
    const report = check(specText({ scope: A_ONLY }))
    expect(messages(report.warnings)).toMatch(
      /caller-outside-scope: src\/typeonly\.ts:1 references makeThing/,
    )
  })

  it('does not follow an import of a different file that has the same name', () => {
    const repo = repository({
      ...BASE_FILES,
      'lib/a.ts': 'export const unrelated = 1\n',
      'lib/user.ts': "import { unrelated } from './a.ts'\nexport const u = unrelated\n",
    })
    const report = check(specText({ scope: A_ONLY }), false, repo)
    expect(messages(report.warnings)).not.toContain('lib/user.ts')
  })

  it('B8 does not report a caller listed under the excluded callers', () => {
    const report = check(
      specText({
        scope: A_ONLY,
        excluded: [
          '- `src/caller.ts` — 不改；停止条件：需要改它时停下交回',
          '- `src/typeonly.ts` — 不改；停止条件：需要改它时停下交回',
        ],
      }),
    )
    expect(report.warnings).toEqual([])
  })

  it('reports the defining file when it is outside the write scope', () => {
    const report = check(specText({ scope: ['- `src/caller.ts` — 调用 makeThing'] }))
    expect(messages(report.warnings)).toMatch(
      /caller-outside-scope: src\/a\.ts:\d+ references makeThing \(defined in src\/a\.ts\)/,
    )
  })

  it('finds a definition in a multi-line export list and ignores a re-export as definition', () => {
    const repo = repository({
      ...BASE_FILES,
      'src/list.ts': 'const hidden = 1\nexport {\n  hidden,\n}\n',
      'src/index.ts': "export { hidden } from './list.ts'\n",
    })
    const report = check(
      specText({ scope: ['- `src/list.ts` — 定义 hidden'], specification: ['看 `hidden`。'] }),
      false,
      repo,
    )
    expect(messages(report.warnings)).toContain(
      'src/index.ts:1 references hidden (defined in src/list.ts)',
    )
    expect(messages(report.warnings)).not.toContain('defined in src/index.ts')
  })

  it('B9 turns the caller warning into an error with --strict and exits 1', () => {
    const text = specText({ scope: A_ONLY })
    const report = check(text, true)
    expect(report.warnings).toEqual([])
    expect(items(report.errors)).toContain(4)
    const result = runCli(cliArgs(text, ['--strict']))
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('error: caller-outside-scope:')
  })

  it('B10 reports a pnpm script that no package.json defines as item 5', () => {
    const report = check(specText({ acceptance: ['- `pnpm run no-such-script`，预期退出 0'] }))
    expect(items(report.errors)).toEqual([5])
    expect(report.errors[0]?.message).toContain('no-such-script')
  })

  it('finds a script in the package.json of the member that holds the write scope', () => {
    const repo = repository({
      ...BASE_FILES,
      'tools/m/package.json': '{"scripts":{"typecheck":"tsc"}}\n',
      'tools/m/src/x.ts': 'export const x = 1\n',
    })
    const acceptance = ['- `pnpm run typecheck`，预期退出 0']
    const inMember = specText({ acceptance, scope: ['- `tools/m/src/x.ts` — 改'] })
    expect(check(inMember, false, repo).errors).toEqual([])
    expect(items(check(specText({ acceptance }), false, repo).errors)).toEqual([5])
  })

  it('reports an acceptance path that is neither on the base nor a new write-scope file', () => {
    const missing = ['- `pnpm run check`；读 `docs/missing.md` 与 `docs/note.md`']
    const report = check(specText({ acceptance: missing }))
    expect(items(report.errors)).toEqual([5])
    expect(report.errors[0]?.message).toContain('docs/missing.md')
    const created = ['- `pnpm run check`；读 `src/new.ts` 与 `tmp/log/out.txt`']
    expect(check(specText({ acceptance: created })).errors).toEqual([])
  })

  describe('acceptance paths relative to a member directory', () => {
    const memberRepo = () =>
      repository({
        ...BASE_FILES,
        'tools/m/package.json': '{"scripts":{"typecheck":"tsc"}}\n',
        'tools/m/src/x.ts': 'export const x = 1\n',
        'tools/m/tests/x.spec.ts': 'export {}\n',
      })
    const command = '`pnpm exec vitest run tests/x.spec.ts`'

    it('B15 resolves a path against the cd directory on the same line', () => {
      const repo = memberRepo()
      const withCd = specText({ acceptance: [`- \`cd tools/m\` 后运行 ${command}`] })
      expect(check(withCd, false, repo).errors).toEqual([])
      const withoutCd = specText({ acceptance: [`- 运行 ${command}`] })
      expect(items(check(withoutCd, false, repo).errors)).toEqual([5])
    })

    it('B16 resolves a path against the member directory of the write scope', () => {
      const repo = memberRepo()
      const acceptance = [`- 在成员目录运行 ${command}`]
      const inMember = specText({ acceptance, scope: ['- `tools/m/src/x.ts` — 改'] })
      expect(check(inMember, false, repo).errors).toEqual([])
    })

    it('B17 still reports a relative path that no directory holds', () => {
      const repo = memberRepo()
      const acceptance = ['- `cd tools/m` 后运行 `pnpm exec vitest run tests/none.spec.ts`']
      const report = check(
        specText({ acceptance, scope: ['- `tools/m/src/x.ts` — 改'] }),
        false,
        repo,
      )
      expect(items(report.errors)).toEqual([5])
      expect(report.errors[0]?.message).toContain('tests/none.spec.ts')
    })
  })

  it('B11 rejects an empty stop-conditions section as item 6', () => {
    expect(items(check(specText({ stop: ['', '<!-- 待补 -->'] })).errors)).toEqual([6])
  })

  it('B12 reports a read-first line that points at a missing file as item 8', () => {
    const report = check(specText({ read: '- 先读：/no/such/writer-conventions.md' }))
    expect(items(report.errors)).toEqual([8])
    expect(items(check(specText({ read: '- 不是先读行' })).errors)).toEqual([8])
  })

  it('B13 exits 2 when --base is not a commit', () => {
    const args = ['--spec', specFile(specText()), '--base', 'no-such-ref', '--root', fixture.root]
    const result = runCli(args)
    expect(result.status).toBe(2)
    expect(result.stderr).not.toBe('')
  })

  it('exits 2 for a missing option or an unreadable spec file', () => {
    expect(runCli(['--spec', specFile(specText())]).status).toBe(2)
    const missing = join(tempDirectory(), 'none.md')
    expect(runCli(['--spec', missing, '--base', fixture.base, '--root', fixture.root]).status).toBe(
      2,
    )
  })

  it('uses the git root of the current directory when --root is absent', () => {
    const args = ['--spec', specFile(specText()), '--base', fixture.base]
    expect(runCli(args, join(fixture.root, 'src')).status).toBe(0)
  })

  it('B14 prints parseable JSON with item, message and line on every finding', () => {
    const text = specText({ base: 'abc1234', scope: A_ONLY })
    const result = runCli(cliArgs(text, ['--json']))
    expect(result.status).toBe(1)
    const parsed = JSON.parse(result.stdout) as BriefReport
    expect(Object.keys(parsed).sort()).toEqual(['errors', 'warnings'])
    expect(parsed.errors.length).toBeGreaterThan(0)
    expect(parsed.warnings.length).toBeGreaterThan(0)
    for (const finding of [...parsed.errors, ...parsed.warnings]) {
      expect(typeof finding.item).toBe('number')
      expect(typeof finding.message).toBe('string')
      expect(finding.line === null || typeof finding.line === 'number').toBe(true)
    }
  })
})

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const made: string[] = []
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
})

const cli = fileURLToPath(new URL('../src/retire/cli.ts', import.meta.url))
const run = (...args: string[]) =>
  spawnSync(process.execPath, ['--conditions=source', '--experimental-strip-types', cli, ...args], {
    encoding: 'utf8',
  })
const temporary = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'retire-cli-')))
  made.push(root)
  return root
}
const git = (root: string, ...args: string[]) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
function repository(files: Record<string, string>): string {
  const root = temporary()
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  git(root, 'init', '-q')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'fixture')
  return root
}
const FILES = {
  'packages/alpha/package.json': JSON.stringify({
    name: '@fx/alpha',
    exports: { './testing': { source: './src/testing/index.ts' } },
  }),
  'packages/alpha/src/testing/index.ts': 'export function createDoubleOne() {}\n',
  'packages/alpha/tests/use.spec.ts': 'createDoubleOne()\n',
}
const row = (over: Record<string, unknown> = {}) => ({
  id: 'FX-01',
  category: 'B',
  exports: ['createDoubleOne'],
  exists: true,
  retireWave: 'A',
  dueBy: 'B',
  ownerKind: 'reduce',
  note: '',
  ...over,
})
const tableFile = (items: unknown[] = [row()]) => {
  const path = join(temporary(), 'table.json')
  writeFileSync(
    path,
    JSON.stringify({
      source: { file: 'retire.json', sha256: 'a'.repeat(64), ref: 'b'.repeat(40) },
      refreshedAt: 'c'.repeat(40),
      items,
    }),
  )
  return path
}

describe('参数与退出码', () => {
  it('没有问题：退出 0，明确写未发现问题', () => {
    const result = run('--wave', 'A', '--root', repository(FILES), '--table', tableFile())
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('未发现问题')
  })

  it('应删未删：退出 1，输出 id、导出名、定义文件与行号', () => {
    const result = run('--wave', 'B', '--root', repository(FILES), '--table', tableFile())
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain('FX-01')
    expect(result.stdout).toContain('createDoubleOne')
    expect(result.stdout).toContain('packages/alpha/src/testing/index.ts:1')
    expect(result.stdout).not.toContain('未发现问题')
  })

  it('表过期：退出 2，不输出未发现问题', () => {
    const table = tableFile([row({ exports: ['renamedAway'] })])
    const result = run('--wave', 'A', '--root', repository(FILES), '--table', table)
    expect(result.status).toBe(2)
    expect(result.stdout + result.stderr).toContain('表过期')
    expect(result.stdout).not.toContain('未发现问题')
  })

  it('未映射：缺省只列出，退出 0；--strict 退出 1', () => {
    const table = tableFile([row({ exports: [] })])
    const root = repository(FILES)
    const lenient = run('--wave', 'A', '--root', root, '--table', table)
    expect(lenient.status, lenient.stderr).toBe(0)
    expect(lenient.stdout).toContain('未映射')
    expect(lenient.stdout).not.toContain('未发现问题')
    const strict = run('--wave', 'A', '--root', root, '--table', table, '--strict')
    expect(strict.status, strict.stderr).toBe(1)
    expect(strict.stdout).toContain('未映射')
  })

  const badTables: [string, () => string][] = [
    ['表文件缺失', () => join(temporary(), 'absent.json')],
    [
      'JSON 非法',
      () => {
        const path = join(temporary(), 'bad.json')
        writeFileSync(path, '{oops')
        return path
      },
    ],
    [
      '字段缺失',
      () => {
        const path = join(temporary(), 'missing.json')
        writeFileSync(
          path,
          JSON.stringify({
            source: { file: 'r', sha256: 'a'.repeat(64), ref: 'b'.repeat(40) },
            refreshedAt: 'c'.repeat(40),
            items: [{ id: 'X' }],
          }),
        )
        return path
      },
    ],
    ['dueBy 非法', () => tableFile([row({ dueBy: 'Q' })])],
  ]
  it.each(badTables)('坏表（%s）：退出 2 并说明，不输出未发现问题', (_name, make) => {
    const result = run('--wave', 'A', '--root', repository(FILES), '--table', make())
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/退役表/u)
    expect(result.stdout + result.stderr).not.toContain('未发现问题')
  })

  const usage: [string, string[]][] = [
    ['缺 --wave', []],
    ['波次非法', ['--wave', 'F']],
    ['认不出的参数', ['--wave', 'A', '--bogus']],
    ['--root 缺值', ['--wave', 'A', '--root']],
  ]
  it.each(usage)('参数错误（%s）：退出 2 并给出用法', (_name, args) => {
    const result = run(...args)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('用法')
  })

  it('--root 不是 git 检出：退出 2，不输出未发现问题', () => {
    const result = run('--wave', 'A', '--root', temporary(), '--table', tableFile())
    expect(result.status).toBe(2)
    expect(result.stdout + result.stderr).not.toContain('未发现问题')
  })
})

describe('--json 输出', () => {
  it('顶层字段与发现的字段稳定', () => {
    const root = repository(FILES)
    const result = run('--wave', 'B', '--root', root, '--table', tableFile(), '--json')
    expect(result.status, result.stderr).toBe(1)
    const parsed = JSON.parse(result.stdout)
    expect(Object.keys(parsed).sort()).toEqual(
      ['findings', 'inventory', 'ref', 'stale', 'unmapped', 'wave'].sort(),
    )
    expect(parsed.wave).toBe('B')
    expect(parsed.ref).toBe(git(root, 'rev-parse', 'HEAD'))
    expect(parsed.findings).toEqual([
      expect.objectContaining({
        kind: 'overdue',
        id: 'FX-01',
        path: 'packages/alpha/src/testing/index.ts',
        line: 1,
      }),
      expect.objectContaining({
        kind: 'retired-referenced',
        id: 'FX-01',
        path: 'packages/alpha/tests/use.spec.ts',
        line: 1,
      }),
    ])
    expect(parsed.inventory[0]).toEqual({
      member: 'packages/alpha',
      entry: 'packages/alpha/src/testing/index.ts',
      exports: [
        { name: 'createDoubleOne', inTable: true, ids: ['FX-01'], testFiles: 1, productFiles: 0 },
      ],
    })
    expect(parsed.unmapped).toEqual([])
    expect(parsed.stale).toEqual([])
  })

  it('坏表时 --json 也不输出结果对象，退出 2', () => {
    const result = run(
      '--wave',
      'A',
      '--root',
      repository(FILES),
      '--table',
      'Z:/absent.json',
      '--json',
    )
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
  })
})

describe('只读', () => {
  const snapshot = (root: string) =>
    [
      git(root, 'rev-parse', 'HEAD'),
      git(root, 'status', '--porcelain', '--untracked-files=all'),
      git(root, 'ls-files', '-s'),
      JSON.stringify(readdirSync(root, { recursive: true }).sort()),
    ].join('\n')

  it('运行前后工作树状态相同，也不删除未提交的文件', () => {
    const root = repository(FILES)
    writeFileSync(join(root, 'packages/alpha/tests/untracked.spec.ts'), 'createDoubleOne()\n')
    writeFileSync(join(root, 'packages/alpha/tests/use.spec.ts'), 'createDoubleOne()\n// edited\n')
    const before = snapshot(root)
    const table = tableFile()
    for (const wave of ['A', 'B']) {
      run('--wave', wave, '--root', root, '--table', table, '--strict')
      run('--wave', wave, '--root', root, '--table', table, '--json')
    }
    expect(snapshot(root)).toBe(before)
    // 每次运行起一个 node 与若干 git 进程；整套测试并发时留足时间。
  }, 60_000)
})

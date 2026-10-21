// @module-tag slow
// 归慢层：子进程：在临时 git 仓库里起回路入口 CLI 子进程（严格模式）。
// 严格模式（pnpm run check 用的那一档）：另判「开着的传感器都有数据」，要求基线与产物目录，回路目录一个字节都不动。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readLoopConfig } from '../src/loop/config.ts'
import { runLoopStatus } from '../src/loop/run.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const cli = fileURLToPath(new URL('../src/loop/cli.ts', import.meta.url))
const run = (root: string, home: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--experimental-strip-types', cli, '--root', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, OMNE_METRICS_HOME: home },
  })

/**
 * 每个传感器都能有数据的仓库：两个不同组的成员一起提交过、成员里有带断言的测试、有一个产品 topic。
 * 返回基线（成员都在的那个提交）。
 */
function complete(): { root: string; home: string; out: string; base: string } {
  const root = repository()
  write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*/*'\n  - 'apps/*'\n")
  write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
  write(root, 'packages/infra/b/src/index.ts', 'export const b = 2\n')
  write(root, 'packages/core/a/tests/a.spec.ts', "it('断言', () => { expect(1).toBe(1) })\n")
  write(
    root,
    '.meta_harness/design/product/x/README.md',
    '---\nid: PD-x\nstatus: draft\nrevision: 1\n---\n',
  )
  write(root, '.meta_harness/design/product/x/design.md', '# Product fixture\n')
  write(root, 'packages/core/a/package.json', '{"name":"@omne-harness/a"}\n')
  write(
    root,
    'docs/architecture/constraints.json',
    '{"schemaVersion": 1, "domains": [], "roles": [], "rules": []}',
  )
  const base = commit(root, 'members')
  return {
    root,
    base,
    home: temporaryDirectory('loop-home-'),
    out: join(temporaryDirectory('loop-out-'), 'status'),
  }
}

const tangled = Array.from(
  { length: 8 },
  (_, n) =>
    `export function tangled${n}(x: number) {\n${Array.from({ length: 14 }, (__, i) => `  if (x === ${i}) return ${i}`).join('\n')}\n  return -1\n}\n`,
).join('\n')

function skeleton() {
  const fixture = complete()
  git(
    fixture.root,
    'rm',
    '-q',
    'packages/core/a/src/index.ts',
    'packages/infra/b/src/index.ts',
    'packages/core/a/tests/a.spec.ts',
  )
  return { ...fixture, base: commit(fixture.root, 'product skeleton') }
}

// 每条用例都起 git 与 node 子进程；全量检查满载时单条会超过默认的 5 秒。
describe('严格模式', { timeout: 60_000 }, () => {
  it.each(['symlink', 'gitlink'])(
    'refuses engineering exemption after deleting a historical root %s',
    kind => {
      const { root, home, out } = skeleton()
      if (kind === 'symlink') {
        write(root, 'off-root/demo/src/index.ts', 'export const value = 1')
        symlinkSync('off-root', join(root, 'apps'))
        commit(root, 'root symlink')
      } else {
        git(
          root,
          'update-index',
          '--add',
          '--cacheinfo',
          '160000',
          git(root, 'rev-parse', 'HEAD'),
          'apps',
        )
        git(root, 'commit', '-qm', 'root gitlink')
      }
      const base = git(root, 'rev-parse', 'HEAD')
      git(root, 'rm', '-f', 'apps')
      commit(root, 'remove root')
      const result = run(
        root,
        home,
        '--strict',
        '--scope',
        'engineering',
        '--base',
        base,
        '--out',
        out,
      )
      expect(result.status).not.toBe(0)
      expect(result.stdout + result.stderr).toContain('Cannot classify product inputs')
      expect(run(root, home, '--strict', '--base', base, '--out', out).status).not.toBe(0)
    },
  )
  it('engineering keeps direction, cycle and acceptance-lock hard failures', () => {
    const { root, home, out, base } = complete()
    // common 依赖领域成员是方向违规；两边互相导入成环。
    write(
      root,
      'packages/common/s/src/index.ts',
      "import { b } from '../../../infra/b/src/index.ts'\nexport const s = b\n",
    )
    write(
      root,
      'packages/infra/b/src/index.ts',
      "import { s } from '../../../common/s/src/index.ts'\nexport const b = s\n",
    )
    write(root, 'apps/demo/acceptance/locked.ts', 'export const changed = true')
    const result = run(
      root,
      home,
      '--strict',
      '--scope',
      'engineering',
      '--base',
      base,
      '--out',
      out,
    )
    expect(result.status, result.stdout + result.stderr).toBe(1)
    const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'))
    expect(status.hardLines.direction.length).toBeGreaterThan(0)
    expect(status.hardLines.cycles.length).toBeGreaterThan(0)
    expect(status.hardLines.acceptanceLock.violations.length).toBeGreaterThan(0)
  })

  it.each(['source', 'test'])('engineering refuses partial current input: %s', kind => {
    const { root, home, out, base } = skeleton()
    write(
      root,
      kind === 'source' ? 'packages/core/a/src/new.ts' : 'packages/core/a/tests/new.spec.ts',
      'export const value = 1',
    )
    const result = run(
      root,
      home,
      '--strict',
      '--scope',
      'engineering',
      '--base',
      base,
      '--out',
      out,
    )
    expect(result.status, result.stdout + result.stderr).toBe(1)
    const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'))
    expect(status.hardLines.sensors.notApplicable).toEqual([])
    expect(status.hardLines.sensors.silent).toEqual([
      expect.objectContaining({ sensor: kind === 'source' ? 'assertions' : 'duplication' }),
    ])
  })

  it.each(['delete', 'archive'])(
    'engineering refuses to exempt the last baseline input after %s',
    change => {
      const { root, home, out, base } = complete()
      if (change === 'delete') git(root, 'rm', '-rq', 'packages')
      else git(root, 'mv', 'packages', 'packages.0.0.1.legacy')
      const result = run(
        root,
        home,
        '--strict',
        '--scope',
        'engineering',
        '--base',
        base,
        '--out',
        out,
      )
      expect(result.status, result.stdout + result.stderr).toBe(1)
      expect(
        JSON.parse(readFileSync(join(out, 'status.json'), 'utf8')).hardLines.sensors,
      ).toMatchObject({
        notApplicable: [],
        silent: [{ sensor: 'duplication' }, { sensor: 'assertions' }],
      })
    },
  )

  it('checks explicit target input even when the merge base is an empty skeleton', () => {
    const { root, home, out, base } = skeleton()
    git(root, 'checkout', '-qb', 'target')
    write(root, 'packages/core/a/src/target.ts', 'export const target = 1')
    const target = commit(root, 'target input')
    git(root, 'checkout', '-qb', 'work', base)
    write(root, 'README.md', 'work')
    commit(root, 'work')
    const result = run(
      root,
      home,
      '--strict',
      '--scope',
      'engineering',
      '--base',
      target,
      '--out',
      out,
    )
    expect(result.status, result.stdout + result.stderr).toBe(1)
    expect(
      JSON.parse(readFileSync(join(out, 'status.json'), 'utf8')).scope.evidence.baselines,
    ).toEqual([
      { commit: target, inputs: { sources: 1, tests: 0 } },
      { commit: base, inputs: { sources: 0, tests: 0 } },
    ])
  })

  it('preserves normal product readings and every other enabled sensor failure', () => {
    const { root, home, out, base } = complete()
    const passed = run(
      root,
      home,
      '--strict',
      '--scope',
      'engineering',
      '--base',
      base,
      '--out',
      out,
    )
    expect(passed.status, passed.stderr).toBe(0)
    expect(JSON.parse(readFileSync(join(out, 'status.json'), 'utf8')).sensors).toMatchObject({
      duplication: { status: 'data' },
      assertions: { status: 'data' },
    })
    const empty = skeleton()
    rmSync(join(empty.root, 'docs/architecture/constraints.json'))
    const failed = run(
      empty.root,
      empty.home,
      '--strict',
      '--scope',
      'engineering',
      '--base',
      empty.base,
      '--out',
      empty.out,
    )
    expect(failed.status, failed.stderr).toBe(1)
    expect(
      JSON.parse(readFileSync(join(empty.out, 'status.json'), 'utf8')).hardLines.sensors,
    ).toMatchObject({
      silent: [{ sensor: 'architecture' }],
      notApplicable: [{ sensor: 'duplication' }, { sensor: 'assertions' }],
    })
  })

  it('rejects unknown scope, missing strict prerequisites and invalid base without writing output', () => {
    const { root, home, out, base } = skeleton()
    for (const args of [
      ['--scope', 'unknown', '--strict', '--base', base, '--out', out],
      ['--scope', 'engineering', '--base', base, '--out', out],
      ['--scope', 'engineering', '--strict', '--out', out],
      ['--scope', 'engineering', '--strict', '--base', base],
      ['--scope', 'engineering', '--strict', '--base', base, '--out', out, '--snapshot'],
      ['--scope', 'engineering', '--strict', '--base', 'missing', '--out', out],
    ]) {
      const result = run(root, home, ...args)
      expect(result.status, result.stdout + result.stderr).toBe(2)
      expect(existsSync(out)).toBe(false)
    }
    expect(readdirSync(home)).toEqual([])
  })

  it('engineering scope preserves raw no-data and only exempts a proven empty product skeleton', () => {
    const { root, home, out } = complete()
    git(
      root,
      'rm',
      '-q',
      'packages/core/a/src/index.ts',
      'packages/infra/b/src/index.ts',
      'packages/core/a/tests/a.spec.ts',
    )
    const base = commit(root, 'product skeleton')
    const strict = run(root, home, '--strict', '--base', base, '--out', out)
    expect(strict.status).toBe(1)
    const engineering = run(
      root,
      home,
      '--strict',
      '--scope',
      'engineering',
      '--base',
      base,
      '--out',
      out,
    )
    expect(engineering.status, engineering.stdout + engineering.stderr).toBe(0)
    const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'))
    expect(status).toMatchObject({
      scope: {
        kind: 'engineering',
        evidence: {
          current: { sources: 0, tests: 0 },
          baselines: [{ commit: base, inputs: { sources: 0, tests: 0 } }],
        },
      },
      hardLines: {
        sensors: {
          silent: [],
          off: [],
          notApplicable: [
            { sensor: 'duplication', reason: 'engineering-without-product-inputs' },
            { sensor: 'assertions', reason: 'engineering-without-product-inputs' },
          ],
        },
      },
      sensors: { duplication: { status: 'no-data' }, assertions: { status: 'no-data' } },
    })
    expect(engineering.stdout).toContain('工程范围不适用')
    expect(readFileSync(join(out, 'status.md'), 'utf8')).toContain('工程范围不适用')
    expect(readdirSync(home)).toEqual([])
  })

  it('全有数据、硬线没破：退出 0；超预算的草稿写进产物目录，回路目录里什么都不写', () => {
    const { root, home, out, base } = complete()
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    const result = run(root, home, '--strict', '--base', base, '--out', out)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('  传感器有数据 是\n')
    expect(result.stdout).toContain('严格模式只读趋势，不写快照')
    expect(existsSync(join(out, 'status.json'))).toBe(true)
    expect(existsSync(join(out, 'proposals', 'packages-core-a.md'))).toBe(true)
    expect(readdirSync(home)).toEqual([])
  })

  it('一个开着的传感器没数据：退出 1，硬线一段点名它和原因', () => {
    const { root, home, out, base } = complete()
    git(root, 'rm', '-q', 'packages/core/a/tests/a.spec.ts')
    const result = run(root, home, '--strict', '--base', base, '--out', out)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain(
      '  ✗ 传感器没数据 1 个：sensors.assertions（成员里没有测试文件）',
    )
    expect(result.stdout).toContain('  依赖违规 0')
  })

  it('有成员有验收、这个提交却没有验收的耗时记录：验收耗时没数据，退出 1', () => {
    const { root, home, out, base } = complete()
    write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*/*'\n  - 'apps/*'\n")
    write(
      root,
      'apps/cli/package.json',
      '{"name":"@x/cli","scripts":{"acceptance":"vitest run --config acceptance/vitest.config.ts"}}\n',
    )
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, '--root', root, '--strict', '--base', base, '--out', out],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          OMNE_METRICS_HOME: home,
          OMNE_ACCEPTANCE_LEDGER_HOME: temporaryDirectory('loop-ledgers-'),
        },
      },
    )
    expect(result.status).toBe(1)
    expect(result.stdout).toMatch(
      /✗ 传感器没数据 1 个：sensors\.acceptance（有 1 个成员有验收，这个提交（\w{9}，工作树不干净）却没有跑全它们的耗时记录/u,
    )
    expect(result.stdout).toContain('  验收总耗时（秒） · 没数据：')
  })

  it('没有成员有验收：验收耗时读数是 0 份，算有数据', () => {
    const { root, home, out, base } = complete()
    const result = run(root, home, '--strict', '--base', base, '--out', out)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      '  验收总耗时（秒） 0 · 正常 · 不与基线比；0 份：没有成员有 acceptance 脚本',
    )
  })

  it('当前全局预期删除：architecture 点名 no-data，严格模式失败；差分独立可见', () => {
    const { root, home, out, base } = complete()
    rmSync(join(root, 'docs/architecture/constraints.json'))
    const result = run(root, home, '--strict', '--base', base, '--out', out)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('sensors.architecture（全局架构预期不可用：')
    const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'))
    expect(status).toMatchObject({
      hardLines: { sensors: { status: 'judged', silent: [{ sensor: 'architecture' }] } },
      sensors: {
        architecture: { status: 'no-data' },
        architectureChanges: { status: 'data', data: [{ id: 'global-architecture', after: null }] },
      },
      indicators: expect.arrayContaining([
        expect.objectContaining({
          id: 'architectureChanges',
          reading: { status: 'data', data: 1 },
        }),
      ]),
      explain: {
        conformance: {
          status: 'data',
          data: { changes: [{ id: 'global-architecture', after: null }] },
        },
      },
    })
  })
  it('有效全局预期无装配事实：真实空结果，不依赖已删除的手写声明', () => {
    const { root, home, out, base } = complete()
    const result = run(root, home, '--strict', '--base', base, '--out', out)
    expect(result.status).toBe(0)
    const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'))
    expect(status.sensors.architecture).toMatchObject({
      status: 'data',
      data: { facts: [], delta: { status: 'data', data: { added: [], removed: [], changed: [] } } },
    })
    expect(readdirSync(home)).toEqual([])
  })

  it('不是严格模式时这一条不判：同样没数据也退出 0', () => {
    const { root, home, out, base } = complete()
    git(root, 'rm', '-q', 'packages/core/a/tests/a.spec.ts')
    const result = run(root, home, '--base', base, '--out', out)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('  传感器有数据 未判：只在严格模式（STRICT=1）下判')
  })

  it('配置里关掉的传感器不算，照旧写明是关掉的', async () => {
    const { root, home, out, base } = complete()
    rmSync(join(root, 'packages/core/a/tests'), { recursive: true })
    const config = readLoopConfig()
    const result = await runLoopStatus(
      { root, base, out, strict: true, snapshot: false },
      { OMNE_METRICS_HOME: home },
      {
        ...config,
        sensors: {
          ...config.sensors,
          assertions: { ...config.sensors.assertions, enabled: false },
        },
      },
    )
    expect(result.code).toBe(0)
    expect(result.lines).toContain('  传感器有数据 是；配置里关了、不算：sensors.assertions')
  })

  it('没给基线、没给产物目录、要写快照：都是用法错，退出 2，什么都不写', () => {
    const { root, home, out, base } = complete()
    const noBase = run(root, home, '--strict', '--out', out)
    expect(noBase.status).toBe(2)
    expect(noBase.stderr).toContain('严格模式要给基线')
    const noOut = run(root, home, '--strict', '--base', base)
    expect(noOut.status).toBe(2)
    expect(noOut.stderr).toContain('严格模式要给产物目录')
    const snapshot = run(root, home, '--strict', '--base', base, '--out', out, '--snapshot')
    expect(snapshot.status).toBe(2)
    expect(existsSync(out)).toBe(false)
    expect(readdirSync(home)).toEqual([])
  })
})

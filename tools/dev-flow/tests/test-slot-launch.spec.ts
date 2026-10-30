// 运行名额脚本怎样起命令。dev-flow 的预准入构建一步、本成员测试文档里的用法都经
// `node scripts/with-test-slot.mjs pnpm …` 起 pnpm，还会交给它 `.sh` 脚本。Windows 上 Node 不经 shell
// 起不了 `pnpm`（PATH 里是 pnpm.cmd）和 `.sh`，脚本要换起法；POSIX 上原样起。
// 用例在哪个平台上跑，就核对那个平台的起法：PATH 前面放替身 pnpm，记下自己被怎样起、收到哪些参数。
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../../../scripts/with-test-slot.mjs', import.meta.url))
const WINDOWS = process.platform === 'win32'

/** 替身 pnpm：把自己的路径、起它的 Node 与参数写成一行 JSON，以 3 退出。 */
const FAKE_PNPM = `console.log(JSON.stringify({ entry: __filename, node: process.execPath, args: process.argv.slice(2) }))
process.exit(3)
`

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function home(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-slot-launch-')))
  roots.push(root)
  return root
}

/**
 * 一个放替身 pnpm 的 PATH 目录。Windows 上是 npm 全局安装的布局：`pnpm.cmd` 与
 * `node_modules/pnpm/bin/pnpm.cjs`，`withEntry` 为 false 时只有 `pnpm.cmd`。POSIX 上是可执行的 `pnpm`。
 * 返回目录与替身入口文件。
 */
function fakePnpm(root: string, name: string, withEntry = true): { dir: string; entry: string } {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  if (!WINDOWS) {
    const entry = join(dir, 'pnpm')
    writeFileSync(entry, `#!/usr/bin/env node\n${FAKE_PNPM}`)
    chmodSync(entry, 0o755)
    return { dir, entry }
  }
  writeFileSync(join(dir, 'pnpm.cmd'), '@exit /b 99\r\n')
  const entry = join(dir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  if (withEntry) {
    mkdirSync(join(entry, '..'), { recursive: true })
    writeFileSync(entry, FAKE_PNPM)
  }
  return { dir, entry }
}

/** 本进程的环境去掉名额标记与各种大小写的 PATH，再把 `dirs` 放在原 PATH 前面。 */
function environment(
  dirs: readonly string[],
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  let path = ''
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() === 'path') path = value ?? ''
    else if (key !== 'OMNE_TEST_SLOT_HELD') env[key] = value
  }
  return { ...env, PATH: [...dirs, path].join(delimiter), ...extra }
}

/** 经名额脚本起 `command`。`held` 时走已持有名额的放行路径，否则在临时锁目录里真的取一个名额。 */
function slot(root: string, command: readonly string[], dirs: readonly string[], held = true) {
  const extra: Record<string, string> = held
    ? { OMNE_TEST_SLOT_HELD: join(root, 'held.lock') }
    : {
        OMNE_TEST_SLOT_DIR: join(root, 'slots'),
        OMNE_TEST_SLOT_LEDGER: join(root, 'ledger.jsonl'),
      }
  return spawnSync(process.execPath, [SCRIPT, ...command], {
    cwd: root,
    env: environment(dirs, extra),
    encoding: 'utf8',
  })
}

describe('with-test-slot 起命令', () => {
  it('pnpm：起 PATH 上的那个 pnpm，参数原样、退出码透传', () => {
    const root = home()
    const fake = fakePnpm(root, 'bin')
    for (const held of [true, false]) {
      const result = slot(root, ['pnpm', '--filter', 'a b', 'exec', 'x'], [fake.dir], held)
      expect(result.status, result.stderr).toBe(3)
      const seen = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '')
      expect(seen.entry).toBe(fake.entry)
      expect(seen.args).toEqual(['--filter', 'a b', 'exec', 'x'])
      // Windows 上由起名额脚本的那个 Node 运行 pnpm.cjs。
      if (WINDOWS) expect(seen.node).toBe(process.execPath)
    }
    expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8')).toContain('"exitCode":3')
  })

  it.runIf(WINDOWS)('Windows：传 pnpm.cmd 与 pnpm 同样起 pnpm.cjs', () => {
    const root = home()
    const fake = fakePnpm(root, 'bin')
    const result = slot(root, ['pnpm.cmd', '-v'], [fake.dir])
    expect(result.status, result.stderr).toBe(3)
    expect(JSON.parse(result.stdout).entry).toBe(fake.entry)
  })

  it.runIf(WINDOWS)('Windows：跳过旁边没有 pnpm.cjs 的 pnpm.cmd，都没有时以 127 退出并说明', () => {
    const root = home()
    const bare = fakePnpm(root, 'bare', false)
    const full = fakePnpm(root, 'full')
    const used = slot(root, ['pnpm', '-v'], [bare.dir, full.dir])
    expect(used.status, used.stderr).toBe(3)
    expect(JSON.parse(used.stdout).entry).toBe(full.entry)

    // 只剩没有 pnpm.cjs 的那个目录：PATH 里别处的真实 pnpm 也不能被拿来顶替。
    const env = environment([bare.dir], { OMNE_TEST_SLOT_HELD: join(root, 'held.lock') })
    env['PATH'] = bare.dir
    const refused = spawnSync(process.execPath, [SCRIPT, 'pnpm', '-v'], {
      cwd: root,
      env,
      encoding: 'utf8',
    })
    expect(refused.status).toBe(127)
    expect(refused.stdout).toBe('')
    expect(refused.stderr).toContain(join(bare.dir, 'pnpm.cmd'))
    expect(refused.stderr).toContain('pnpm.cjs')
  })

  it('.sh 脚本：直接交给名额脚本也能起，参数原样、退出码透传', () => {
    const root = home()
    const probe = join(root, 'probe.sh')
    writeFileSync(probe, '#!/usr/bin/env bash\nprintf "[%s]\\n" "$@"\nexit 4\n')
    chmodSync(probe, 0o755)
    const result = slot(root, [probe, 'a', 'b c'], [])
    expect(result.status, result.stderr).toBe(4)
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(['[a]', '[b c]'])
  })
})

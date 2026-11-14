import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../../../scripts/with-test-slot.mjs', import.meta.url))
const WINDOWS = process.platform === 'win32'

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

  describe.runIf(WINDOWS)('Windows：PATH 上有 pnpm.exe、npm 全局布局或两者都有', () => {
    function exePnpm(root: string, name: string): string {
      const dir = join(root, name)
      mkdirSync(dir, { recursive: true })
      try {
        symlinkSync(process.execPath, join(dir, 'pnpm.exe'), 'file')
      } catch {
        copyFileSync(process.execPath, join(dir, 'pnpm.exe'))
      }
      return dir
    }
    function started(root: string, dirs: readonly string[]) {
      const probe = join(root, 'probe.cjs')
      writeFileSync(probe, FAKE_PNPM)
      const result = slot(root, ['pnpm', probe, 'x'], dirs)
      expect(result.status, result.stderr).toBe(3)
      return { probe, seen: JSON.parse(result.stdout.trim()) }
    }

    it('只有 pnpm.exe 时直接起它', () => {
      const root = home()
      const { probe, seen } = started(root, [exePnpm(root, 'exe')])
      expect(seen).toMatchObject({ entry: probe, args: ['x'] })
    })

    it('两种都有时按 PATH 顺序取先遇到的那个', () => {
      const root = home()
      const npm = fakePnpm(root, 'npm')
      const exe = exePnpm(root, 'exe')
      const exeFirst = started(root, [exe, npm.dir])
      expect(exeFirst.seen).toMatchObject({ entry: exeFirst.probe, args: ['x'] })
      const npmFirst = started(root, [npm.dir, exe])
      expect(npmFirst.seen).toMatchObject({ entry: npm.entry, args: [npmFirst.probe, 'x'] })
    })
  })

  it('.sh 脚本：参数里的通配符、花括号、~ 与引号原样到达脚本', () => {
    const root = home()
    for (const name of ['a.md', 'b.md']) writeFileSync(join(root, name), '')
    const probe = join(root, 'probe.sh')
    writeFileSync(probe, '#!/usr/bin/env bash\nprintf "[%s]\\n" "$@"\nexit 4\n')
    chmodSync(probe, 0o755)
    const odd = ['*.md', '?.md', '[ab].md', '{a,b}', '~', "it's", 'x"y', 'c:\\dir\\', 'a\\\\b', '']
    const result = slot(root, [probe, ...odd], [])
    expect(result.status, result.stderr).toBe(4)
    expect(result.stdout.split(/\r?\n/).slice(0, -1)).toEqual(odd.map(arg => `[${arg}]`))
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

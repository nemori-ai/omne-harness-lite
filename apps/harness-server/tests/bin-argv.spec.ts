// @module-tag slow
// 慢：每个用例启动 dist/bin.js 子进程。
// 进程入口的子命令分派：位置参数里没有 `serve` 时，走 S0 的基线解析路径（`parseArgs` 允许位置参数，
// 子命令可在任意位置，错误文字前缀 `s0:`）。有 `serve` 时走真实模式。S0 的字节级比较（对基线源码）由
// 过程目录里的 `s0-bytes-compare.sh` 做；本文件把基线行为里能写成字面值的部分固定下来。
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
const bin = join(memberDir, 'dist', 'bin.js')
const distribution = join(memberDir, 'config', 's0.distribution.json')

type Outcome = { code: number | null; stdout: string; stderr: string }

function runBin(args: readonly string[]): Promise<Outcome> {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [bin, ...args],
      { env: { ...process.env, NO_COLOR: '1' }, timeout: 60_000 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null
        resolve({ code, stdout, stderr })
      },
    )
  })
}

const S0_USAGE =
  'usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>'
const options = [
  '--distribution',
  distribution,
  '--readiness-timeout-ms',
  '5000',
  '--shutdown-deadline-ms',
  '2000',
]

describe('bin: S0 argument parsing is the baseline path when no positional is serve', () => {
  it('no arguments: exit 2, stdout empty, the s0 usage error text', async () => {
    const out = await runBin([])
    expect(out).toEqual({
      code: 2,
      stdout: '',
      stderr: `s0: expected subcommand s0\n${S0_USAGE}\n`,
    })
  })

  it('an unknown positional is the same s0 usage error, not a subcommand list', async () => {
    const out = await runBin(['frobnicate', ...options])
    expect(out).toEqual({
      code: 2,
      stdout: '',
      stderr: `s0: expected subcommand s0\n${S0_USAGE}\n`,
    })
  })

  it('the subcommand after the options still runs S0 and exits 0', async () => {
    const out = await runBin([...options, 's0'])
    expect(out.code).toBe(0)
    expect(out.stderr).toBe('')
    const kinds = out.stdout
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => (JSON.parse(line) as { kind: string }).kind)
    expect(kinds).toContain('startup-result')
    expect(kinds).toContain('shutdown-result')
  })

  it('a serve-only option without serve is an s0 unknown-option error', async () => {
    const out = await runBin(['s0', ...options, '--state-root', memberDir])
    expect(out.code).toBe(2)
    expect(out.stdout).toBe('')
    expect(out.stderr.startsWith('s0: ')).toBe(true)
    expect(out.stderr).toContain(S0_USAGE)
  })
})

describe('bin: serve anywhere in the positionals selects the real mode', () => {
  it('serve after the options: the serve usage error, prefix serve', async () => {
    const out = await runBin([...options, 'serve'])
    expect(out.code).toBe(2)
    expect(out.stdout).toBe('')
    expect(out.stderr.startsWith('serve: missing --state-root\nusage: serve ')).toBe(true)
  })

  it('serve with an extra positional is refused with the serve prefix', async () => {
    const out = await runBin(['serve', 'extra', ...options])
    expect(out.code).toBe(2)
    expect(out.stderr.startsWith('serve: expected subcommand serve\nusage: serve ')).toBe(true)
  })
})

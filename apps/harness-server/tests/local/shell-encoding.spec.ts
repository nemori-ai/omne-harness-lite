// @module-tag slow
// 慢：每个用例启动一个真实的 Windows PowerShell。
// The Shell tool on Windows: Chinese text must reach the host as UTF-8. This runs the real
// `powershell.exe` with the exact arguments and environment that the local profile gives the Shell
// tool, and decodes the bytes on its stdout and stderr as the execution host does (UTF-8).
// Without the prelude, the same cases come back in the OEM code page of the console (936), which
// is noise when decoded as UTF-8. Off Windows there is no such console page, so the cases are
// skipped there; the Linux arguments are pinned in `operator-defaults.spec.ts`.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { shellArguments, shellEnvironment } from '../../src/local/operator-defaults.ts'
import { captureShellEnvironment } from '../../src/local/settings.ts'

const windows = process.platform === 'win32'
const suite = windows ? describe : describe.skip
const skipNote = 'skipped off Windows: the fault is the OEM code page of the Windows console'

type Outcome = { code: number | null; stdout: string; stderr: string }

let directory = ''
let repository = ''

/** Runs `script` as the Shell tool does: executable, argument prefix, script, explicit environment. */
function runShell(
  script: string,
  options: { prefix?: readonly string[]; stdin?: string } = {},
): Promise<Outcome> {
  const executable = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )
  const prefix = options.prefix ?? shellArguments('win32', executable)
  const saved = captureShellEnvironment('win32', process.env)
  const env = shellEnvironment('win32', saved, directory)
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...prefix, script], {
      cwd: repository,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    child.once('error', reject)
    child.once('close', code =>
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      }),
    )
    child.stdin.end(options.stdin === undefined ? '' : Buffer.from(options.stdin, 'utf8'))
  })
}

suite(`Shell tool output encoding, real powershell.exe (${skipNote})`, () => {
  beforeAll(() => {
    directory = realpathSync(mkdtempSync(join(tmpdir(), 'omne-shell-enc-')))
    repository = join(directory, 'repo')
    mkdirSync(repository)
    writeFileSync(join(repository, '中文文件.txt'), '你好，世界\n第二行：编码', 'utf8')
    const git = (...args: string[]) => {
      const result = spawnSync(
        'git',
        ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args],
        { cwd: repository, encoding: 'utf8' },
      )
      if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
    }
    git('init', '-q')
    git('commit', '-q', '--allow-empty', '-m', '修复：中文提交信息')
  })
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('returns what PowerShell itself writes', async () => {
    const result = await runShell("Write-Output '中文测试'")
    expect(result).toEqual({ code: 0, stdout: '中文测试\r\n', stderr: '' })
  }, 30_000)

  it('reads a UTF-8 file without a byte order mark, with Get-Content and Select-String', async () => {
    const result = await runShell(
      "Get-Content -Path '中文文件.txt'; (Select-String -Path '中文文件.txt' -Pattern '编码').Line",
    )
    expect(result).toEqual({
      code: 0,
      stdout: '你好，世界\r\n第二行：编码\r\n第二行：编码\r\n',
      stderr: '',
    })
  }, 30_000)

  it('lists a file name with Chinese characters', async () => {
    const result = await runShell('(Get-ChildItem -Name)')
    expect(result.stdout).toContain('中文文件.txt')
  }, 30_000)

  it('returns what a native program writes: cmd and git', async () => {
    const cmd = await runShell('cmd /c echo 中文')
    expect(cmd).toEqual({ code: 0, stdout: '中文\r\n', stderr: '' })
    const git = await runShell('git log -1 --format=%s')
    expect(git).toEqual({ code: 0, stdout: '修复：中文提交信息\n', stderr: '' })
  }, 30_000)

  it('returns what goes to the error stream', async () => {
    const result = await runShell("[Console]::Error.WriteLine('错误：找不到'); exit 3")
    expect(result).toEqual({ code: 3, stdout: '', stderr: '错误：找不到\r\n' })
  }, 30_000)

  it('reads Chinese standard input as UTF-8 through [Console]::In', async () => {
    // `$input` is decoded by the PowerShell host in the page of the console before any script runs, so the
    // prelude cannot reach it (SPEC.md, known limitation).
    const result = await runShell('[Console]::In.ReadLine()', { stdin: '你好\n' })
    expect(result).toEqual({ code: 0, stdout: '你好\r\n', stderr: '' })
  }, 30_000)

  it('hands a Chinese string to a native program as UTF-8', async () => {
    const result = await runShell("'中文管道' | git hash-object --stdin")
    // The hash of the UTF-8 bytes of `中文管道` and a newline. A different encoding gives another.
    const expected = spawnSync('git', ['hash-object', '--stdin'], {
      input: '中文管道\r\n',
      encoding: 'utf8',
    }).stdout.trim()
    expect(result.stdout.trim()).toBe(expected)
  }, 30_000)

  it('keeps a script with quotes, backslashes and lines intact after the prelude', async () => {
    const result = await runShell(
      '$a = "引号 ""x"" \\ 反斜杠"\nWrite-Output $a\nWrite-Output \'第二行\'',
    )
    expect(result).toEqual({ code: 0, stdout: '引号 "x" \\ 反斜杠\r\n第二行\r\n', stderr: '' })
  }, 30_000)

  it('is the prelude that fixes it: the arguments without it return noise', async () => {
    const withoutPrelude = shellArguments('win32', 'powershell.exe').slice(0, -1)
    const result = await runShell("Write-Output '中文测试'", { prefix: withoutPrelude })
    // Skipped when the host console page is already UTF-8, where there is no fault to fix.
    if (spawnSync('cmd', ['/c', 'chcp'], { encoding: 'utf8' }).stdout.includes('65001')) return
    expect(result.stdout).not.toContain('中文测试')
  }, 30_000)
})

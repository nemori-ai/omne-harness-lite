// @module-tag slow
// 慢：起 dist/bin.js 的 setup 与 serve 子进程，serve 装载整棵发行树（真实 SQLite 存储），再起 omne CLI 子进程。
// `harness-server setup` 之后 `serve` 不带参数（只带 --stop-on-stdin-close）就绪，CLI 不给地址也连得上；
// 已知的哨兵密钥不出现在配置文件、任何标准输出或标准错误里。没有 setup 时 `serve` 给出提示并非零退出。
// 先构建 harness-server 与 cli。测试不访问网络：没有 Model 调用。
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cliBin, freePort, killTree, serverBin } from '../r9/support.ts'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-serve-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

type Outcome = { code: number | null; stdout: string; stderr: string }

/**
 * The environment of every child: a user directory and a server home inside the scratch root, so
 * no case reads or writes the setup of the host that runs it. `OMNE_SERVER` is never set.
 */
function envFor(serverHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'] ?? '',
    HOME: root,
    USERPROFILE: root,
    OMNE_SERVER_HOME: serverHome,
    NO_COLOR: '1',
  }
  for (const name of ['SystemRoot', 'SystemDrive', 'TEMP', 'TMP', 'LOCALAPPDATA'])
    if (process.env[name] !== undefined) env[name] = process.env[name]
  return env
}

function run(
  bin: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  input = '',
): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: root, env })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

const sentinel = () => ['sk', 'or', 'v1', 'sentinel', randomBytes(12).toString('hex')].join('-')

/** Starts `serve` without arguments, runs `during` once it accepts, then closes stdin. */
function serveWithoutArguments(
  env: NodeJS.ProcessEnv,
  during: () => Promise<void>,
): Promise<Outcome & { duringError?: unknown }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [serverBin, 'serve', '--stop-on-stdin-close'], {
      cwd: root,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let started = false
    let duringError: unknown
    const timer = setTimeout(() => killTree(child), 90_000)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
      if (!started && stdout.includes('"kind":"startup-result"')) {
        started = true
        void during()
          .catch((error: unknown) => {
            duringError = error
          })
          .finally(() => child.stdin.end())
      }
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, ...(duringError === undefined ? {} : { duringError }) })
    })
  })
}

describe('setup, then serve without arguments', () => {
  it('reaches ready, serves the CLI on the configured port, stops with exit 0, and leaks no key', async () => {
    const home = join(root, 'omne-a')
    const env = envFor(home)
    const port = await freePort()
    const key = sentinel()

    // A secret in the environment of setup must not reach the settings or the Shell tool.
    const envKey = sentinel()
    const setup = await run(
      serverBin,
      ['setup', '--port', String(port)],
      { ...env, OPENROUTER_API_KEY: envKey },
      `${key}\n`,
    )
    expect(setup.code, setup.stderr).toBe(0)
    expect(setup.stdout).toContain(`address      http://127.0.0.1:${String(port)}`)

    const cliHome = join(root, 'cli-home')
    mkdirSync(cliHome)
    let register: Outcome | undefined
    const served = await serveWithoutArguments(env, async () => {
      register = await run(
        cliBin,
        ['register', '--login-identifier', 'setup-flow'],
        { ...env, OMNE_HOME: cliHome },
        'a-test-password\n',
      )
    })
    expect(served.duringError).toBeUndefined()
    expect(served.code, served.stderr).toBe(0)
    const startup = served.stdout
      .split('\n')
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .find(record => record['kind'] === 'startup-result')
    expect(startup).toMatchObject({ outcome: 'ready', accepting: true })
    expect(served.stderr).toContain(`serve: accepting on http://127.0.0.1:${String(port)}`)
    // The CLI had neither --server nor OMNE_SERVER: it read the port that setup wrote.
    expect(register?.code, register?.stderr).toBe(0)
    expect(JSON.parse(register?.stdout ?? '{}')).toMatchObject({ outcome: 'succeeded' })

    const settings = readFileSync(join(home, 'config', 'server.json'), 'utf8')
    for (const text of [
      settings,
      setup.stdout,
      setup.stderr,
      served.stdout,
      served.stderr,
      register?.stdout ?? '',
      register?.stderr ?? '',
    ]) {
      expect(text).not.toContain(key)
      expect(text).not.toContain(envKey)
    }
    // Negative control: the scan finds the key in the one file that must hold it.
    expect(readFileSync(join(home, 'state', 'model-vault.json'), 'utf8')).toContain(key)
  })

  it('--replace-credential puts the new key into the vault through the process', async () => {
    const home = join(root, 'omne-b')
    const env = envFor(home)
    const first = sentinel()
    const second = sentinel()
    expect((await run(serverBin, ['setup'], env, `${first}\n`)).code).toBe(0)
    const kept = await run(serverBin, ['setup'], env, `${second}\n`)
    expect(kept.code).toBe(0)
    const vault = () => readFileSync(join(home, 'state', 'model-vault.json'), 'utf8')
    // Negative control: without the option the offered key is not read into the vault.
    expect(vault()).toContain(first)
    expect(vault()).not.toContain(second)
    const replaced = await run(serverBin, ['setup', '--replace-credential'], env, `${second}\n`)
    expect(replaced.code, replaced.stderr).toBe(0)
    expect(vault()).toContain(second)
    expect(vault()).not.toContain(first)
    expect(replaced.stdout + replaced.stderr).not.toContain(second)
  })
})

describe('serve without setup', () => {
  it('says that the host is not set up and names the command, exit 2, no record', async () => {
    const home = join(root, 'omne-none')
    const out = await run(serverBin, ['serve'], envFor(home))
    expect(out).toEqual({
      code: 2,
      stdout: '',
      stderr: `serve: not set up: no state directory at ${join(home, 'state')}\nRun \`harness-server setup\` first.\n`,
    })
  })

  it('a state directory without settings is still not set up', async () => {
    const home = join(root, 'omne-state-only')
    mkdirSync(join(home, 'state'), { recursive: true })
    const out = await run(serverBin, ['serve'], envFor(home))
    expect(out.code).toBe(2)
    expect(out.stderr).toBe(
      `serve: not set up: no settings at ${join(home, 'config', 'server.json')}\nRun \`harness-server setup\` first.\n`,
    )
  })
})

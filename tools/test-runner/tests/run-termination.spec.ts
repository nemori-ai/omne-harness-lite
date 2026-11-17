// 测试一步收到终止信号：转给在跑的批，不再派下一批，以 130 退出。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const RUN = new URL('../src/testing/run.ts', import.meta.url).pathname
const POOL = new URL('../src/testing/token-pool.ts', import.meta.url).pathname

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const until = async (done: () => boolean, ms = 20_000) => {
  const deadline = Date.now() + ms
  while (!done()) {
    if (Date.now() > deadline) throw new Error('等不到')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

it('收到 SIGTERM：在跑的批被停掉，排在后面的批不再起，以 130 退出', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'run-termination-')))
  dirs.push(dir)
  const script = join(dir, 'queue.mts')
  writeFileSync(
    script,
    [
      `import { spawnLogged } from ${JSON.stringify(RUN)}`,
      `import { localPool, runJobs } from ${JSON.stringify(POOL)}`,
      `const dir = ${JSON.stringify(dir)}`,
      'const batch = (name: string) => ({',
      '  want: 1, min: 1, label: name,',
      '  run: () => spawnLogged(process.execPath, ["-e",',
      '    `require("fs").writeFileSync(${JSON.stringify(dir + "/" + name + ".pid")}, String(process.pid)); setTimeout(() => {}, 60000)`],',
      '    { cwd: dir, env: process.env, logPath: dir + "/" + name + ".log" }),',
      '})',
      'await runJobs([batch("first"), batch("second")], localPool(1))',
    ].join('\n'),
  )
  const queue = spawn(process.execPath, ['--experimental-strip-types', script], {
    cwd: dir,
    stdio: 'ignore',
  })
  const exited = new Promise<number | null>(resolve => queue.once('exit', code => resolve(code)))
  await until(() => existsSync(join(dir, 'first.pid')))
  const first = Number(readFileSync(join(dir, 'first.pid'), 'utf8'))
  queue.kill('SIGTERM')
  expect(await exited).toBe(130)
  await until(() => !alive(first))
  await new Promise(resolve => setTimeout(resolve, 500))
  expect(existsSync(join(dir, 'second.pid'))).toBe(false)
})

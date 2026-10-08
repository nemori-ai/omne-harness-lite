// covers: PF-006 S118
// Controlled model records; real SQL, account authority, selection, admission and runtime.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, open, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

function repositoryRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url))
  while (!existsSync(join(current, 'pnpm-workspace.yaml'))) {
    const parent = dirname(current)
    if (parent === current) throw new Error('Workspace root not found')
    current = parent
  }
  return current
}

test('S118: the unique selected implementation executes with its original input', async context => {
  const repository = repositoryRoot()
  const parent = join(repository, 'tmp')
  await mkdir(parent, { recursive: true })
  const evidence = await mkdtemp(join(parent, 'selected-tool-'))
  const helper = (name: string) =>
    fileURLToPath(new URL(`./helpers/selected-tool/${name}`, import.meta.url))
  async function run(name: string, prefix: string): Promise<void> {
    const stdout = await open(join(evidence, prefix + '.stdout'), 'w')
    const stderr = await open(join(evidence, prefix + '.stderr'), 'w')
    try {
      const child = spawn(process.execPath, [helper(name), evidence], {
        cwd: repository,
        env: { ...process.env, TZ: 'UTC', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
        stdio: ['ignore', stdout.fd, stderr.fd],
      })
      const ended = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', code => resolve(code))
      })
      context.onTestFinished(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
        await ended
      })
      const code = await ended
      await writeFile(
        join(evidence, prefix + '.exit.json'),
        JSON.stringify({ exitCode: code, signal: child.signalCode }) + '\n',
      )
      assert.equal(code, 0, `${prefix} failed; evidence: ${evidence}`)
    } finally {
      await stdout.close()
      await stderr.close()
    }
  }
  await run('real-runtime.mjs', 'native')
  await run('verify.mjs', 'verification')
})

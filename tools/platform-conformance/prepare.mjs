import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'
import { execute, pnpmCommand } from './process.mjs'
import { assertWslPath, verifyCheckout } from './run.mjs'

export async function prepare(config, signal) {
  const { root, remote, branch, sha, timeoutMs } = config
  assertWslPath(root)
  if (process.platform !== 'linux' || !/microsoft/i.test(os.release()))
    throw new Error('prepare-wsl must run inside WSL')
  if (existsSync(root)) throw new Error('prepare-wsl requires a new checkout directory')
  if (!/^(https:\/\/|ssh:\/\/|[^\s/@:]+@[^\s/:]+:)[^\s]+$/.test(remote))
    throw new Error('Remote must be an HTTPS or SSH URL, never a local path')
  const options = { timeoutMs, signal }
  const ref = await execute(['git', 'check-ref-format', '--branch', branch], options)
  if (ref.code !== 0) throw new Error('Invalid remote branch name')
  mkdirSync(dirname(root), { recursive: true })
  const steps = []
  const step = async argv => {
    const result = await execute(argv, { ...options, cwd: existsSync(root) ? root : dirname(root) })
    steps.push({ argv, ...result })
    if (result.code !== 0 || result.interrupted || result.spawnError)
      throw new Error(`WSL preparation failed: ${argv[0]} ${argv[1]}`)
  }
  try {
    await step(['git', 'clone', '--no-checkout', '--branch', branch, '--', remote, root])
    await step(['git', 'checkout', '--detach', sha])
    const verification = await verifyCheckout(root, sha, options)
    steps.push({ verification })
    if (!verification.ok) throw new Error(verification.reason)
    await step(pnpmCommand(['install', '--frozen-lockfile', '--ignore-scripts']))
    process.stdout.write(
      `Prepared WSL checkout ${root} at ${sha}; build required member dependencies before run\n`,
    )
    return 0
  } finally {
    if (existsSync(join(root, '.git')))
      writeFileSync(
        join(root, '.git/platform-conformance-prepare.json'),
        `${JSON.stringify(steps, null, 2)}\n`,
      )
  }
}

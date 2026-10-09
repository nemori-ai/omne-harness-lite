import childProcess, { type SpawnOptions } from 'node:child_process'
import { composeMigrations } from '@omne-harness-lite/storage'
import { existsSync, promises as fs } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join, dirname } from 'node:path'
import { once } from 'node:events'
import { createUpgradeGuard, openSnapshotInspection, openStorage } from '../../src/index.ts'

const [mode, resource, behavior, source, root] = process.argv.slice(2)
if (source === undefined || root === undefined) throw new Error('missing paths')
const marker = join(root, '.omne-isolated')
const original = fs.open
let observed: WeakRef<Awaited<ReturnType<typeof fs.open>>> | undefined
let attempts = 0
const originalSpawn = childProcess.spawn
childProcess.spawn = ((
  command: string,
  args: readonly string[] = [],
  options: SpawnOptions = {},
) => {
  const stdio = options?.stdio
  const target = Array.isArray(stdio) && stdio[3] === observed?.deref()?.fd
  if (command === 'flock' && target && resource === 'coordination-spawn')
    return originalSpawn(process.execPath, ['--eval', 'process.exit(2)'], options)
  if (command === 'flock' && target && resource === 'coordination-acquired')
    return originalSpawn(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
      import { spawnSync } from 'node:child_process'
      const result = spawnSync('flock', ['--exclusive', '--nonblock', '3'],
        { stdio: ['ignore', 'ignore', 'ignore', 3] })
      process.exit(result.status === 0 ? 2 : 3)
    `,
      ],
      options,
    )
  return originalSpawn(command, args, options)
}) as unknown as typeof childProcess.spawn
fs.open = async (...args) => {
  if (resource === 'coordination-release' && String(args[0]) === marker)
    throw Object.assign(new Error('injected marker open failure'), { code: 'EIO' })
  const handle = await original(...args)
  const path = String(args[0])
  const match = resource?.startsWith('coordination')
    ? path === join(root, '.owner-lock')
    : resource === 'marker'
      ? path === marker
      : resource === 'root'
        ? path === root
        : path === dirname(root) && existsSync(marker)
  if (match) {
    observed = new WeakRef(handle)
    const close = handle.close.bind(handle)
    handle.close = async () => {
      attempts++
      if (behavior === 'throw-closed') await close()
      if (behavior !== 'return-open')
        throw Object.assign(new Error('injected acquisition close failure'), { code: 'EIO' })
    }
  }
  return handle
}
syncBuiltinESMExports()
let failure: unknown
try {
  if (mode === 'online') {
    const storage = await openStorage({
      dialect: 'sqlite',
      file: source,
      migrations: composeMigrations([]),
      upgrade: { guard: createUpgradeGuard(), checks: [] },
      maintenance: { workDirectory: root, onClosed() {} },
    })
    await storage.close()
  } else {
    const inspection = await openSnapshotInspection(root)
    await inspection.close()
  }
} catch (error) {
  failure = error
}
fs.open = original
childProcess.spawn = originalSpawn
syncBuiltinESMExports()
for (let i = 0; i < 3; i++) {
  await new Promise<void>(resolve => setImmediate(resolve))
  global.gc?.()
}
const exit = once(process.stdin, 'data')
process.stdout.write(
  JSON.stringify({
    stage: 'failed',
    failed: failure !== undefined,
    attempts,
    resourceOpen: (observed?.deref()?.fd ?? -1) >= 0,
  }) + '\n',
)
await exit
process.exit(1)

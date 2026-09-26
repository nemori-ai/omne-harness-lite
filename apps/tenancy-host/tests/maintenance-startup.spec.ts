import { openSnapshotInspection } from '@omne-harness-lite/storage-sql'
import { existsSync, promises as fs } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ENV } from '../src/config.ts'
import { asEnv, deployment } from './support/deployment.ts'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Hosts } from './support/host.ts'

const hosts = new Hosts()
const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  await hosts.stopAll()
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true })
})

it('refuses parent fsync failure before creating any fiber, database or plaintext workspace', async () => {
  const d = await deployment('maintenance-parent-sync')
  roots.push(d.root)
  const parent = await fs.realpath(d.root)
  const original = fs.open
  let injected = 0
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await original(...args)
    if (String(args[0]) === parent)
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        injected++
        throw Object.assign(new Error('injected directory fsync failure'), { code: 'EIO' })
      })
    return handle
  })
  syncBuiltinESMExports()
  const refusal = await hosts.refuse(d)
  expect(injected).toBe(1)
  expect(refusal.failure).toMatchObject({ stage: 'config', item: ENV.backupDirectory })
  expect(refusal.fibers).toHaveLength(0)
  expect(existsSync(d.file)).toBe(false)
  expect(existsSync(join(`${d.file}.backups`, '.quarantine'))).toBe(false)
})

it('rejects a directory used as the source before creating its default backup directory', async () => {
  const d = await deployment('maintenance-source-directory')
  roots.push(d.root)
  await fs.mkdir(d.file, { mode: 0o700 })
  const refusal = await hosts.refuse(d)
  expect(refusal.failure).toMatchObject({ stage: 'config' })
  expect(refusal.fibers).toHaveLength(0)
  expect(existsSync(`${d.file}.backups`)).toBe(false)
})

it.each(['missing-marker', 'wide-mode', 'busy', 'access-error'] as const)(
  'names the maintenance configuration for %s without claiming the precise cause',
  async fault => {
    const d = await deployment('maintenance-diagnostic')
    roots.push(d.root)
    const backup = await fs.realpath(d.root).then(parent => join(parent, 'center.sqlite.backups'))
    const work = join(backup, '.quarantine')
    await fs.mkdir(backup, { mode: 0o700 })
    const owner = await openSnapshotInspection(work)
    if (fault !== 'busy') await owner.close()
    try {
      if (fault === 'missing-marker') await fs.unlink(join(work, '.omne-isolated'))
      if (fault === 'wide-mode') await fs.chmod(work, 0o755)
      if (fault === 'access-error') {
        const original = fs.open
        vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
          if (String(args[0]) === join(work, '.omne-isolated'))
            throw Object.assign(new Error('injected marker access denial'), { code: 'EACCES' })
          return original(...args)
        })
        syncBuiltinESMExports()
      }
      const refused = await hosts.refuse(d)
      expect(refused.failure).toMatchObject({ stage: 'storage-open', item: ENV.backupDirectory })
      expect(refused.failure.message).toContain('.quarantine')
      expect(refused.failure.message).toContain(fault === 'busy' ? ': busy;' : ': unavailable;')
      expect(refused.failure.message).toContain('check the directory')
      expect(JSON.stringify(refused.log.events('startup-failed'))).not.toContain(
        'injected marker access denial',
      )
    } finally {
      await owner.close()
    }
  },
)

it('reports a retained first-start marker without claiming that restoration was attempted', async () => {
  const d = await deployment('maintenance-retained-startup')
  roots.push(d.root)
  const preload = join(d.root, 'close-fault.mjs')
  await fs.writeFile(
    preload,
    `import { promises as fs } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const open = fs.open;
fs.open = async (...args) => {
  const handle = await open(...args);
  if (String(args[0]).endsWith('/.quarantine/.omne-isolated')) {
    handle.close = async () => { throw Object.assign(new Error('injected unclosed marker'), { code: 'EIO' }); };
  }
  return handle;
};
syncBuiltinESMExports();
`,
  )
  const child = spawn(
    process.execPath,
    ['--import', preload, fileURLToPath(new URL('../dist/cli.js', import.meta.url)), 'serve'],
    { env: { ...process.env, ...asEnv(d) }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', data => {
    stderr += String(data)
  })
  const timer = setTimeout(() => child.kill('SIGKILL'), 15_000)
  try {
    const exit = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal }))
    })
    expect(exit, stderr).toEqual({ code: 1, signal: null })
    const records: unknown[] = stderr
      .split('\n')
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line))
    const failure = records.find(
      record =>
        typeof record === 'object' &&
        record !== null &&
        'event' in record &&
        record.event === 'startup-failed',
    )
    expect(failure).toMatchObject({
      stage: 'upgrade-unconfirmed',
      snapshot: `${d.file}.upgrade-snapshot`,
    })
    expect(failure).toHaveProperty(
      'message',
      expect.stringContaining('restoration is not confirmed'),
    )
    expect(failure).toHaveProperty('message', expect.stringContaining('ownership is retained'))
    expect(failure).toHaveProperty(
      'message',
      expect.not.stringContaining('restoring the upgrade snapshot failed'),
    )
    expect(existsSync(`${d.file}.upgrade-snapshot`)).toBe(true)
    const restarted = await hosts.start(d)
    expect(restarted.host.serving.centerId).toBeTruthy()
    expect(existsSync(`${d.file}.upgrade-snapshot`)).toBe(false)
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
}, 25_000)

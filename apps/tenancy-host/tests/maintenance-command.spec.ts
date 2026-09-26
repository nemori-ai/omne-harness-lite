import { execFile } from 'node:child_process'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { parseMaintenanceCommand, runMaintenanceCommand } from '../src/maintenance-command.ts'
import { deployment } from './support/deployment.ts'
import { Hosts } from './support/host.ts'

const hosts = new Hosts()
const roots: string[] = []
afterEach(async () => {
  await hosts.stopAll()
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true })
})
const entry = join(import.meta.dirname, '../dist/cli.js')
function command(args: readonly string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(resolve => {
    // No serve configuration or key material is supplied to these local commands.
    execFile(
      process.execPath,
      [entry, ...args],
      { timeout: 20_000, env: { NODE_NO_WARNINGS: '1' } },
      (error, stdout, stderr) => {
        resolve({
          code: error === null ? 0 : typeof error.code === 'number' ? error.code : 1,
          stdout,
          stderr,
        })
      },
    )
  })
}
function value(output: { stdout: string }): unknown {
  return JSON.parse(output.stdout)
}

it('runs packaged-shaped host commands against the real assembly and restores only an isolated envelope', async () => {
  const d = await deployment('maintenance-commands')
  roots.push(d.root)
  const { host } = await hosts.start(d)
  const health = await command(['ops', '--socket-dir', d.socketDirectory, 'full-health'])
  expect(health.code).toBe(0)
  expect(value(health)).toMatchObject({ reachable: true, centerId: host.serving.centerId })
  const backup = await command([
    'ops',
    '--socket-dir',
    d.socketDirectory,
    'backup',
    '--only-if-due',
  ])
  expect(backup.code, backup.stderr).toBe(0)
  const data = value(backup) as { status: string; backup: { fileName: string; metadata: unknown } }
  expect(data.status).toBe('completed')
  const source = join(`${d.file}.backups`, data.backup.fileName)
  const offline = join(d.root, '.offline')
  const verified = await command(['verify', '--source', source, '--work-dir', offline])
  expect(verified.code, verified.stderr).toBe(0)
  const envelope = await readFile(source)
  const magicLength = Buffer.byteLength('OMNE-CENTER-BACKUP/1\n')
  const metadata = JSON.parse(
    envelope
      .subarray(magicLength + 4, magicLength + 4 + envelope.readUInt32BE(magicLength))
      .toString('utf8'),
  ) as Record<string, unknown>
  const wireMetadata = data.backup.metadata as Record<string, unknown>
  const normalizeTimes = (value: Record<string, unknown>) => ({
    ...value,
    startedAt: new Date(String(value.startedAt)).toISOString(),
    finishedAt: new Date(String(value.finishedAt)).toISOString(),
  })
  expect(normalizeTimes(wireMetadata)).toEqual(normalizeTimes(metadata))
  expect(value(verified)).toEqual({
    status: 'verified',
    metadata,
    businessOpen: false,
  })
  const target = join(d.root, 'restored')
  const args = ['restore-isolated', '--source', source, '--target', target, '--work-dir', offline]
  const restored = await command(args)
  expect(restored.code, restored.stderr).toBe(0)
  expect(value(restored)).toMatchObject({ status: 'restored-isolated', businessOpen: false })
  expect(await readFile(join(target, 'data.omne-backup'))).toEqual(await readFile(source))
  const repeated = await command(args)
  expect(repeated.code).toBe(2)
  expect(value(repeated)).toEqual({ status: 'target-exists' })
  const busy = await command([
    'verify',
    '--source',
    source,
    '--work-dir',
    join(`${d.file}.backups`, '.quarantine'),
  ])
  expect(busy.code).toBe(2)
  expect(value(busy)).toEqual({ status: 'busy' })
  const status = await command(['ops', '--socket-dir', d.socketDirectory, 'backup-status'])
  expect(status.code).toBe(0)
  expect(value(status)).toMatchObject({ status: 'observed', health: 'current' })
})

it('returns missing as exit 2, unavailable as exit 1, and syntax errors as 64', async () => {
  const d = await deployment('maintenance-exits')
  roots.push(d.root)
  await hosts.start(d)
  expect((await command(['ops', '--socket-dir', d.socketDirectory, 'backup-status'])).code).toBe(2)
  const unavailable = await command([
    'verify',
    '--source',
    join(d.root, 'missing'),
    '--work-dir',
    join(d.root, '.offline'),
  ])
  expect(unavailable.code).toBe(1)
  expect(value(unavailable)).toEqual({ status: 'unavailable' })
  const bad = await command([
    'ops',
    '--socket-dir',
    d.socketDirectory,
    'full-health',
    '--only-if-due',
  ])
  expect(bad.code).toBe(64)
  expect(bad.stdout).toBe('')
})

it('waits for output completion and never repeats a backup after output failure', async () => {
  const d = await deployment('maintenance-output-failure')
  roots.push(d.root)
  await hosts.start(d)
  const parsed = parseMaintenanceCommand(['ops', '--socket-dir', d.socketDirectory, 'backup'])
  if (parsed === undefined) throw new Error('invalid fixture command')
  const errors: string[] = []
  const code = await runMaintenanceCommand(
    parsed,
    {
      stdout: async () => {
        throw new Error('broken output')
      },
      stderr: text => {
        errors.push(text)
      },
    },
    new AbortController().signal,
  )
  expect(code).toBe(1)
  expect(errors.join('')).toContain('ops result unconfirmed')
  expect(
    (await readdir(`${d.file}.backups`)).filter(name => name.endsWith('.omne-backup')),
  ).toHaveLength(1)
})

it.each(
  [
    ['ops', 'backup'],
    ['ops', '--socket-dir', '/tmp', 'backup', 'backup-status'],
    ['ops', '--socket-dir', '/tmp', '--socket-dir', '/tmp', 'backup'],
    ['ops', '--socket-dir', '/tmp', 'backup', '--only-if-due', '--only-if-due'],
    ['verify', '--source', '/tmp/a', '--work-dir', 'relative'],
    ['verify', '--source', '/tmp/a\u0000', '--work-dir', '/tmp/work'],
    ['restore-isolated', '--source', '/tmp/a', '--work-dir', '/tmp/work'],
    ['verify', '--source', '/tmp/a', '--work-dir', '/tmp/work', '--force'],
  ].map(args => ({ args })),
)('refuses ambiguous or invalid arguments: $args', ({ args }) => {
  expect(parseMaintenanceCommand(args)).toBeUndefined()
})

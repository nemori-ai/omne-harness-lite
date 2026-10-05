import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import {
  createUpgradeGuard,
  openSnapshotInspection,
  openStorage,
} from '@omne-harness-lite/storage-sql'
import {
  composeMigrations,
  type Storage,
  type SnapshotMaintenance,
} from '@omne-harness-lite/storage'
import { callOps } from '../src/ops-client.ts'
import { hostMigrationFragments } from '../src/migrations.ts'
import { deployment } from './support/deployment.ts'
import { Hosts } from './support/host.ts'

const hosts = new Hosts()
const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await hosts.stopAll()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const entry = join(import.meta.dirname, '../dist/cli.js')
function start(args: string[], input?: string) {
  const child = spawn(
    process.execPath,
    [
      ...(input === undefined
        ? []
        : [
            '--experimental-transform-types',
            '--import',
            fileURLToPath(new URL('./fixtures/maintenance-read-gate.ts', import.meta.url)),
          ]),
      entry,
      ...args,
    ],
    {
      env: {
        NODE_NO_WARNINGS: '1',
        ...(input === undefined ? {} : { OMNE_TEST_GATED_INPUT: input }),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  let stdout = '',
    stderr = ''
  child.stdout!.setEncoding('utf8').on('data', text => {
    stdout += String(text)
  })
  child.stderr!.setEncoding('utf8').on('data', text => {
    stderr += String(text)
  })
  const closed = new Promise<{
    code: number | null
    signal: string | null
    stdout: string
    stderr: string
  }>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  return { child, closed }
}

it('SIGINT ends the ops client wait while the admitted server run keeps source ownership and completes once', async () => {
  const d = await deployment('maintenance-client-signal')
  roots.push(d.root)
  const { host } = await hosts.start(d)
  const source = (
    host.context.get('storage') as Storage & { readonly maintenance?: SnapshotMaintenance }
  ).maintenance
  if (source === undefined) throw new Error('missing maintenance source')
  let release!: () => void, entered!: () => void, finished!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const ready = new Promise<void>(resolve => {
    entered = resolve
  })
  const settled = new Promise<void>(resolve => {
    finished = resolve
  })
  const run = source.run.bind(source)
  const admitted = vi.spyOn(source, 'run').mockImplementation((fn, options) => {
    const task = run(async session => {
      entered()
      await gate
      return fn(session)
    }, options)
    void task.then(finished, finished)
    return task
  })
  const processRun = start(['ops', '--socket-dir', d.socketDirectory, 'backup'])
  try {
    await ready
    processRun.child.kill('SIGINT')
    const result = await processRun.closed
    expect(result).toMatchObject({ code: 1, signal: null, stdout: '' })
    expect(result.stderr).toContain('ops result unconfirmed')
    await expect(
      openStorage({
        dialect: 'sqlite',
        file: d.file,
        migrations: composeMigrations(hostMigrationFragments),
        upgrade: { guard: createUpgradeGuard(), checks: [] },
      }),
    ).rejects.toMatchObject({ stage: 'occupied' })
    expect(admitted).toHaveBeenCalledTimes(1)
    release()
    await settled
    expect(
      (await readdir(`${d.file}.backups`)).filter(name => name.endsWith('.omne-backup')),
    ).toHaveLength(1)
    expect(admitted).toHaveBeenCalledTimes(1)
  } finally {
    release()
    if (processRun.child.exitCode === null && processRun.child.signalCode === null)
      processRun.child.kill('SIGKILL')
    await processRun.closed
    await settled
  }
})

it.each(['SIGINT', 'SIGTERM'] as const)(
  '%s waits for the real offline read, then releases the private workspace without claiming verification',
  async signal => {
    const d = await deployment('maintenance-offline-signal')
    roots.push(d.root)
    await hosts.start(d)
    const result = await callOps(
      { kind: 'ops', socketDirectory: d.socketDirectory, operation: 'backup', onlyIfDue: false },
      new AbortController().signal,
    )
    if (
      typeof result !== 'object' ||
      result === null ||
      !('status' in result) ||
      result.status !== 'completed' ||
      !('backup' in result)
    )
      throw new Error('backup fixture failed')
    const source = join(`${d.file}.backups`, (result.backup as { fileName: string }).fileName)
    const work = join(d.root, 'offline')
    const processRun = start(['verify', '--source', source, '--work-dir', work], source)
    try {
      expect((await once(processRun.child, 'message'))[0]).toEqual({ stage: 'reading' })
      processRun.child.kill(signal)
      await delay(100)
      expect(processRun.child.exitCode).toBeNull()
      expect(processRun.child.signalCode).toBeNull()
      await expect(openSnapshotInspection(work)).rejects.toMatchObject({ kind: 'busy' })
      processRun.child.send({ release: true })
      const output = await processRun.closed
      expect(output, output.stderr).toMatchObject({ code: 2, signal: null })
      expect(JSON.parse(output.stdout)).toEqual({ status: 'cancelled' })
      const reopened = await openSnapshotInspection(work)
      await reopened.close()
    } finally {
      if (processRun.child.connected) processRun.child.send({ release: true })
      if (processRun.child.exitCode === null && processRun.child.signalCode === null)
        processRun.child.kill('SIGKILL')
      await processRun.closed
    }
  },
)

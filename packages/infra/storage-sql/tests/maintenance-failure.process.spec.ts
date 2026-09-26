import { spawn } from 'node:child_process'
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { createUpgradeGuard, openStorage, openSnapshotInspection } from '../src/index.ts'
import { assertProductionStoragePath } from '../src/sqlite/protection.ts'
import { migrationsOf } from './fixtures/migrations.ts'

it.each(['sqlite', 'file'] as const)(
  'failed %s close retains both locks until actual fault exit, then permits a new owner',
  async resource => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-close-fault-process-')))
    const file = join(root, 'center.sqlite')
    const work = join(root, '.quarantine')
    const child = spawn(
      process.execPath,
      [
        '--experimental-transform-types',
        '--no-warnings',
        fileURLToPath(new URL('./fixtures/maintenance-close-child.ts', import.meta.url)),
        file,
        work,
        resource,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr.setEncoding('utf8').on('data', text => {
      stderr += String(text)
    })
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('exit', resolve)
      child.once('error', reject)
    })
    try {
      const report = await new Promise<string>((resolve, reject) => {
        let output = ''
        const timer = setTimeout(
          () => reject(new Error(`fault fixture timed out: ${stderr}`)),
          15_000,
        )
        child.stdout.setEncoding('utf8').on('data', text => {
          output += String(text)
          if (output.includes('\n')) {
            clearTimeout(timer)
            resolve(output.slice(0, output.indexOf('\n')))
          }
        })
        void exited.then(code => {
          clearTimeout(timer)
          reject(new Error(`premature child exit ${String(code)}: ${stderr}`))
        }, reject)
      })
      expect(JSON.parse(report)).toEqual({
        operationFailed: true,
        closeFailed: true,
        refusesNew: true,
        observed: 'error',
        handleStillOpen: true,
      })
      await expect(
        openStorage({
          dialect: 'sqlite',
          file,
          migrations: migrationsOf('data'),
          upgrade: { guard: createUpgradeGuard(), checks: [] },
        }),
      ).rejects.toMatchObject({ stage: 'occupied' })
      await expect(openSnapshotInspection(work)).rejects.toMatchObject({ kind: 'busy' })
      const task = (await readdir(work)).find(name => name.startsWith('task-'))
      if (resource === 'sqlite' && task === undefined)
        throw new Error('missing retained isolated task')
      const residual =
        resource === 'sqlite' ? join(work, task!, 'snapshot.sqlite') : join(work, 'external-output')
      expect(() => assertProductionStoragePath(residual)).toThrow('isolated maintenance data')
      child.stdin.write('fault-exit\n')
      expect(await exited).toBe(1)
      const guard = createUpgradeGuard()
      const next = await openStorage({
        dialect: 'sqlite',
        file,
        migrations: migrationsOf('data'),
        upgrade: { guard, checks: [] },
        maintenance: { workDirectory: work, onClosed() {} },
      })
      try {
        await guard.confirm()
      } finally {
        await next.close()
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exited
      await rm(root, { recursive: true, force: true })
    }
  },
  20_000,
)

it.each(['preflight', 'initialize'] as const)(
  'retains source ownership after %s startup cleanup failure and GC',
  async stage => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-startup-close-fault-')))
    const file = join(root, 'center.sqlite')
    const work = join(root, '.quarantine')
    const child = spawn(
      process.execPath,
      [
        '--expose-gc',
        '--experimental-transform-types',
        '--no-warnings',
        fileURLToPath(new URL('./fixtures/maintenance-startup-close-child.ts', import.meta.url)),
        file,
        work,
        stage,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr.setEncoding('utf8').on('data', text => {
      stderr += String(text)
    })
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('exit', resolve)
      child.once('error', reject)
    })
    try {
      const report = await new Promise<string>((resolve, reject) => {
        let output = ''
        const timer = setTimeout(
          () => reject(new Error(`startup fixture timed out: ${stderr}`)),
          15_000,
        )
        child.stdout.setEncoding('utf8').on('data', text => {
          output += String(text)
          if (output.includes('\n')) {
            clearTimeout(timer)
            resolve(output.slice(0, output.indexOf('\n')))
          }
        })
        void exited.then(code => {
          clearTimeout(timer)
          reject(new Error(`premature exit ${String(code)}: ${stderr}`))
        }, reject)
      })
      expect(JSON.parse(report)).toEqual({ failed: true, handleStillOpen: true })
      await expect(
        openStorage({
          dialect: 'sqlite',
          file,
          migrations: migrationsOf('data'),
          upgrade: { guard: createUpgradeGuard(), checks: [] },
        }),
      ).rejects.toMatchObject({ stage: 'occupied' })
      child.stdin.write('fault-exit\n')
      expect(await exited).toBe(1)
      const guard = createUpgradeGuard()
      const next = await openStorage({
        dialect: 'sqlite',
        file,
        migrations: migrationsOf('data'),
        upgrade: { guard, checks: [] },
      })
      try {
        await guard.confirm()
      } finally {
        await next.close()
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exited
      await rm(root, { recursive: true, force: true })
    }
  },
  20_000,
)

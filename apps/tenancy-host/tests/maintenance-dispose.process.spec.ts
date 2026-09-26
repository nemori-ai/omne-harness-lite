import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeMigrations } from '@omne-harness-lite/storage'
import { createUpgradeGuard, openStorage } from '@omne-harness-lite/storage-sql'
import { hostMigrationFragments } from '../src/migrations.ts'
import { deployment } from './support/deployment.ts'

it.each(['controller-error', 'storage-error', 'controller-pending', 'storage-pending'] as const)(
  'observes %s despite Cordis disposer error swallowing',
  async fault => {
    const d = await deployment(`maintenance-dispose-${fault}`)
    const child = spawn(
      process.execPath,
      [
        '--experimental-transform-types',
        '--no-warnings',
        fileURLToPath(new URL('./fixtures/maintenance-dispose-child.ts', import.meta.url)),
        fault,
      ],
      { env: { ...process.env, ...d.env }, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr.setEncoding('utf8').on('data', text => {
      stderr += String(text)
    })
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('exit', resolve)
      child.once('error', reject)
    })
    const reader = createInterface({ input: child.stdout })
    const lines = reader[Symbol.asyncIterator]()
    try {
      expect(JSON.parse((await lines.next()).value ?? '{}'), stderr).toEqual({ stage: 'ready' })
      child.stdin.write('dispose\n')
      const report: unknown = JSON.parse((await lines.next()).value ?? '{}')
      expect(report, stderr).toEqual({
        stage: 'disposed',
        result: {
          complete: false,
          unfinished: [fault.startsWith('controller') ? 'governance-center-ops' : 'storage-sql'],
        },
      })
      if (fault === 'storage-error') {
        await expect(
          openStorage({
            dialect: 'sqlite',
            file: d.file,
            migrations: composeMigrations(hostMigrationFragments),
            upgrade: { guard: createUpgradeGuard(), checks: [] },
          }),
        ).rejects.toMatchObject({ stage: 'occupied' })
      }
      child.stdin.write('exit\n')
      expect(await exited).toBe(1)
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exited
      reader.close()
      await rm(d.root, { recursive: true, force: true })
    }
  },
  20_000,
)

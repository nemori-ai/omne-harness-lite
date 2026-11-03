// @module-tag slow
// Starts and SIGKILLs a process while real SQLite Workers own the transaction.
import { fork } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { expect, test } from 'vitest'
import { createCommand, recovery } from './data.ts'
import { openWorld } from './world.ts'

test.each(['in-transaction', 'after-commit'])(
  'SIGKILL %s recovers the original identity without partial management facts',
  async phase => {
    const initial = await openWorld()
    await initial.close()
    const marker = join(initial.root, 'inside-transaction')
    const child = fork(
      fileURLToPath(new URL('./crash-child.ts', import.meta.url)),
      [initial.root, marker, phase],
      { execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    )
    let stderr = ''
    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          observer.close()
          reject(new Error(`Crash point not reached: ${stderr}`))
        }, 10000)
        const finish = () => {
          clearTimeout(timer)
          observer.close()
          resolve()
        }
        const observer = watch(initial.root, () => {
          if (phase === 'in-transaction' && existsSync(marker)) finish()
        })
        child.once('message', message => {
          if (phase === 'after-commit') {
            try {
              expect(message).toMatchObject({ kind: 'result', result: { kind: 'recorded' } })
              finish()
            } catch (error) {
              clearTimeout(timer)
              observer.close()
              reject(error)
            }
          }
        })
        child.once('exit', () => {
          clearTimeout(timer)
          observer.close()
          reject(new Error(`Child exited before crash: ${stderr}`))
        })
        if (phase === 'in-transaction' && existsSync(marker)) finish()
      })
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill('SIGKILL')
        await exited
      }
    }
    const recovered = await openWorld({ root: initial.root, configure: false })
    try {
      const count = phase === 'in-transaction' ? 0 : 1
      for (const table of [
        'sc_schedules',
        'sc_definitions',
        'sc_revisions',
        'sc_outbox',
        'sc_operations',
        'fixture_schedule_quota',
      ])
        expect(recovered.sql(`SELECT count(*) AS count FROM ${table}`)).toEqual([{ count }])
      const command = createCommand('crash:target')
      expect(
        await recovered.persistence.query({
          scope: recovery(),
          locator: {
            kind: 'identity',
            identity: command.input.operation.address,
            expectedFingerprint: command.input.operation.fingerprint,
          },
        }),
      ).toMatchObject({
        kind: 'ok',
        value: { kind: phase === 'in-transaction' ? 'notCommitted' : 'committed' },
      })
    } finally {
      await recovered.close()
    }
  },
  25000,
)

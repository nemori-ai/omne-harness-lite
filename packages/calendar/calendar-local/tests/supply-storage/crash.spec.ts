// @module-tag slow
// Starts a Node process and kills it while the real SQLite transaction is running.
import { fork, type ChildProcess } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { once } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { instantSchema } from '@omne-harness/calendar-contract'
import { openWorld, run, scope } from './world.ts'
function crashPoint(child: ChildProcess, root: string, marker: string, phase: string) {
  return new Promise<void>((resolve, reject) => {
    let stderr = ''
    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })
    const finish = (error?: Error) => {
      clearTimeout(timer)
      observer.close()
      child.off('exit', earlyExit)
      if (error === undefined) resolve()
      else reject(error)
    }
    const earlyExit = () => finish(new Error(`Crash child exited before ${phase}: ${stderr}`))
    const timer = setTimeout(
      () => finish(new Error(`Crash marker timeout after 15000 ms: ${stderr}`)),
      15000,
    )
    const observer = watch(root, () => {
      if (phase === 'in-transaction' && existsSync(marker)) finish()
    })
    child.once('exit', earlyExit)
    child.once('message', message => {
      if (phase === 'after-commit') {
        try {
          expect(message).toMatchObject({ result: { kind: 'ok' } })
          finish()
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      }
    })
    if (phase === 'in-transaction' && existsSync(marker)) finish()
  })
}
it.each([
  ['run', 'in-transaction'],
  ['run', 'after-commit'],
  ['probe', 'in-transaction'],
  ['probe', 'after-commit'],
])(
  'SIGKILL leaves a whole %s transaction at %s',
  async (action, phase) => {
    const initial = await openWorld()
    await initial.close()
    const marker = join(initial.root, 'inside-transaction')
    const child = fork(
      fileURLToPath(new URL('./crash-child.ts', import.meta.url)),
      [initial.root, marker, phase, action],
      { execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    )
    try {
      await crashPoint(child, initial.root, marker, phase)
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill('SIGKILL')
        await exited
      }
    }
    const reopened = await openWorld(initial.root)
    try {
      const health = await reopened.journal.health({
        systemScopeRef: scope,
        calendarId: run().command.address.calendarId,
      })
      expect(health).toMatchObject({ kind: 'ok' })
      if (health.kind !== 'ok') throw new Error('Expected recovered health')
      const expected = phase === 'after-commit' ? 1 : 0
      expect(health.value.pendingRuns).toHaveLength(action === 'run' ? expected : 0)
      expect(health.value.sources).toHaveLength(action === 'probe' ? expected : 0)
      if (action === 'run')
        expect(
          await reopened.journal.readRun({
            address: run().command.address,
            expectedFingerprint: run().command.expectedFingerprint,
          }),
        ).toEqual({ kind: 'ok', value: expected === 1 ? run() : null })
      else {
        const query = {
          systemScopeRef: scope,
          calendarId: run().command.address.calendarId,
          operationKey: 'crash-probe',
          fingerprint: 'a'.repeat(64),
        }
        expect(await reopened.journal.readProbe(query)).toEqual({
          kind: 'ok',
          value: expected === 1 ? health.value.sources[0] : null,
        })
        const due = await reopened.journal.due({
          systemScopeRef: scope,
          at: instantSchema.parse('2026-01-03T00:00:00.000Z'),
          limit: 10,
        })
        expect(due).toMatchObject({ kind: 'ok' })
        if (due.kind === 'ok') expect(due.value).toHaveLength(expected)
      }
    } finally {
      await reopened.close()
    }
  },
  30000,
)

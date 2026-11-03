import { fork } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { expect, it } from 'vitest'
import { command, openWorld } from './world.ts'

it.each(['in-transaction', 'after-commit'])(
  'SIGKILL %s reopens without half a publication',
  async phase => {
    const initial = await openWorld()
    expect(await initial.persistence.commitDisposition(command())).toMatchObject({
      kind: 'recorded',
    })
    await initial.close()
    const marker = join(initial.root, 'inside-transaction')
    const child = fork(
      fileURLToPath(new URL('./fixtures/crash-child.ts', import.meta.url)),
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
          reject(new Error(`Child did not reach crash point: ${stderr}`))
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
            expect(message).toMatchObject({ kind: 'result', result: { kind: 'recorded' } })
            finish()
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
      const exited = once(child, 'exit')
      child.kill('SIGKILL')
      await exited
    }
    const recovered = await openWorld(initial.root)
    try {
      const generation = phase === 'in-transaction' ? 1 : 2
      expect(
        await recovered.repository.getSnapshot({
          calendarId: command().address.calendarId,
          version: { kind: 'current' },
        }),
      ).toMatchObject({
        kind: 'ok',
        value: { versionId: `v${generation}`, publicationGeneration: generation },
      })
      const versions = await recovered.repository.listVersions({
        calendarId: command().address.calendarId,
        after: null,
        limit: 10,
      })
      const candidates = await recovered.repository.listCandidates({
        calendarId: command().address.calendarId,
        after: null,
        limit: 10,
      })
      const pending = await recovered.repository.listPendingReactions({
        systemScopeRef: 'public-calendar-supply',
        after: null,
        limit: 10,
      })
      for (const result of [versions, candidates, pending]) {
        expect(result.kind).toBe('ok')
        if (result.kind === 'ok') expect(result.value.items).toHaveLength(generation)
      }
      const second = command('v2', 1)
      expect(
        await recovered.persistence.observeOperation({
          address: second.address,
          expectedFingerprint: second.expectedFingerprint,
        }),
      ).toMatchObject({ kind: phase === 'in-transaction' ? 'notCommitted' : 'recorded' })
    } finally {
      await recovered.close()
    }
  },
  30000,
)

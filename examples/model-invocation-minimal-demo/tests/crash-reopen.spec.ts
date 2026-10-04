import { spawn } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createAcceptanceApplication, type AcceptanceEvent } from '../src/index.ts'
import { actor, deployment, evidence, PASSWORD, persisted } from './support.ts'

describe('AB-V7 actual process crash and real lease reopen', () => {
  for (const point of ['beforeConfirm', 'afterManifest', 'afterManifestShort'])
    it(`reopens after SIGKILL at ${point}`, async () => {
      const config = await deployment(`crash-${point}`)
      const input = join(dirname(config.databaseFile), 'crash-input.json')
      await writeFile(
        input,
        JSON.stringify({
          ...config,
          wait: { clockTimeoutMs: config.wait.clockTimeoutMs, pollMs: config.wait.pollMs },
        }),
        { mode: 0o600 },
      )
      const keysBefore = await Promise.all(Object.values(config.keys).map(path => readFile(path)))
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('./fixtures/crash.mjs', import.meta.url)),
          input,
          point === 'afterManifestShort' ? 'afterManifest' : point,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let stdout = '',
        stderr = ''
      child.stdout.on('data', bytes => {
        stdout += String(bytes)
      })
      child.stderr.on('data', bytes => {
        stderr += String(bytes)
      })
      const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve, reject) => {
          child.once('error', reject)
          child.once('close', (code, signal) => resolve({ code, signal }))
        },
      )
      expect(exit).toEqual({ code: null, signal: 'SIGKILL' })
      expect(JSON.parse(stdout)).toEqual({
        point: point === 'afterManifestShort' ? 'afterManifest' : point,
        pid: child.pid,
      })
      expect(stderr).toBe('')
      const crashed = persisted(config.databaseFile)
      expect(crashed.manifest).toBe(point === 'beforeConfirm' ? '0' : '1')
      expect(crashed.counts.account).toBe(0)
      let deadlineFailure: unknown
      if (point === 'afterManifestShort') {
        const short = createAcceptanceApplication(
          { ...config, wait: { ...config.wait, clockTimeoutMs: 1 } },
          { diagnostics: { record() {} } },
        )
        try {
          await short.ready
        } catch (error) {
          deadlineFailure = error instanceof Error && 'phase' in error ? error.phase : 'unknown'
        }
        expect(deadlineFailure).toBe('clockReady')
        expect((await short.close()).complete).toBe(true)
        expect(persisted(config.databaseFile).manifest).toBe('1')
        await evidence(`AB-V7-${point}`, {
          childPid: child.pid,
          exit,
          stdout,
          stderr,
          crashed,
          deadlineFailure,
          modelHttp: 0,
        })
        return
      }
      const events: AcceptanceEvent[] = []
      const reopened = createAcceptanceApplication(config, {
        diagnostics: { record: e => events.push(e) },
      })
      await reopened.ready
      if (point === 'afterManifest')
        expect(events.some(e => e.phase === 'clockReady' && e.outcome === 'waiting')).toBe(true)
      const readyState = persisted(config.databaseFile)
      expect(readyState.manifest).toBe('1')
      expect(readyState.counts.account).toBe(0)
      const current = await actor(reopened)
      expect(current.account).toBe(current.tenant.account)
      expect(await reopened.register('alice', PASSWORD)).toBe('identifier-taken')
      expect((await reopened.close()).complete).toBe(true)
      expect(await Promise.all(Object.values(config.keys).map(path => readFile(path)))).toEqual(
        keysBefore,
      )
      await evidence(`AB-V7-${point}`, {
        childPid: child.pid,
        exit,
        stdout,
        stderr,
        crashed,
        deadlineFailure,
        readyState,
        events,
        modelHttp: 0,
      })
    })
})

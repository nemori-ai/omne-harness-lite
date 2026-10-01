import { fork } from 'node:child_process'
import { once } from 'node:events'
import { expect, test } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { createAssemblyManifestStore } from '../src/index.ts'
import { database, input } from './support.ts'

test.each(['before', 'after'] as const)(
  'real SIGKILL %s commit preserves a whole old/new record and given retry identity',
  async when => {
    await database(async (storage, file) => {
      await storage.close()
      const child = fork(new URL('./crash-worker.mjs', import.meta.url), {
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      })
      const exited = once(child, 'exit')
      try {
        const stage = once(child, 'message', { signal: AbortSignal.timeout(10_000) })
        child.send({ file, when, body: writeJsonLossless(input(1, 'given', 'crash_given')) })
        expect((await stage)[0]).toEqual({
          stage: when === 'before' ? 'before_commit' : 'committed_before_ack',
        })
        expect(child.kill('SIGKILL')).toBe(true)
        await exited
        const reopened = await openStorage({ dialect: 'sqlite', file })
        try {
          const store = createAssemblyManifestStore(reopened)
          expect(await store.readHead('session')).toHaveProperty('head', when === 'before' ? 0 : 1)
          const retry = await store.append('session', 0, input(1, 'given', 'crash_given'))
          if (when === 'before')
            expect(retry).toEqual({ seq: 1, head: 1, evaluationRef: 'crash_given' })
          else
            expect(retry).toMatchObject({
              failure: 'alreadyRecorded',
              record: {
                session: 'session',
                seq: 1,
                evaluationRef: 'crash_given',
                tables: { tool: { filledAt: 1 } },
              },
            })
          expect(await store.readHead('session')).toHaveProperty('head', 1)
          await store.close()
        } finally {
          await reopened.close()
        }
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        await exited
      }
    })
  },
  20_000,
)

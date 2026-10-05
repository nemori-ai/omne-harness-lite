// @module-tag slow
// Six compositions open real Cordis providers, JSONL owners and result files.
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { compareInteger } from '@omne-harness-lite/session-log'
import {
  captureToolJournalValue,
  projectToolJournal,
} from '@omne-harness-lite/tool-execution-runtime'
import { actionIntegrationFixture } from './tool-action-integration-fixture.ts'
import { at, origin, scope } from './tool-driver-history-fixture.ts'
import { readToolDriverHistory } from '../src/tool-driver-history.ts'

type Fixture = Awaited<ReturnType<typeof actionIntegrationFixture>>
type Transition = 'run-ended' | 'attempt-replaced'

async function transition(f: Fixture, kind: Transition) {
  if (kind === 'attempt-replaced') {
    await f.f.attempt(2)
    return
  }
  const interrupted = f.f.model('message', {
    id: 'actual-run-interruption',
    type: 'system_reminder',
    nature: 'event',
    createdAt: at,
    source: { kind: 'interrupted', what: 'run', by: 'user', hadContent: false },
    blocks: [],
  })
  await f.f.append([
    interrupted,
    f.f.driver({
      kind: 'run_ended',
      run: origin.run,
      reason: 'cancelled',
      basis: [interrupted.dedupeKey],
      at,
    }),
  ])
}

for (const kind of ['run-ended', 'attempt-replaced'] as const)
  test.each(['before-A', 'after-A', 'old-tail-race'] as const)(
    `${kind}: %s preserves the terminal's actual commit boundary`,
    async order => {
      const entered = Promise.withResolvers<void>(),
        returned = Promise.withResolvers<string>()
      const executor = vi.fn(async () => {
        entered.resolve()
        return returned.promise
      })
      const f = await actionIntegrationFixture({ executor })
      let observer: { release(): void } | undefined
      try {
        const actions = await f.dispatch()
        if (actions.kind !== 'complete') throw new Error('actual admission unavailable')
        const runtime = f.current.assembly.ctx.toolRuntimeRegistry
        const submitted = await runtime.submit({
          access: f.current.toolAccess,
          scope,
          origin,
          adoption: f.f.adoption,
          call: f.f.calls[0]!,
          admissionToken: actions.admissions[0]!.token,
        })
        if (submitted.kind !== 'recorded') throw new Error('actual submission unavailable')
        const acquired = await runtime.acquire(f.current.toolAccess, submitted.execution)
        if (acquired.kind !== 'acquired') throw new Error('actual observer unavailable')
        observer = acquired.observer
        await entered.promise
        if (order === 'before-A') await transition(f, kind)
        if (order === 'old-tail-race') {
          const append = f.current.append.getMockImplementation()!
          let competed = false
          f.current.append.mockImplementation(async (...args) => {
            if (!competed && args[1].some(entry => entry.dedupeKey?.includes('execution_ended'))) {
              competed = true
              // Commit the real cross-domain change after A read its old expected tail.
              await transition(f, kind)
            }
            return append(...args)
          })
        }
        returned.resolve('captured-author-result')
        const ended = await acquired.observer.waitForEnd()
        expect(ended).toMatchObject({
          kind: 'found',
          snapshot: {
            origin,
            state: {
              phase: 'ended',
              terminal: { outcome: 'completed', result: 'captured-author-result' },
            },
          },
        })
        if (order === 'after-A') await transition(f, kind)
        const prefix = await f.f.prefix(),
          common = readToolDriverHistory(prefix),
          projected = projectToolJournal(scope, prefix.entries)
        if ('unavailable' in common || 'invalid' in projected)
          throw new Error('actual common prefix unavailable')
        const run = common.runs.get(origin.run)!
        const terminal = projected.executions.get(submitted.execution.callId)!.terminal!
        expect(terminal.value.account.late).toBe(order === 'after-A' ? undefined : true)
        expect(terminal.value.account.callId).toBe(submitted.execution.callId)
        expect(terminal.value.account.initiator).toEqual(scope.tenant)
        expect(terminal.value.delivery.result.blocks).toMatchObject([
          { kind: 'text', text: 'captured-author-result' },
        ])
        const boundary = kind === 'run-ended' ? run.end! : run.latest!
        expect(compareInteger(terminal.entry.position, boundary.entry.position)).toBe(
          order === 'after-A' ? -1 : 1,
        )
        const attempts = f.current.append.mock.calls.flatMap(([, entries]) =>
          entries.filter(entry => entry.dedupeKey === terminal.key),
        )
        expect(attempts).toHaveLength(order === 'old-tail-race' ? 2 : 1)
        if (order === 'old-tail-race') {
          const candidates = attempts.map(entry => {
            const payload = entry.payload
            if (payload === null || typeof payload !== 'object')
              throw new Error('actual terminal payload unavailable')
            const value = captureToolJournalValue(Reflect.get(payload, 'value'))
            if ('invalid' in value || value.kind !== 'execution_ended')
              throw new Error('actual terminal candidate unavailable')
            return value.account.late
          })
          expect(candidates).toEqual([undefined, true])
        }
        // Verify the physical append, rather than inferring atomicity from projected positions.
        const files = (await readdir(f.f.dir, { recursive: true })).filter(file =>
          file.endsWith('entries.jsonl'),
        )
        expect(files).toHaveLength(1)
        const batches = (await readFile(join(f.f.dir, files[0]!), 'utf8'))
          .trimEnd()
          .split('\n')
          .map(line => JSON.parse(line) as { entries: { dedupeKey?: string; payload: unknown }[] })
        const terminalBatches = batches.filter(batch =>
          batch.entries.some(entry => entry.dedupeKey === terminal.key),
        )
        expect(terminalBatches).toHaveLength(1)
        expect(terminalBatches[0]!.entries).toHaveLength(1)
        expect(terminalBatches[0]!.entries[0]!.payload).toMatchObject({
          value: {
            kind: 'execution_ended',
            terminal: terminal.value.terminal,
            account: terminal.value.account,
            delivery: terminal.value.delivery,
          },
        })
        expect(executor).toHaveBeenCalledTimes(1)
      } finally {
        returned.resolve('cleanup-result')
        observer?.release()
        await f.close()
      }
    },
  )

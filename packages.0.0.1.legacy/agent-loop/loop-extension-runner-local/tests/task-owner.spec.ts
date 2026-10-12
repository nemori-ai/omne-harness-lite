import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { judgePositionedSubject, type Conclusion } from '@omne-harness-lite/loop-extension'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { createRunnerTaskOwner } from '../src/task-owner.ts'
import {
  prepareRunnerConclusion,
  type RunnerLogBinding,
} from '@omne-harness-lite/loop-extension-runner'

const tenant = parseTenantId({ organization: 'owner-org', account: 'owner-account' })
const session = parseOpaqueIdentifier('owner-session', 'SessionRef')
const subject = judgePositionedSubject({
  position: 'before_persist_message',
  subject: {
    message: { id: 'owner-message', type: 'user', blocks: [], createdAt: '2026-09-29T00:00:00Z' },
    producer: 'user',
  },
})
if (!('ok' in tenant) || !('ok' in session) || !('ok' in subject))
  throw new Error('owner fixture rejected')
const acceptedTenant = tenant.ok
const acceptedSession = session.ok
const acceptedSubject = subject.ok
const binding: RunnerLogBinding = {
  session: acceptedSession,
  tenant: acceptedTenant,
  logGeneration: 'old-generation',
}

function candidate(at: string) {
  const value: Conclusion = {
    extension: 'owner-extension',
    position: 'before_persist_message',
    power: 'observe',
    at,
    output: { kind: 'observed' },
  }
  const prepared = prepareRunnerConclusion({
    session: acceptedSession,
    tenant: acceptedTenant,
    execution: { kind: 'noRun' },
    anchor: 'owner-message',
    occurrence: { kind: 'final' },
    value,
    reminders: [],
  })
  if (!('entry' in prepared)) throw new Error('entry fixture rejected')
  return prepared.entry
}

describe('runner task owner and actual stopped SQL journal recovery', () => {
  it('retains an append whose receipt classifier fails and consumes a later rejection', async () => {
    const owner = createRunnerTaskOwner(binding)
    const proposed = candidate('2026-09-29T00:00:00Z')
    const key = proposed.dedupeKey
    if (key === undefined) throw new Error('candidate missing key')
    const classified = owner.start({
      kind: 'append',
      candidate: { binding, entry: proposed, subject: acceptedSubject },
      execute: async () => ({ failure: 'unavailable' as const }),
      unknown: () => {
        throw new Error('classifier failed')
      },
    })
    if ('unavailable' in classified) throw new Error('append admission failed')
    await classified.completion
    await Promise.resolve()
    expect(owner.hasUnknown(binding, key)).toBe(true)
    const rejecting = owner.start({
      kind: 'append',
      candidate: { binding, entry: proposed, subject: acceptedSubject },
      execute: async () => {
        throw new Error('late write rejection')
      },
    })
    if ('unavailable' in rejecting) throw new Error('second append admission failed')
    await expect(rejecting.completion).rejects.toThrow('late write rejection')
    await Promise.resolve()
    owner.closeAdmission()
    const recovered = await owner.reconcileStoppedLog({ binding, readByKey: async () => [] })
    expect(recovered).toEqual([{ kind: 'absent' }, { kind: 'absent' }])
    await owner.drain()
    expect(owner.hasUnknown(binding, key)).toBe(false)
  })

  for (const winner of [false, true]) {
    it(
      winner
        ? 'adopts a legal different winner after physical close'
        : 'recognizes the exact candidate after physical close',
      async () => {
        const root = resolve(process.cwd(), '../../../tmp/runner-public')
        await mkdir(root, { recursive: true })
        const dir = await mkdtemp(join(root, 'unknown-'))
        const ownership = { current: 'owner-test', observeExit: async () => 'exited' as const }
        const log = await openSqlLogFixture({ dir: dir })
        const owner = createRunnerTaskOwner(binding)
        const proposed = candidate('2026-09-29T00:00:00Z')
        const actual = winner ? candidate('2026-09-29T00:00:01Z') : proposed
        const key = proposed.dedupeKey
        if (key === undefined) throw new Error('candidate missing key')
        try {
          const started = owner.start({
            kind: 'append',
            candidate: { binding, entry: proposed, subject: acceptedSubject },
            execute: async () => {
              const written = await log.append(
                acceptedSession,
                [actual],
                { kind: 'unfenced' },
                { kind: 'unconditional' },
              )
              if (!('positions' in written)) throw new Error('physical append failed')
              return { failure: 'unavailable' } as const // The receipt was lost after commit.
            },
            unknown: result => result.failure === 'unavailable',
          })
          if ('unavailable' in started) throw new Error('task owner rejected admission')
          expect(await started.completion).toEqual({ failure: 'unavailable' })
          await Promise.resolve()
          expect(owner.hasUnknown(binding, key)).toBe(true)
          let drained = false
          const draining = owner.drain().then(() => {
            drained = true
          })
          await Promise.resolve()
          expect(drained).toBe(false)
          owner.closeAdmission()
          const refused = owner.start({ kind: 'read', execute: async () => 1 })
          expect(refused).toEqual({ unavailable: true })
          await log.close()
          const reopened = await openSqlLogFixture({ dir: dir })
          try {
            const wrongGeneration = await owner.reconcileStoppedLog({
              binding: { ...binding, logGeneration: 'wrong-generation' },
              readByKey: async () => [],
            })
            expect(wrongGeneration).toEqual({ unavailable: true })
            expect(owner.hasUnknown(binding, key)).toBe(true)
            const recovered = await owner.reconcileStoppedLog({
              binding,
              readByKey: async searched => {
                const read = await reopened.readByKey(acceptedSession, searched)
                return 'entries' in read ? read.entries : { unavailable: true }
              },
            })
            expect(recovered).toMatchObject([{ kind: winner ? 'winner' : 'same' }])
            await draining
            expect(drained).toBe(true)
            expect(owner.hasUnknown(binding, key)).toBe(false)
          } finally {
            await reopened.close()
          }
        } finally {
          await rm(dir, { recursive: true, force: true })
        }
      },
    )
  }
})

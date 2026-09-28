import { describe, expect, it } from 'vitest'
import { readFailureSubject } from '../src/failure-subject.ts'
import { readSettlementPrefix } from '../src/settlement-prefix.ts'
import type { SettlementTask, SettlementTaskKind } from '../src/settlement-types.ts'
import { selectionHost } from './session-selection-fixture.ts'

describe('RT7 S-76 failure subject from one complete prefix', () => {
  it('does not consult or invent runner history without a failed response', async () => {
    const host = await selectionHost()
    const created = host.create()
    await created.component.close()
    const acquired = created.owner.acquire(1)
    if (!('registration' in acquired)) throw new Error('read registration unavailable')
    const registration = acquired.registration
    if (registration === undefined) throw new Error('read registration missing')
    const tasks: SettlementTask<unknown>[] = []
    try {
      const read = await readSettlementPrefix({
        binding: created.input.binding,
        registration: {
          start<T>(kind: SettlementTaskKind, work: (signal: AbortSignal) => Promise<T>) {
            const task = registration.start(kind, work)
            tasks.push(task)
            return task
          },
          release: registration.release,
        },
      })
      if (!('prefix' in read)) throw new Error(`real prefix unavailable: ${read.reason}`)
      let called = false
      expect(
        readFailureSubject({
          prefix: read.prefix,
          callId: 'absent-call',
          dispatches: [],
          source() {
            called = true
            return { unavailable: true }
          },
        }),
      ).toEqual({ unavailable: true })
      expect(called).toBe(false)
    } finally {
      await Promise.all(tasks.map(task => task.stopped))
      registration.release()
      await host.close()
    }
  })
})

import { expect, test } from 'vitest'
import { createContextJournal } from '../src/journal.ts'
import { inspectContextLogEntry } from '../src/history.ts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { ContextEvent } from '../src/journal-types.ts'
import { compareInteger, type SessionLog, type LogEntry } from '@omne-harness-lite/session-log'
import { host, init, scope, identityRegistration } from './fixture.ts'

test('a real tail-condition rejection settles the original append and allows a fresh retry', async () => {
  const h = await host()
  try {
    await init(h)
    h.owner.closeAdmission()
    await h.owner.drain()
    let interleave = true
    const journal = createContextJournal(
      {
        ...h.log,
        async append(...args) {
          if (interleave) {
            interleave = false
            await h.log.append(
              scope.session,
              [{ tenant: scope.tenant, readKeys: [], payload: { unrelated: true } }],
              { kind: 'unfenced' },
              { kind: 'unconditional' },
            )
          }
          return h.log.append(...args)
        },
      },
      h.storage,
    )
    const before = await journal.read(scope)
    if ('unavailable' in before) throw new Error('fixture unavailable')
    const event: ContextEvent = {
      codec: 'runtime-context/1',
      scope,
      revision: 'after-rejection',
      previous: before.state.registrationRevision,
      kind: 'registered',
      registration: { ...identityRegistration, key: 'public', required: false },
    }
    expect(await journal.commit(scope, before.state, event)).toBe('unavailable')
    expect(journal.unresolved).toBe(0)
    await journal.drain()
    const fresh = await journal.read(scope)
    if ('unavailable' in fresh) throw new Error('fresh prefix unavailable')
    expect(fresh.state.registrations.has('public')).toBe(false)
    expect(await journal.commit(scope, fresh.state, event)).toBe('applied')
    expect(journal.unresolved).toBe(0)
    await journal.drain()
  } finally {
    await h.close()
  }
})

for (const observation of ['absent', 'newTail', 'differentBody'] as const)
  test(`an unknown original log append stays owned after ${observation}, until its complete original event is visible`, async () => {
    const h = await host()
    try {
      await init(h)
      h.owner.closeAdmission()
      await h.owner.drain()
      let hidden = false
      let original: LogEntry | undefined
      let appends = 0
      const log: SessionLog = {
        ...h.log,
        async append(...args) {
          appends++
          const result = await h.log.append(...args)
          if ('failure' in result) throw new Error('original physical append failed')
          const read = await h.log.readSince(scope.session, 0)
          if ('failure' in read) throw new Error('original physical receipt unavailable')
          original = read.entries.at(-1)
          hidden = true
          return { failure: 'unavailable' }
        },
        async readSince(session, after) {
          const result = await h.log.readSince(session, after)
          if ('failure' in result || !hidden || !original) return result
          const held = original
          const entries = result.entries.filter(
            entry => compareInteger(entry.position, held.position) !== 0,
          )
          if (observation === 'differentBody') {
            const inspected = inspectContextLogEntry(scope, held)
            if (!('event' in inspected) || inspected.event.kind !== 'registered')
              throw new Error('original registration envelope missing')
            const payload = copyJsonValue({
              ...inspected.event,
              registration: { ...identityRegistration, key: 'secret', required: false },
            })
            if (!('ok' in payload)) throw new Error('fault payload is not JSON')
            entries.push({
              ...held,
              payload: payload.ok,
            })
          }
          return { entries, tail: result.tail }
        },
      }
      const journal = createContextJournal(log, h.storage)
      const before = await journal.read(scope)
      if ('unavailable' in before) throw new Error('fixture prefix unavailable')
      const event: ContextEvent = {
        codec: 'runtime-context/1',
        scope,
        revision: 'original-registration',
        previous: before.state.registrationRevision,
        kind: 'registered',
        registration: { ...identityRegistration, key: 'public', required: false },
      }
      expect(await journal.commit(scope, before.state, event)).toBe('unavailable')
      if (observation === 'newTail') {
        await h.log.append(
          scope.session,
          [{ tenant: scope.tenant, readKeys: [], payload: { note: 'unrelated successor' } }],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
      }
      expect(await journal.read(scope)).toEqual({ unavailable: true })
      expect(journal.unresolved).toBe(1)
      await expect(journal.drain()).rejects.toThrow('unresolved writes')
      expect(journal.unresolved).toBe(1)
      expect(appends).toBe(1)
      hidden = false
      await journal.drain()
      expect(journal.unresolved).toBe(0)
      const recognized = await journal.read(scope)
      expect(recognized).toMatchObject({ state: { registrationRevision: event.revision } })
      if ('unavailable' in recognized) throw new Error('original receipt remained unavailable')
      expect(recognized.state.registrations.has('public')).toBe(true)
      expect(recognized.state.registrations.has('secret')).toBe(false)
      expect(appends).toBe(1)
    } finally {
      await h.close()
    }
  })

import { afterEach, describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { EntryId, InputId, SessionFailure } from '@omne-harness/session-contract'
import { TESTING_SOURCES, succeeded } from '@omne-harness/session-contract/testing'
import { memoryBackend, type BackendFactory } from './fixtures/backends.ts'
import { failedAfterTaking, read } from './fixtures/failed-run.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

async function service(backend: BackendFactory = memoryBackend): Promise<Harness> {
  const h = await harness({ backend })
  open.push(h)
  await h.create()
  return h
}

function failureOf(answer: unknown): SessionFailure {
  expect(answer, JSON.stringify(answer)).toHaveProperty('failure')
  return (answer as { failure: SessionFailure }).failure
}

const work = (h: Harness) => h.faces('intake').work
const pending = (h: Harness, after: EntryId | null = null, limit = 10) =>
  work(h).readPending({ ...h.access(), after, limit })
const fate = (h: Harness, input: string, access = h.access()) =>
  work(h).readInputFate({ ...access, input: input as InputId })

// A backend whose history reads answer as given; everything else is the memory pair.
function historyAs(page: 'unavailable' | 'empty'): BackendFactory {
  return {
    name: `memory pair, history ${page}`,
    open: async accessCheck => {
      const backend = await memoryBackend.open(accessCheck)
      return {
        ...backend,
        delegated: {
          bind: checked => {
            const view = backend.delegated.bind(checked)
            const begin: typeof view.history.begin = async input => {
              const real = await view.history.begin(input)
              if (!input.kinds.includes('intake.routed')) return real
              if (page === 'unavailable')
                return fail({ kind: 'unavailable', owner: 'history', diagnostic: 'down' })
              return 'ok' in real ? { ok: { ...real.ok, entries: [], next: null } } : real
            }
            return { ...view, history: { ...view.history, begin } }
          },
        },
      }
    },
  }
}

describe('readPending: what a session accepted and no Run took yet (C8)', () => {
  it('lists each pending input with its source, role, wake and a preview, oldest first', async () => {
    const h = await service()
    await h.accept('input-1')
    await h.accept('input-2')
    const page = succeeded(await pending(h), 'readPending')
    expect(page.next).toBeNull()
    expect(page.inputs).toMatchObject([
      {
        input: 'input-1',
        source: { name: TESTING_SOURCES.person, label: 'Test person' },
        role: 'user',
        wakes: true,
        preview: 'input input-1',
      },
      { input: 'input-2', preview: 'input input-2' },
    ])
    expect(BigInt(page.inputs[0]!.position)).toBeLessThan(BigInt(page.inputs[1]!.position))
  })

  it('pages by the position of the acceptance and asks the access check for every page', async () => {
    const h = await service()
    for (const name of ['a', 'b', 'c']) await h.accept(name)
    const before = h.checks.count()
    const first = succeeded(await pending(h, null, 2), 'first page')
    expect(first.inputs.map(item => item.input)).toEqual(['a', 'b'])
    expect(first.next).toBe(first.inputs[1]!.position)
    const second = succeeded(await pending(h, first.next, 2), 'second page')
    expect(second.inputs.map(item => item.input)).toEqual(['c'])
    expect(second.next).toBeNull()
    expect(h.checks.count()).toBe(before + 2)
    h.checks.script({ kind: 'denied' })
    expect(failureOf(await pending(h, first.next, 2))).toEqual({
      kind: 'denied',
      action: 'readPending',
    })
  })

  it('answers an empty page for a session with nothing pending', async () => {
    const h = await service()
    expect(succeeded(await pending(h), 'readPending')).toEqual({ inputs: [], next: null })
  })

  it('answers unavailable, never an empty page, when the log cannot be read or does not show the input', async () => {
    for (const page of ['unavailable', 'empty'] as const) {
      const h = await service(historyAs(page))
      await h.accept('input-1')
      expect(failureOf(await pending(h)), page).toMatchObject({ kind: 'unavailable' })
    }
  })

  it('refuses a limit or a position that is not one', async () => {
    const h = await service()
    for (const limit of [0, 101, 1.5, Number.NaN])
      expect(failureOf(await pending(h, null, limit))).toMatchObject({
        kind: 'invalid',
        field: 'limit',
      })
    expect(failureOf(await pending(h, 'x' as EntryId))).toMatchObject({
      kind: 'invalid',
      field: 'after',
    })
  })

  it('an input a failed Run gave back is pending again', async () => {
    const { h } = await failedAfterTaking(open)
    const page = succeeded(await pending(h), 'readPending')
    expect(page.inputs.map(item => item.input)).toEqual(['input-1'])
  })
})

describe('readInputFate: where one input is, from the log alone (C7, SE-33)', () => {
  it('pending for an accepted input; pending with the Run it came back from after a failure', async () => {
    const h = await service()
    await h.accept('input-1')
    expect(succeeded(await fate(h, 'input-1'), 'fate')).toEqual({
      kind: 'pending',
      returnedFrom: null,
    })
    const failed = await failedAfterTaking(open)
    const snapshot = await read(failed.h)
    const run = snapshot.run.kind === 'terminal' ? snapshot.run.terminal.run : null
    expect(run).not.toBeNull()
    expect(succeeded(await fate(failed.h, 'input-1'), 'fate')).toEqual({
      kind: 'pending',
      returnedFrom: run,
    })
  })

  it('an input the session never accepted answers byte for byte as a session the caller may not read', async () => {
    const h = await service()
    await h.accept('input-1')
    const unknown = await fate(h, 'no-such-input')
    const foreign = await fate(h, 'input-1', h.other())
    expect(failureOf(unknown)).toEqual({ kind: 'denied', action: 'readInputFate' })
    expect(JSON.stringify(unknown)).toBe(JSON.stringify(foreign))
  })

  it('answers unavailable when the log cannot be read', async () => {
    const h = await service(historyAs('unavailable'))
    await h.accept('input-1')
    expect(failureOf(await fate(h, 'input-1'))).toMatchObject({ kind: 'unavailable' })
  })
})

describe('the reads change nothing in the session they read (SE-34)', () => {
  it('leaves the revision, the idle start and the log as they were', async () => {
    const h = await service()
    await h.accept('input-1')
    const before = await read(h)
    succeeded(await pending(h), 'readPending')
    succeeded(await fate(h, 'input-1'), 'readInputFate')
    expect(succeeded(await work(h).readWaitingCalls(h.access()), 'readWaitingCalls')).toEqual([])
    const after = await read(h)
    expect(after.revision).toBe(before.revision)
    expect(after.idle).toEqual(before.idle)
    expect(after).toEqual(before)
  })

  it('only the intake caller reads them', async () => {
    const h = await service()
    const reader = h.faces('reader').work
    expect(
      failureOf(await reader.readPending({ ...h.access(), after: null, limit: 1 })),
    ).toMatchObject({
      kind: 'denied',
    })
    expect(failureOf(await reader.readWaitingCalls(h.access()))).toMatchObject({ kind: 'denied' })
    expect(
      failureOf(await reader.readInputFate({ ...h.access(), input: 'input-1' as InputId })),
    ).toMatchObject({ kind: 'denied' })
  })
})

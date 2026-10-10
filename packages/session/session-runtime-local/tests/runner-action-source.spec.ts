import { expect, it, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import type { AuthorizationContext } from '@omne-harness-lite/tool-admission'
import type { BorrowedRunJournal } from '../src/run-journal-types.ts'
import { readSessionRunnerAction } from '../src/index.ts'

function fixture() {
  const generation = {}
  let current: object | null = generation
  const readPrefix = vi.fn<BorrowedRunJournal['readPrefix']>(async () => ({
    failure: 'unavailable',
  }))
  const journal: BorrowedRunJournal = {
    scope: {
      tenant: unwrap(parseTenantId({ organization: 'org', account: 'account' })),
      session: unwrap(parseOpaqueIdentifier('session', 'SessionRef')),
    },
    run: 'run',
    generation,
    currentGeneration: () => current,
    readPrefix,
    get log(): never {
      throw new Error('action reading must not append')
    },
    withReadUnit: async () => {
      throw new Error('action reading must use its original journal')
    },
    close: vi.fn(async () => {}),
  }
  return {
    journal,
    readPrefix,
    revoke() {
      current = null
    },
    request: { manifest: 'session', run: 'run', attempt: 1, assistantMessage: 'reply' },
    options: {
      journal,
      ownerGeneration: 'original-owner',
      access: Object.freeze({}) as SessionAccess,
      admission: { grants: Object.freeze({}) as AuthorizationContext, runMode: 'never' as const },
    },
  }
}

it.each(['manifest', 'run'] as const)(
  'rejects another %s before reading the original journal',
  async field => {
    const f = fixture()
    expect(await readSessionRunnerAction(f.options, { ...f.request, [field]: 'foreign' })).toEqual({
      failure: 'invalidInput',
    })
    expect(f.readPrefix).not.toHaveBeenCalled()
    expect(f.journal.close).not.toHaveBeenCalled()
  },
)

it('refuses a withdrawn original journal without reading', async () => {
  const f = fixture()
  f.revoke()
  expect(await readSessionRunnerAction(f.options, f.request)).toEqual({ failure: 'unavailable' })
  expect(f.readPrefix).not.toHaveBeenCalled()
})

it('does not publish a read after its original generation was withdrawn', async () => {
  const f = fixture()
  const read = Promise.withResolvers<Awaited<ReturnType<BorrowedRunJournal['readPrefix']>>>()
  f.readPrefix.mockReturnValue(read.promise)
  const pending = readSessionRunnerAction(f.options, f.request)
  f.revoke()
  read.resolve({
    entries: [],
    tail: 0,
    source: { ...f.journal.scope, journalGeneration: 'journal', tail: 0 },
  })
  expect(await pending).toEqual({ failure: 'unavailable' })
  expect(f.readPrefix).toHaveBeenCalledOnce()
  expect(f.journal.close).not.toHaveBeenCalled()
})

it('retains an unexpected original read failure instead of reporting a normal denial', async () => {
  const f = fixture()
  const failure = new Error('original read failed')
  f.readPrefix.mockRejectedValue(failure)
  await expect(readSessionRunnerAction(f.options, f.request)).rejects.toBe(failure)
  expect(f.readPrefix).toHaveBeenCalledOnce()
})

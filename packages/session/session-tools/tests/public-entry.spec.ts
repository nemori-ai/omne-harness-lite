import { expect, it } from 'vitest'

it('exposes the tool module, its author, the read port and the command contracts', async () => {
  const root = (await import('@omne-harness/session-tools')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'SEARCHABLE_KINDS',
      'attachSessions',
      'createSessionsAuthor',
      'sessionsAdoption',
      'sessionsCommandNames',
      'sessionsContract',
      'sessionsOf',
      'sessionsParameterCodec',
      'sessionsToolModule',
    ].sort(),
  )
})

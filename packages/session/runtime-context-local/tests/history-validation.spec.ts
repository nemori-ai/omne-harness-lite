import { expect, test } from 'vitest'
import { ContextHistoryInvalid, projectContext } from '../src/journal.ts'
import { host, init, scope } from './fixture.ts'

test('replay and public history inspection agree on the owned event envelope', async () => {
  const h = await host()
  try {
    await init(h)
    const result = await h.log.readSince(scope.session, 0)
    if ('failure' in result || !result.entries[0]) throw new Error('log fixture missing')
    const entry = result.entries[0]
    expect(projectContext(scope, [entry], result.tail).seed).toBeDefined()
    for (const invalid of [
      { ...entry, dedupeKey: 'context:wrong' },
      { ...entry, readKeys: [] },
      { ...entry, payload: { codec: 'runtime-context' } },
      { ...entry, payload: { codec: 'runtime-context/unsupported' } },
      { ...entry, position: 0 },
    ])
      expect(() => projectContext(scope, [invalid], result.tail)).toThrow(ContextHistoryInvalid)
    const unrelated = {
      ...entry,
      dedupeKey: 'other',
      readKeys: [],
      payload: { text: 'ordinary record' },
    }
    expect(projectContext(scope, [entry, unrelated], result.tail).registrations.size).toBe(1)
  } finally {
    await h.close()
  }
})

import { expect, test } from 'vitest'
import { access, assertFinished, ref, scope, submitFixture } from './runtime-submit-fixture.ts'

test('factory configuration fixes the fallback result storage and original writer receiver', async () => {
  const f = await submitFixture()
  try {
    f.config.resultStorage = 'replacement-results'
    await f.runtime.ready
    expect(await f.runtime.operations.submit(f.submitted)).toEqual({
      kind: 'recorded',
      execution: ref,
    })
    await assertFinished(f, { outcome: 'completed', result: 'factory-result' }, true)
    expect(f.available).not.toHaveBeenCalled()
    expect(f.bindWriter.mock.calls).toEqual([[access, ref, 'factory-results']])
    expect(f.bindWriter.mock.contexts).toEqual([f.dependencies.results])
  } finally {
    await f.close()
  }
})

test('declared storage is checked then bound without adopting an alternate readable storage', async () => {
  const attachment = {
    storage: 'declared-results',
    key: 'attachment-one',
    mediaType: 'text/plain',
    bytes: 5,
    name: 'note.txt',
  }
  const f = await submitFixture({
    storage: 'declared',
    executor: async (_args, ports) => {
      expect(ports.attachments).toBeDefined()
      if (!ports.attachments) throw new Error('declared attachment facility missing')
      expect(
        await ports.attachments.putAttachment(
          'note',
          Buffer.from('hello'),
          'text/plain',
          'note.txt',
        ),
      ).toEqual({ kind: 'stored', reference: attachment })
      return 'factory-result'
    },
  })
  try {
    await f.runtime.ready
    expect(await f.runtime.operations.submit(f.submitted)).toEqual({
      kind: 'recorded',
      execution: ref,
    })
    await assertFinished(f, { outcome: 'completed', result: 'factory-result' }, true)
    expect(f.available.mock.calls).toEqual([[access, scope, 'declared-results']])
    expect(f.bindWriter.mock.calls).toEqual([[access, ref, 'declared-results']])
    expect(f.available.mock.contexts).toEqual([f.dependencies.results])
    expect(f.bindWriter.mock.contexts).toEqual([f.dependencies.results])
    expect(f.trace.indexOf('available')).toBeLessThan(f.trace.indexOf('bindWriter'))
    expect(f.putAttachment.mock.calls).toEqual([
      ['note', Buffer.from('hello'), 'text/plain', 'note.txt'],
    ])
    expect(f.putAttachment.mock.contexts).toEqual([f.writer])
  } finally {
    await f.close()
  }
})

for (const failure of ['configuredBind', 'declaredAvailable', 'declaredBind'] as const) {
  test(`${failure} refusal prevents start, author and result recording without fallback`, async () => {
    const f = await submitFixture({
      storage: failure === 'configuredBind' ? 'configured' : 'declared',
    })
    try {
      await f.runtime.ready
      if (failure === 'declaredAvailable')
        f.available.mockResolvedValue({ kind: 'rejected', reason: 'storageUnavailable' })
      else f.bindWriter.mockResolvedValue({ kind: 'rejected', reason: 'storageUnavailable' })
      expect(await f.runtime.operations.submit(f.submitted)).toEqual({
        kind: 'recorded',
        execution: ref,
      })
      await assertFinished(
        f,
        { outcome: 'unavailable', reason: 'result_storage_unavailable' },
        false,
      )
      expect(f.bindContext).toHaveBeenCalledTimes(1)
      expect(f.implementation).not.toHaveBeenCalled()
      expect(f.recordResult).not.toHaveBeenCalled()
      expect(f.available).toHaveBeenCalledTimes(failure === 'configuredBind' ? 0 : 1)
      expect(f.bindWriter).toHaveBeenCalledTimes(failure === 'declaredAvailable' ? 0 : 1)
      expect(f.bindWriter.mock.calls).toEqual(
        failure === 'declaredAvailable'
          ? []
          : [[access, ref, failure === 'configuredBind' ? 'factory-results' : 'declared-results']],
      )
    } finally {
      await f.close()
    }
  })
}

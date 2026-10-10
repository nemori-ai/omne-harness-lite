import { expect, test } from 'vitest'
import { access, assertFinished, ref, submitFixture } from './runtime-submit-fixture.ts'

test('public factory executes the selected implementation and recognizes duplicate submission', async () => {
  const f = await submitFixture()
  try {
    await f.runtime.ready
    expect(await f.runtime.operations.submit(f.submitted)).toEqual({
      kind: 'recorded',
      execution: ref,
    })
    await assertFinished(f, { outcome: 'completed', result: 'factory-result' }, true)
    expect(f.implementation).toHaveBeenCalledTimes(1)
    expect(f.implementation.mock.calls[0]?.[0]).toEqual({ value: 'captured' })
    expect(f.acquire).toHaveBeenCalledWith(f.selected)
    expect(await f.runtime.operations.submit(f.submitted)).toEqual({
      kind: 'recorded',
      execution: ref,
    })
    await f.runtime.idle()
    expect(f.implementation).toHaveBeenCalledTimes(1)
    expect(f.recordResult).toHaveBeenCalledTimes(1)
    expect(f.append.mock.calls.flatMap(call => call[1])).toHaveLength(3)
    expect(await f.runtime.operations.acquire(Object.freeze({}) as typeof access, ref)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
  } finally {
    await f.close()
  }
})

test('withdrawn registration keeps adopted history but never enters the author', async () => {
  const f = await submitFixture()
  try {
    await f.runtime.ready
    f.withdraw()
    expect(await f.runtime.operations.submit(f.submitted)).toEqual({
      kind: 'recorded',
      execution: ref,
    })
    await assertFinished(f, { outcome: 'unavailable', reason: 'unavailable' }, false)
    expect(f.acquire).toHaveBeenCalledWith(f.selected)
    expect(f.implementation).not.toHaveBeenCalled()
    expect(f.bindContext).not.toHaveBeenCalled()
    expect(f.bindWriter).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

for (const decision of ['no_such_entry', 'unparseable'] as const) {
  test(`final ${decision} needs no token and records a complete terminal without selecting an implementation`, async () => {
    const f = await submitFixture({ decision })
    try {
      await f.runtime.ready
      expect(await f.runtime.operations.submit(f.submitted)).toEqual({
        kind: 'recorded',
        execution: ref,
      })
      await assertFinished(
        f,
        decision === 'unparseable'
          ? { outcome: 'failed', code: 'unparseable' }
          : { outcome: 'unavailable', reason: 'no_such_entry' },
        false,
      )
      expect(f.verifyToken).not.toHaveBeenCalled()
      expect(f.acquire).not.toHaveBeenCalled()
      expect(f.implementation).not.toHaveBeenCalled()
      expect(f.bindContext).not.toHaveBeenCalled()
      expect(f.bindWriter).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  })
}

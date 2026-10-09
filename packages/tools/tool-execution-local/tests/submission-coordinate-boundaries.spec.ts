import { expect, test } from 'vitest'
import { request } from './execution-owner-fixture.ts'
import { admissionFixture } from './submission-boundaries-fixture.ts'

test.each([
  { label: 'tenant organization', location: 'tenant', key: 'organization', value: '' },
  { label: 'tenant account', location: 'tenant', key: 'account', value: '' },
  { label: 'session', location: 'scope', key: 'session', value: '' },
  { label: 'Run', location: 'origin', key: 'run', value: '' },
  { label: 'assistant message', location: 'origin', key: 'assistantMessage', value: '' },
  { label: 'attempt', location: 'origin', key: 'attempt', value: 0 },
  { label: 'adoption', location: 'root', key: 'adoption', value: '' },
  { label: 'admission token', location: 'root', key: 'admissionToken', value: 42 },
])('invalid $label is rejected before authorization or journal lookup', async invalid => {
  const f = await admissionFixture()
  const supplied = {
    ...request,
    scope: { ...request.scope, tenant: { ...request.scope.tenant } },
    origin: { ...request.origin },
  }
  const target =
    invalid.location === 'tenant'
      ? supplied.scope.tenant
      : invalid.location === 'scope'
        ? supplied.scope
        : invalid.location === 'origin'
          ? supplied.origin
          : supplied
  Reflect.set(target, invalid.key, invalid.value)
  try {
    expect(await f.check(supplied)).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    expect(f.authorize).not.toHaveBeenCalled()
    expect(f.read).not.toHaveBeenCalled()
    expect(f.admission).not.toHaveBeenCalled()
    expect(f.verifyToken).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

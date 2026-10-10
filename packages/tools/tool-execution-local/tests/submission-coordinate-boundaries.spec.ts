import { expect, test, vi } from 'vitest'
import { fixture } from './execution-owner-fixture.ts'
import { capturePreparedExecution } from '../src/prepared-submission.ts'

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
  const f = await fixture()
  const verify = vi.spyOn(f.admission, 'verifyToken')
  const supplied = {
    ...f.prepared,
    ref: { ...f.prepared.ref, tenant: { ...f.prepared.ref.tenant } },
    origin: { ...f.prepared.origin },
    selected: { ...f.prepared.selected },
  }
  const target =
    invalid.location === 'tenant'
      ? supplied.ref.tenant
      : invalid.location === 'scope'
        ? supplied.ref
        : invalid.location === 'origin'
          ? supplied.origin
          : invalid.key === 'adoption'
            ? supplied.selected
            : supplied
  Reflect.set(target, invalid.key, invalid.value)
  try {
    expect(capturePreparedExecution(supplied)).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    expect(f.authorize).not.toHaveBeenCalled()
    expect(f.readSince).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

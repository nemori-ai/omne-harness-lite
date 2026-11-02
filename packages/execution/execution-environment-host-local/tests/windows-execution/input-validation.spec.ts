import type { CommandFacility } from '@omne-harness/execution-environment-contract'
import { expect, it } from 'vitest'
import { commandFixture } from './fixture.ts'

type Request = Parameters<CommandFacility<unknown>['start']>[0]
it('rejects unsupported modes and invalid native input before planning a resource', async () => {
  const f = commandFixture('C:\\work')
  const cases: readonly { change: Partial<Request>; reason: 'unsupported' | 'invalidInput' }[] = [
    {
      change: { binding: { kind: 'tenant_sandbox', tenant: f.request.access.tenant } },
      reason: 'unsupported',
    },
    { change: { outputMode: 'terminal' }, reason: 'unsupported' },
    { change: { geometry: { columns: 80, rows: 24 } }, reason: 'unsupported' },
    { change: { executable: 'relative.exe' }, reason: 'invalidInput' },
    { change: { cwd: 'relative' }, reason: 'invalidInput' },
    { change: { cwd: 'C:\\bad\0path' }, reason: 'invalidInput' },
    { change: { args: ['bad\0argument'] }, reason: 'invalidInput' },
    { change: { env: { '': 'value' } }, reason: 'invalidInput' },
    { change: { env: { 'bad=key': 'value' } }, reason: 'invalidInput' },
    { change: { env: { valid: 'bad\0value' } }, reason: 'invalidInput' },
  ]
  for (const entry of cases)
    expect(
      await f.manager.facility.start({ ...f.request, executable: 'C:\\node.exe', ...entry.change }),
    ).toMatchObject({ kind: 'rejected', reason: entry.reason })
  expect(f.plans).toEqual([])
  expect(f.manager.inFlight()).toBe(0)
})

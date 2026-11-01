import { describe, expect, it } from 'vitest'
import * as testing from '@omne-harness/authorization/testing'
import { manualSystemClock, scriptedMaintenanceGrants } from '@omne-harness/authorization/testing'
import { adminTenant } from './support.ts'
import { grantOf, installed, requestFor, row } from './system-support.ts'

const ASK = {
  principal: { kind: 'system', component: 'x' },
  operation: { owner: 'session', name: 'pending' },
  target: {
    kind: 'tenant',
    tenant: adminTenant(),
    resource: { owner: 'session', kind: 'tenant', key: 'k' },
  },
} as const

describe('the scripted maintenance grant source', () => {
  it('answers found, none and unavailable in the order scripted, and counts the calls', async () => {
    const grants = scriptedMaintenanceGrants()
    const held = grantOf(['pending-sessions'])
    grants.script(
      { kind: 'found', grant: held },
      { kind: 'none' },
      { kind: 'unavailable', diagnostic: 'down' },
    )
    await expect(grants.source.read(ASK)).resolves.toEqual({ kind: 'found', grant: held })
    await expect(grants.source.read(ASK)).resolves.toEqual({ kind: 'none' })
    await expect(grants.source.read(ASK)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'down',
    })
    expect(grants.calls()).toBe(3)
  })

  it('answers unavailable when the script is exhausted, never a repeat or a grant', async () => {
    const grants = scriptedMaintenanceGrants()
    const answer = await grants.source.read(ASK)
    expect(answer.kind).toBe('unavailable')
    expect(grants.calls()).toBe(1)
  })

  it('records the requests it was asked', async () => {
    const grants = scriptedMaintenanceGrants()
    await grants.source.read(ASK)
    expect(grants.requests()).toEqual([ASK])
  })

  it('does not let a script entry changed after the call change the next answer', async () => {
    const grants = scriptedMaintenanceGrants()
    const entry = { kind: 'unavailable', diagnostic: 'a' } as {
      kind: 'unavailable'
      diagnostic: string
    }
    grants.script(entry)
    entry.diagnostic = 'b'
    await expect(grants.source.read(ASK)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'a',
    })
  })

  it('counts two checks of the same request as two reads', async () => {
    const { scanner, grants, authorization } = installed()
    const request = requestFor(scanner, row('pending'))
    grants.script({ kind: 'none' }, { kind: 'none' })
    await authorization.check(request)
    await authorization.check(request)
    expect(grants.calls()).toBe(2)
  })
})

describe('the manual clock', () => {
  it('says pending for a time it was not told to reach, and reached for one it was', async () => {
    const { clock, expire } = manualSystemClock()
    await expect(clock.reached('t1')).resolves.toEqual({ kind: 'pending' })
    expire('t1')
    await expect(clock.reached('t1')).resolves.toEqual({ kind: 'reached' })
  })

  it('answers unavailable while failed', async () => {
    const { clock, fail } = manualSystemClock()
    fail('down')
    await expect(clock.reached('t1')).resolves.toEqual({ kind: 'unavailable', diagnostic: 'down' })
  })
})

describe('the public face of the testing entry', () => {
  it('offers the two doubles and no grant management', () => {
    expect(Object.keys(testing).sort()).toEqual(['manualSystemClock', 'scriptedMaintenanceGrants'])
  })
})

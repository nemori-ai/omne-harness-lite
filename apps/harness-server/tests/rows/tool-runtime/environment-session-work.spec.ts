// A session work principal that cannot be verified is not a refused one: the environment facilities
// answer unavailable, and say so in a warning; only a principal that was checked and is not a
// session work principal of the tenant is refused.
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { VerifiedSessionWork } from '../../../src/rows/tool-runtime/session-work.ts'
import type { ReleaseToolIdentity } from '../../../src/rows/tool-runtime/access.ts'
import { createReleaseEnvironment } from '../../../src/rows/tool-runtime/environment.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { fixtureTenant } from '../../entry/support.ts'

const TENANT = fixtureTenant('a')

function environmentOver(verdict: VerifiedSessionWork) {
  const warn = vi.fn()
  const identity = {
    sessionWork: async () => verdict,
    sessionOf: async () => undefined,
  } as unknown as ReleaseToolIdentity
  const holder = toolRuntimeHolder({ root: {} } as unknown as Context)
  const { input } = createReleaseEnvironment(holder, identity, {
    filesRoot: '/unused',
    commitAttempts: 1,
    schemaProvider: () => null,
    warn,
  })
  const access = { principal: {}, tenant: TENANT, origin: 'origin-1' }
  return {
    warn,
    authorize: () =>
      input.plan.guard.authorize('files', 'read', {
        requestId: 'r-1',
        access: { principal: access.principal, tenant: TENANT },
        origin: access.origin,
        path: '/unused/a',
      } as never),
    name: () =>
      input.naming.name({
        ...access,
        binding: {},
        operation: 'read',
        path: 'a',
        role: 'object',
      } as never),
  }
}

describe('a session work principal that the verifier cannot answer for', () => {
  const unreadable: VerifiedSessionWork = { kind: 'unavailable', diagnostic: 'verifier down' }

  it('is unavailable, not notAuthorized, for the facility guard, with a warning', async () => {
    const world = environmentOver(unreadable)
    expect(await world.authorize()).toBe('unavailable')
    expect(world.warn).toHaveBeenCalledTimes(1)
    expect(world.warn.mock.calls[0]?.[0]).toContain('verifier down')
  })

  it('is unavailable, not denied, for the host object naming, with a warning', async () => {
    const world = environmentOver(unreadable)
    expect(await world.name()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(world.warn).toHaveBeenCalledTimes(1)
    expect(world.warn.mock.calls[0]?.[0]).toContain('verifier down')
  })

  it('stays a refusal, without a warning, when the principal was checked and is not a session work principal', async () => {
    const world = environmentOver({ kind: 'denied' })
    expect(await world.authorize()).toBe('notAuthorized')
    expect(await world.name()).toMatchObject({ failure: { kind: 'denied' } })
    expect(world.warn).not.toHaveBeenCalled()
  })
})

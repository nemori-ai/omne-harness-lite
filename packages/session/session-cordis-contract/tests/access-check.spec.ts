import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type { SessionAccessCheck } from '@omne-harness/session-contract'
import {
  createScriptedSessionAccessCheck,
  memoryAccess,
} from '@omne-harness/session-contract/testing'
import {
  SessionAccessCheckService,
  sessionAccessCheckKey,
} from '@omne-harness/session-cordis-contract/cordis'

it('loads the access definition under its own key, delegates check, and removes it on unload', async () => {
  const checker = createScriptedSessionAccessCheck<unknown>([{ kind: 'denied' }])
  class Probe extends SessionAccessCheckService {
    readonly check: SessionAccessCheck<unknown>['check'] = input => checker.check(input)
  }
  const ctx = new Context()
  const fiber = await ctx.plugin(Probe)
  try {
    const service = ctx.get(sessionAccessCheckKey)
    expect(service).toBeInstanceOf(Probe)
    expect(service).toBeInstanceOf(Service)
    if (service === undefined) throw new Error('access service was not installed')
    const access = memoryAccess({ identity: 'caller' })
    const target = { kind: 'session', session: access.session } as const
    await expect(service.check({ access, operation: 'history.next', target })).resolves.toEqual({
      kind: 'denied',
    })
    expect(checker.controls.asked()).toEqual([{ access, operation: 'history.next', target }])
  } finally {
    await fiber.dispose()
  }
  expect(ctx.get(sessionAccessCheckKey)).toBeUndefined()
})

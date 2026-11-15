import { expect, it } from 'vitest'
import { createScheduleToolDetails } from '@omne-harness/schedule-tools'
import { detailsWorld } from './details-world.ts'
import { access } from './world.ts'

it('uses the same principal for both guards when the caller changes its request during a wait', async () => {
  const w = await detailsWorld()
  const gate = Promise.withResolvers<void>()
  const seen: string[] = []
  const details = createScheduleToolDetails<string>({
    authority: w.reference.authority,
    cursorKey: w.cursorKey,
    limits: { maxBytes: 4_194_304, timeoutMs: 1000 },
    queries: w.queries,
    baseGuard: {
      qualify: async input => {
        seen.push(input.principal)
        const allowed = input.principal === 'alice'
        await gate.promise
        return allowed ? { kind: 'allowed' } : { kind: 'denied', reason: 'base' }
      },
    },
    disclosure: {
      ...w.disclosure,
      qualifyCall: async input => {
        seen.push(input.principal)
        return input.principal === 'bob'
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'disclosure' }
      },
    },
  })
  const request = { ...access(), principal: 'alice', action: 'read-result' as const }
  const pending = details.guard.qualify(request)
  request.principal = 'bob'
  gate.resolve()
  expect(await pending).toEqual({ kind: 'denied', reason: 'disclosure' })
  expect(seen).toEqual(['alice', 'alice'])
})

it('keeps the initial access across guard, observation, result reads and confirmation', async () => {
  const w = await detailsWorld()
  const gate = Promise.withResolvers<void>()
  const seen: string[] = []
  const details = createScheduleToolDetails<string>({
    authority: w.reference.authority,
    cursorKey: w.cursorKey,
    limits: { maxBytes: 4_194_304, timeoutMs: 1000 },
    queries: {
      readResult: input => {
        seen.push(input.principal)
        return w.queries.readResult(input)
      },
    },
    baseGuard: {
      qualify: async input => {
        seen.push(input.principal)
        await gate.promise
        return { kind: 'allowed' }
      },
    },
    disclosure: {
      qualifyCall: async input => {
        seen.push(input.principal)
        return { kind: 'allowed' }
      },
      observe: input => {
        seen.push(input.access.principal)
        return w.disclosure.observe(input)
      },
      confirm: input => {
        seen.push(input.access.principal)
        return w.disclosure.confirm(input)
      },
    },
  })
  const request = {
    access: { ...w.access, principal: 'alice' },
    reference: w.reference,
    after: null,
  }
  const pending = details.read(request)
  request.access.principal = 'bob'
  gate.resolve()
  expect(await pending).toHaveProperty('ok')
  expect(seen).toEqual(['alice', 'alice', 'alice', 'alice', 'alice'])
})

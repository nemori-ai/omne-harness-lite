// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionIntakeLimits } from '@omne-harness/session-contract'
import { openRealApp, TENANT_A, type RealApp } from './fixtures/real-provider.ts'

const apps: RealApp[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
})

const SESSION = 'session-1'
const limit = (maxPendingInputs: number): SessionIntakeLimits => ({
  maxPendingInputs,
  maxInputBytes: 65_536,
})

async function scene(first: SessionIntakeLimits | null) {
  const state = { answer: first, asked: 0 }
  const app = await openRealApp({
    budget: {
      async read() {
        state.asked += 1
        return state.answer
      },
    },
  })
  apps.push(app)
  expect(await app.create(TENANT_A)).toHaveProperty('ok')
  return { app, state }
}

describe('the writer reads the budget of the tenant only when an input already waits', () => {
  it('admits the first input without reading it, and reads it once for each input behind one', async () => {
    const { app, state } = await scene(limit(2))
    expect(await app.accept(TENANT_A, SESSION, 'one')).toHaveProperty('ok')
    expect(state.asked).toBe(0)
    expect(await app.accept(TENANT_A, SESSION, 'two')).toHaveProperty('ok')
    expect(state.asked).toBe(1)
    expect(await app.accept(TENANT_A, SESSION, 'three')).toEqual({
      failure: { kind: 'limited', resource: 'pending-inputs', limit: 2 },
    })
    expect(state.asked).toBe(2)
  }, 30_000)

  it('admits the first input while the budget cannot be read, and answers unavailable behind it', async () => {
    const { app, state } = await scene(null)
    expect(await app.accept(TENANT_A, SESSION, 'one')).toHaveProperty('ok')
    expect(state.asked).toBe(0)
    expect(await app.accept(TENANT_A, SESSION, 'two')).toEqual({
      failure: {
        kind: 'unavailable',
        owner: 'session-intake',
        diagnostic: 'the intake budget of this tenant is not available',
      },
    })
    state.answer = limit(2)
    expect(await app.accept(TENANT_A, SESSION, 'two')).toHaveProperty('ok')
  }, 30_000)

  it('answers an operation already admitted as recovered without reading the budget again', async () => {
    const { app, state } = await scene(limit(2))
    expect(await app.accept(TENANT_A, SESSION, 'one')).toHaveProperty('ok')
    expect(await app.accept(TENANT_A, SESSION, 'two')).toHaveProperty('ok')
    const asked = state.asked
    state.answer = null
    expect(await app.accept(TENANT_A, SESSION, 'two')).toHaveProperty('ok')
    expect(state.asked).toBe(asked)
  }, 30_000)
})

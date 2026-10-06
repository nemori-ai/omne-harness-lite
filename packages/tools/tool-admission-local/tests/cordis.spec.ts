import { expect, test, vi } from 'vitest'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { TOOL_ADMISSION } from '@omne-harness-lite/tool-admission/cordis'
import { toolAdmissionLocal, officialAdmission } from '../src/cordis.ts'
import { scope } from './provider-fixture.ts'
import { cordisFixture } from './cordis-fixture.ts'

const unavailable = { kind: 'failed', reason: 'unavailable' }
test('waits for declared dependencies, then replacement creates a new provider without reviving old references', async () => {
  const c = await cordisFixture(),
    fiber = c.ctx.plugin(toolAdmissionLocal, {})
  try {
    await Promise.resolve()
    expect(c.ctx.get(TOOL_ADMISSION)).toBeUndefined()
    const history = c.ctx.plugin(c.historyPlugin)
    await history
    await fiber
    expect(fiber.state).toBe(FIBER_STATE.ACTIVE)
    const old = c.ctx.get(TOOL_ADMISSION)!
    expect(await old.verifyToken(c.f.access, scope, c.f.token, c.f.call)).toHaveProperty(
      'kind',
      'valid',
    )
    await history.dispose()
    expect(c.ctx.get(TOOL_ADMISSION)).toBeUndefined()
    expect(await old.verifyToken(c.f.access, scope, c.f.token, c.f.call)).toEqual(unavailable)
    expect(c.f.release).toHaveBeenCalledTimes(1)
    const replacement = c.ctx.plugin(c.historyPlugin)
    await replacement
    await fiber
    const next = c.ctx.get(TOOL_ADMISSION)!
    expect(next).not.toBe(old)
    expect(await next.verifyToken(c.f.access, scope, c.f.token, c.f.call)).toHaveProperty(
      'kind',
      'valid',
    )
    expect(await old.forPass(c.f.access, scope, 'pass')).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
  } finally {
    await c.close()
  }
  expect(c.f.release).toHaveBeenCalledTimes(2)
})
test('disposal awaits actual in-flight verification before releasing its physical borrow', async () => {
  const c = await cordisFixture()
  await c.ctx.plugin(c.historyPlugin)
  const fiber = c.ctx.plugin(toolAdmissionLocal, {})
  await fiber
  const operations = c.ctx.get(TOOL_ADMISSION)!,
    gate = c.f.blockRead()
  const verifying = operations.verifyToken(c.f.access, scope, c.f.token, c.f.call)
  await vi.waitFor(() => expect(c.f.read).toHaveBeenCalledTimes(1))
  const disposing = fiber.dispose()
  await vi.waitFor(async () =>
    expect(await operations.forPass(c.f.access, scope, 'pass')).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    }),
  )
  expect(c.f.release).not.toHaveBeenCalled()
  gate.resolve({ entries: c.f.rows(), tail: 2 })
  expect(await verifying).toEqual(unavailable)
  await disposing
  expect(c.f.release).toHaveBeenCalledTimes(1)
  await c.close()
})
test('the official plugin registers in its own fiber and cannot keep using a withdrawn generation', async () => {
  const c = await cordisFixture()
  try {
    await c.ctx.plugin(c.historyPlugin)
    const provider = c.ctx.plugin(toolAdmissionLocal, {})
    await provider
    const contributor = c.ctx.plugin(officialAdmission, {})
    await contributor
    expect(contributor.state).toBe(FIBER_STATE.ACTIVE)
    const lease = c.registry.captureAdmission()
    if ('absent' in lease) throw new Error('official missing')
    const result = await lease.invoke(c.f.access, scope, 'pass', [c.f.input])
    expect(result).toMatchObject({
      kind: 'decisions',
      results: [{ kind: 'allow', token: c.f.token }],
    })
    await contributor.dispose()
    expect(c.registry.captureAdmission()).toEqual({ absent: true })
    expect(await lease.invoke(c.f.access, scope, 'pass', [c.f.input])).toEqual(unavailable)
    const replacement = c.ctx.plugin(officialAdmission, {})
    await replacement
    expect(c.registry.captureAdmission()).not.toHaveProperty('absent')
    await provider.dispose()
    expect(c.registry.captureAdmission()).toEqual({ absent: true })
  } finally {
    await c.close()
  }
})
test('rejects live inputs in configuration instead of accepting them as dependencies', async () => {
  const c = await cordisFixture()
  try {
    await c.ctx.plugin(c.historyPlugin)
    const fiber = c.ctx.plugin(toolAdmissionLocal, { backing: c.f.backing } as never)
    await expect(Promise.resolve(fiber)).rejects.toThrow('invalid config')
    expect(fiber.state).not.toBe(FIBER_STATE.ACTIVE)
    expect(c.ctx.get(TOOL_ADMISSION)).toBeUndefined()
    expect(c.f.borrow).not.toHaveBeenCalled()
  } finally {
    await c.close()
  }
})

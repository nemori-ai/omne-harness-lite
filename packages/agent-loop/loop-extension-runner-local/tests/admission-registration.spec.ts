import { Context } from '@deepseek-ai/cordis'
import { expect, test, vi } from 'vitest'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis'
import {
  LOOP_EXTENSION_IMPLEMENTATIONS,
  RunnerHostService,
} from '@omne-harness-lite/loop-extension-runner/cordis'
import type { OfficialAdmissionContribution } from '@omne-harness-lite/loop-extension-runner'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { SessionLogService } from '@omne-harness-lite/session-log/cordis'
import { OFFICIAL_ADMISSION_NAME } from '@omne-harness-lite/tool-admission'
import { createRunnerImplementationRegistry } from '../src/implementation-registry.ts'
import { loopExtensionRunnerPlugin } from '../src/cordis.ts'
import { DeniedAccess } from './denied-access.ts'

// This fixture exercises contribution custody only. It is never accepted as business authorization.
const args = [
  Object.freeze({}),
  Object.freeze({}),
  'pass',
  [],
] as unknown as Parameters<OfficialAdmissionContribution>
const failed = { kind: 'failed', reason: 'unavailable' } as const

test('the official slot cannot be registered through a builtin or silently replaced', () => {
  const registry = createRunnerImplementationRegistry()
  expect(registry.captureAdmission()).toEqual({ absent: true })
  expect(() =>
    registry.registerBuiltin(OFFICIAL_ADMISSION_NAME, async () => ({
      kind: 'notStartedUnavailable',
    })),
  ).toThrow()
  expect(() =>
    registry.registerAdmission(null as unknown as OfficialAdmissionContribution),
  ).toThrow()
  const oldDispose = registry.registerAdmission(async () => failed)
  const old = registry.captureAdmission()
  if ('absent' in old) throw new Error('expected contribution')
  expect(() => registry.registerAdmission(async () => failed)).toThrow()
  oldDispose()
  expect(old.isActive()).toBe(false)
  const nextDispose = registry.registerAdmission(async () => failed)
  oldDispose()
  expect(registry.captureAdmission()).not.toHaveProperty('absent')
  nextDispose()
  expect(registry.captureAdmission()).toEqual({ absent: true })
})

test('a withdrawn lease never starts its successor and cannot return the old result', async () => {
  const registry = createRunnerImplementationRegistry()
  const gate = Promise.withResolvers<Awaited<ReturnType<OfficialAdmissionContribution>>>()
  const entered = Promise.withResolvers<void>()
  const first = vi.fn<OfficialAdmissionContribution>(async () => {
    entered.resolve()
    return gate.promise
  })
  const remove = registry.registerAdmission(first)
  const lease = registry.captureAdmission()
  if ('absent' in lease) throw new Error('expected contribution')
  const work = lease.invoke(...args)
  await entered.promise
  remove()
  const next = vi.fn<OfficialAdmissionContribution>(async () => failed)
  registry.registerAdmission(next)
  gate.resolve({ kind: 'decisions', results: [{ kind: 'deny', reason: 'not_held' }] })
  expect(await work).toEqual(failed)
  expect(await lease.invoke(...args)).toEqual(failed)
  expect(first).toHaveBeenCalledTimes(1)
  expect(next).not.toHaveBeenCalled()
  await registry.drain()
})

test('withdrawal before the invocation microtask prevents starting the contribution', async () => {
  const registry = createRunnerImplementationRegistry(),
    contribution = vi.fn<OfficialAdmissionContribution>(async () => failed)
  const remove = registry.registerAdmission(contribution),
    lease = registry.captureAdmission()
  if ('absent' in lease) throw new Error('expected contribution')
  const work = lease.invoke(...args)
  remove()
  expect(await work).toEqual(failed)
  expect(contribution).not.toHaveBeenCalled()
})

test('close rejects new admission and drains the actual pending contribution', async () => {
  const registry = createRunnerImplementationRegistry()
  const gate = Promise.withResolvers<Awaited<ReturnType<OfficialAdmissionContribution>>>(),
    entered = Promise.withResolvers<void>()
  registry.registerAdmission(async () => {
    entered.resolve()
    return gate.promise
  })
  const lease = registry.captureAdmission()
  if ('absent' in lease) throw new Error('expected contribution')
  const work = lease.invoke(...args)
  await entered.promise
  registry.closeAdmission()
  let drained = false
  const draining = registry.drain().then(() => {
    drained = true
  })
  await Promise.resolve()
  expect(drained).toBe(false)
  expect(registry.captureAdmission()).toEqual({ absent: true })
  expect(() => registry.registerAdmission(async () => failed)).toThrow()
  expect(await lease.invoke(...args)).toEqual(failed)
  gate.resolve(failed)
  expect(await work).toEqual(failed)
  await draining
  expect(drained).toBe(true)
})

test('contribution exceptions become unavailable and leave drain empty', async () => {
  const registry = createRunnerImplementationRegistry()
  registry.registerAdmission(async () => {
    throw new Error('contribution failed')
  })
  const lease = registry.captureAdmission()
  if ('absent' in lease) throw new Error('expected contribution')
  expect(await lease.invoke(...args)).toEqual(failed)
  registry.closeAdmission()
  await registry.drain()
})

// No log IO or Run acceptance belongs to this test. Any such call is a test failure.
class UnusedLog extends SessionLogService {
  async append(): Promise<never> {
    throw new Error('unexpected log IO')
  }
  async readByKey(): Promise<never> {
    throw new Error('unexpected log IO')
  }
  async readSince(): Promise<never> {
    throw new Error('unexpected log IO')
  }
}
class UnusedHost extends RunnerHostService {
  async acquireDispatch(): Promise<never> {
    throw new Error('unexpected dispatch')
  }
  async acquireReplay(): Promise<never> {
    throw new Error('unexpected replay')
  }
}

test('the real Cordis runner service owns the registration in the contributor fiber', async () => {
  const ctx = new Context()
  const infrastructure = ctx.plugin({
    name: 'registration-test-inputs',
    apply(inner: Context) {
      new UnusedLog(inner)
      new UnusedHost(inner)
      new DeniedAccess(inner)
    },
  })
  await infrastructure
  const runner = ctx.plugin(loopExtensionRunnerPlugin, {})
  await runner
  expect(runner.state).toBe(FIBER_STATE.ACTIVE)
  let oldDispose = () => {}
  const first = ctx.plugin({
    name: 'first-official-admission',
    inject: [LOOP_EXTENSION_IMPLEMENTATIONS],
    apply(inner: Context) {
      oldDispose = inner.loopExtensionImplementations.registerAdmission(async () => failed)
    },
  })
  await first
  try {
    expect(first.state).toBe(FIBER_STATE.ACTIVE)
    const operations = ctx.get(LOOP_EXTENSION_IMPLEMENTATIONS)!
    expect(() => operations.registerAdmission(async () => failed)).toThrow()
    await first.dispose()
    const next = ctx.plugin({
      name: 'next-official-admission',
      inject: [LOOP_EXTENSION_IMPLEMENTATIONS],
      apply(inner: Context) {
        inner.loopExtensionImplementations.registerAdmission(async () => failed)
      },
    })
    await next
    expect(next.state).toBe(FIBER_STATE.ACTIVE)
    oldDispose()
    await Promise.resolve()
    expect(() => operations.registerAdmission(async () => failed)).toThrow()
    await next.dispose()
    const release = operations.registerAdmission(async () => failed)
    release()
  } finally {
    await first.dispose()
    await runner.dispose()
    await infrastructure.dispose()
  }
})

test('the pass source requires current access authority and retained references stop with its fiber', async () => {
  const ctx = new Context()
  const infrastructure = await ctx.plugin({
    name: 'pass-source-test-inputs',
    apply(inner: Context) {
      new UnusedLog(inner)
      new UnusedHost(inner)
    },
  })
  const runner = ctx.plugin(loopExtensionRunnerPlugin, {})
  await Promise.resolve()
  expect(ctx.get('toolAdmissionPassSource')).toBeUndefined()
  const authority = await ctx.plugin({
    name: 'pass-source-test-access',
    apply(inner: Context) {
      new DeniedAccess(inner)
    },
  })
  await runner
  const source = ctx.get('toolAdmissionPassSource')!
  const scope: SessionScope = {
    tenant: unwrap(parseTenantId({ organization: 'personal-member', account: 'member' })),
    session: unwrap(parseOpaqueIdentifier('session', 'SessionRef')),
  }
  try {
    expect(typeof source.read).toBe('function')
    expect(source).not.toHaveProperty('open')
    expect(await source.read({} as SessionAccess, scope, 'guessed')).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    await authority.dispose()
    expect(ctx.get('toolAdmissionPassSource')).toBeUndefined()
    expect(await source.read({} as SessionAccess, scope, 'guessed')).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
  } finally {
    await runner.dispose()
    await authority.dispose()
    await infrastructure.dispose()
  }
})

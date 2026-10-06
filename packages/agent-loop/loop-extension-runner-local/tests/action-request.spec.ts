import { expect, test, vi } from 'vitest'
import type { AuthorizationContext } from '@omne-harness-lite/tool-admission'
import { captureActionRequest, checkActionSource, isActionDispatch } from '../src/action-request.ts'
import { actionInputs, toolCall, tenant, session } from './action-support.ts'

interface MutableFixture {
  actions: { call: { arguments: unknown }; batch: string[] }[]
  anchors: string[]
  assistantMessage: string
  admission: {
    report: { runId: string; attempt: number; effectivePermissions: { echo: { value: unknown } } }
    parent?: { permission: string; runMode: string }
    extra?: boolean
  }
  extra?: boolean
}
const binding = { tenant, session, logGeneration: 'generation' }
test('request and host agree on the full original call order, including the unparseable item', () => {
  const { request, source } = actionInputs([
    toolCall('a'),
    toolCall('u', 'echo', true),
    toolCall('b'),
  ])
  const captured = captureActionRequest(request)
  expect(captured).toHaveProperty('request')
  if ('failure' in captured) throw new Error('Expected captured input')
  expect(captured.request.admission.grants).toBe(request.admission.grants)
  expect(Object.isFrozen(captured.request.actions[0]?.call)).toBe(true)
  expect(checkActionSource(captured.request, source, binding)).toHaveProperty('source')
})

for (const mutate of [
  (v: MutableFixture) => {
    v.actions.pop()
    v.anchors.pop()
  },
  (v: MutableFixture) => {
    v.actions.reverse()
  },
  (v: MutableFixture) => {
    v.actions[0]!.call.arguments = { changed: true }
  },
  (v: MutableFixture) => {
    v.actions.forEach(action => action.batch.push('invented'))
  },
  (v: MutableFixture) => {
    v.assistantMessage = 'different'
  },
  (v: MutableFixture) => {
    v.anchors[0] = 'different'
  },
  (v: MutableFixture) => {
    v.admission.report.effectivePermissions.echo.value = { allowed: ['forbid'] }
  },
])
  test('an internally shaped request still needs to match the actual host source', () => {
    const { request, source } = actionInputs()
    const changed = JSON.parse(JSON.stringify(request))
    changed.admission.grants = request.admission.grants
    mutate(changed)
    const captured = captureActionRequest(changed)
    expect(captured).toHaveProperty('request')
    if ('failure' in captured) throw new Error('Expected shaped but false request')
    expect(checkActionSource(captured.request, source, binding)).toEqual({
      failure: 'invalidInput',
    })
  })

for (const mutate of [
  (v: MutableFixture) => {
    v.anchors[1] = v.anchors[0]!
  },
  (v: MutableFixture) => {
    v.anchors.pop()
  },
  (v: MutableFixture) => {
    v.actions[1] = v.actions[0]!
  },
  (v: MutableFixture) => {
    v.admission.report.runId = 'different'
  },
  (v: MutableFixture) => {
    v.admission.report.attempt = 2
  },
  (v: MutableFixture) => {
    v.admission.parent = { permission: 'auto', runMode: 'unknown' }
  },
  (v: MutableFixture) => {
    v.extra = true
  },
  (v: MutableFixture) => {
    v.admission.extra = true
  },
  (v: MutableFixture) => {
    v.actions[0]!.batch = ['other']
  },
])
  test('structural mismatch is rejected before any host operation', () => {
    const changed = JSON.parse(JSON.stringify(actionInputs().request))
    mutate(changed)
    expect(captureActionRequest(changed)).toEqual({ failure: 'invalidInput' })
  })

test('an empty action list requires a real nonempty all-unparseable batch', () => {
  const { request, source } = actionInputs([toolCall('u', 'echo', true)])
  expect(checkActionSource(request, source, binding)).toHaveProperty('source')
  expect(checkActionSource(request, { ...source, calls: [] as never }, binding)).toEqual({
    failure: 'unavailable',
  })
  expect(checkActionSource(request, actionInputs().source, binding)).toEqual({
    failure: 'invalidInput',
  })
  expect(checkActionSource(request, undefined, binding)).toEqual({ failure: 'unavailable' })
})

test('valid run modes and opaque grants must still be the policy captured by the host', () => {
  const { request, source } = actionInputs()
  for (const admission of [
    { ...request.admission, grants: {} as AuthorizationContext },
    { ...request.admission, runMode: 'bypass-permissions' as const },
    { ...request.admission, parent: { permission: 'auto' as const, runMode: 'never' as const } },
  ]) {
    const captured = captureActionRequest({ ...request, admission })
    expect(captured).toHaveProperty('request')
    if ('failure' in captured) throw new Error('Expected structurally valid policy')
    expect(checkActionSource(captured.request, source, binding)).toEqual({
      failure: 'invalidInput',
    })
  }
})

test('an incomplete adopted table or duplicated original call makes the source unavailable', () => {
  const { request, source } = actionInputs()
  expect(checkActionSource(request, { ...source, toolNames: [] }, binding)).toEqual({
    failure: 'unavailable',
  })
  expect(
    checkActionSource(request, { ...source, calls: [source.calls[0], source.calls[0]] }, binding),
  ).toEqual({ failure: 'unavailable' })
  expect(checkActionSource(request, source, { ...binding, session: 'different' })).toEqual({
    failure: 'unavailable',
  })
})

test('position and admission accessors never execute during routing or capture', () => {
  const { request } = actionInputs(),
    getter = vi.fn(() => 'before_action')
  const value = Object.defineProperty({ ...request }, 'position', { enumerable: true, get: getter })
  expect(isActionDispatch(value)).toBe(false)
  expect(captureActionRequest(value)).toEqual({ failure: 'invalidInput' })
  const nested = {
    ...request,
    admission: Object.defineProperty({ ...request.admission }, 'grants', {
      enumerable: true,
      get: getter,
    }),
  }
  expect(captureActionRequest(nested)).toEqual({ failure: 'invalidInput' })
  expect(getter).not.toHaveBeenCalled()
  expect(isActionDispatch(null)).toBe(false)
})

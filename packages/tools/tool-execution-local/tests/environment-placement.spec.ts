import { expect, test } from 'vitest'
import { createToolEnvironmentPlacementSource } from '../src/index.ts'
import { at, definition, placementFixture, scope } from './placement-fixture.ts'

test('pure tools do not read permission inputs or acquire an environment', async () => {
  const { settings: _settings, ...pure } = definition
  const h = placementFixture('always-allow', pure)
  expect(await h.query()).toEqual({ kind: 'notApplicable' })
  expect(h.inputs).not.toHaveBeenCalled()
  expect(h.release).toHaveBeenCalledOnce()
})
test('an unknown execution cannot cause a permission input read', async () => {
  const h = placementFixture()
  h.acquire.mockResolvedValue({ kind: 'rejected', reason: 'notAuthorized' })
  expect(await h.query()).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  expect(h.inputs).not.toHaveBeenCalled()
  expect(h.release).not.toHaveBeenCalled()
})
test('an observer read failure still releases its temporary original observer', async () => {
  const h = placementFixture()
  h.read.mockRejectedValue(new Error('IO failure'))
  expect(await h.query()).toEqual({ kind: 'rejected', reason: 'policyUnavailable' })
  expect(h.release).toHaveBeenCalledOnce()
  expect(h.inputs).not.toHaveBeenCalled()
})

test('a rejected current input IO promise reports unavailable after releasing the observer', async () => {
  const h = placementFixture()
  h.inputs.mockRejectedValue(new Error('current input IO failed'))
  expect(await h.query()).toEqual({ kind: 'rejected', reason: 'unavailable' })
  expect(h.release).toHaveBeenCalledOnce()
})
test('a different tool identity cannot query the original call permission', async () => {
  const h = placementFixture()
  expect(
    await h.source.read(scope, h.token, {
      ...h.call,
      tool: { ...h.call.tool, definition: 'other' },
    }),
  ).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  expect(h.release).toHaveBeenCalledOnce()
  expect(h.inputs).not.toHaveBeenCalled()
})
test('a terminal original execution grants no current placement', async () => {
  const h = placementFixture()
  h.read.mockResolvedValue({
    kind: 'found',
    snapshot: {
      ref: { ...scope, callId: h.call.execution },
      origin: { run: 'run', attempt: 1, assistantMessage: 'reply' },
      selected: h.selected,
      adoptedContext: [],
      state: {
        phase: 'ended',
        terminal: { outcome: 'unavailable', reason: 'closed' },
        account: {
          callId: h.call.execution,
          initiator: scope.tenant,
          externalEffect: 'unknown',
          cost: { total_usd: 0, items: [] },
          wallClock: { startedAt: at, endedAt: at },
          frames: 'unknown',
        },
      },
    },
  })
  expect(await h.query()).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  expect(h.inputs).not.toHaveBeenCalled()
  expect(h.release).toHaveBeenCalledOnce()
})
test.each([
  {},
  { name: 'source' },
  { name: 'source', factoryPermission: 'auto' },
  { name: 'source', factoryPermission: 'always-allow', extra: true },
])('source configuration requires an explicit closed permission (%j)', value => {
  const h = placementFixture()
  expect(() =>
    createToolEnvironmentPlacementSource(
      value as Parameters<typeof createToolEnvironmentPlacementSource>[0],
      { tools: { acquire: h.acquire }, currentInputs: { read: h.inputs }, select: h.select },
    ),
  ).toThrow()
})

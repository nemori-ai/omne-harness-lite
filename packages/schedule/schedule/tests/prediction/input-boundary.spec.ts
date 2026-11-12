import { expect, test } from 'vitest'
import { context, definition, harness, input } from './fixtures.ts'

test.each([null, undefined, false, '', {}, { requestId: 'untrusted' }])(
  'totalizes malformed prediction context %j before reading dependencies',
  async malformed => {
    const { service, enumerations } = harness()
    await expect(
      Reflect.apply(service.preview, service, [malformed, input(definition())]),
    ).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'invalid_input', requestId: 'schedule.prediction.invalid-context' },
    })
    expect(enumerations).toEqual([])
  },
)

test.each([null, undefined, false, '', {}, { definition: null }])(
  'totalizes malformed prediction request %j before reading dependencies',
  async malformed => {
    const { service, enumerations } = harness()
    await expect(
      Reflect.apply(service.preview, service, [context, malformed]),
    ).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'invalid_input', requestId: context.requestId },
    })
    expect(enumerations).toEqual([])
  },
)

test.each([null, undefined, false, '', {}, { context: null }])(
  'totalizes malformed definition resolution request %j before reading dependencies',
  async malformed => {
    const { service, enumerations } = harness()
    await expect(
      Reflect.apply(service.definitions.resolve, service.definitions, [malformed]),
    ).resolves.toMatchObject({
      kind: 'unavailable',
      error: { code: 'invalid_input', requestId: 'schedule.prediction.invalid-context' },
    })
    expect(enumerations).toEqual([])
  },
)

test('preserves the verified request identity when definition resolution input is incomplete', async () => {
  const { service, enumerations } = harness()
  await expect(
    Reflect.apply(service.definitions.resolve, service.definitions, [{ context }]),
  ).resolves.toMatchObject({
    kind: 'unavailable',
    error: { code: 'invalid_input', requestId: context.requestId },
  })
  expect(enumerations).toEqual([])
})

test('returns readable diagnostics for invalid preview and definition resolution inputs', async () => {
  const { service } = harness()
  const preview = await Reflect.apply(service.preview, service, [context, null])
  const resolution = await Reflect.apply(service.definitions.resolve, service.definitions, [null])
  expect(preview).toMatchObject({ kind: 'error', error: { message: expect.stringMatching(/\S/) } })
  expect(resolution).toMatchObject({
    kind: 'unavailable',
    error: { message: expect.stringMatching(/\S/) },
  })
})

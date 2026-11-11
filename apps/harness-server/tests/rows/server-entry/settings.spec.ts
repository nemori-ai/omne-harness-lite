// `settingsOfCall`: the row reads `settingsSecretItems` from the tree on every call. Absent, every
// one of the four methods answers `basis-unavailable` and none throws; present, each method is
// handed to the provider with the same input; a provider that comes later is seen by the next call.
import { Context } from '@deepseek-ai/cordis'
import type { SettingsGovernance } from '@omne-harness/server-entry'
import { describe, expect, it } from 'vitest'
import { settingsOfCall } from '../../../src/rows/server-entry/settings.ts'
import { settingsSecretItemsKey } from '../../../src/rows/settings/index.ts'

const METHODS = [
  'list',
  'set',
  'describe',
  'clear',
] as const satisfies readonly (keyof SettingsGovernance)[]
type Method = (typeof METHODS)[number]
type Untyped = Record<Method, (input: unknown) => Promise<unknown>>

/** A provider whose every method answers with its own name and the input it got. */
function echoProvider(): SettingsGovernance {
  return Object.fromEntries(
    METHODS.map(method => [method, (input: unknown) => Promise.resolve({ method, input })]),
  ) as unknown as SettingsGovernance
}

describe('settingsOfCall', () => {
  it('has the four methods of the settings port', () => {
    expect(Object.keys(settingsOfCall(new Context())).sort()).toEqual([...METHODS].sort())
  })

  it('answers basis-unavailable from every method while the provider is absent, and throws for none', async () => {
    const port = settingsOfCall(new Context()) as unknown as Untyped
    for (const method of METHODS)
      await expect(port[method]({ access: 'x' }), method).resolves.toEqual({
        kind: 'basis-unavailable',
      })
  })

  it('hands each call to the provider with its input, and sees a provider that came later', async () => {
    const ctx = new Context()
    const port = settingsOfCall(ctx) as unknown as Untyped
    await expect(port.set({ secret: 'sentinel-not-forwarded' })).resolves.toEqual({
      kind: 'basis-unavailable',
    })
    ctx.provide(settingsSecretItemsKey, echoProvider())
    for (const method of METHODS) {
      const input = { access: `access-of-${method}` }
      await expect(port[method](input), method).resolves.toEqual({ method, input })
    }
  })
})

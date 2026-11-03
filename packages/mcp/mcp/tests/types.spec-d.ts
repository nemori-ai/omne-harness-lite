// Type tests: the capability token of the gate cannot be written as a literal or built from an
// adopted endpoint; only `admit` grants it.
import { describe, expectTypeOf, it } from 'vitest'
import type { AdoptedEndpoint } from '@omne-harness/mcp-contract/provider'
import type { AdmittedEndpoint } from '../src/internal/gate.ts'

declare const adopted: AdoptedEndpoint

describe('AdmittedEndpoint', () => {
  it('is not assignable from an adopted endpoint', () => {
    expectTypeOf(adopted).not.toMatchTypeOf<AdmittedEndpoint>()
    // @ts-expect-error an adopted endpoint is not admitted
    const forged: AdmittedEndpoint = adopted
    void forged
  })

  it('is not assignable from a literal that spreads an adopted endpoint', () => {
    // @ts-expect-error the brand is a module-private symbol; no literal carries it
    const forged: AdmittedEndpoint = { ...adopted }
    void forged
  })

  it('is assignable to an adopted endpoint', () => {
    expectTypeOf<AdmittedEndpoint>().toMatchTypeOf<AdoptedEndpoint>()
  })
})

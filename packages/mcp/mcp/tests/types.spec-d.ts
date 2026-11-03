// Type tests: the capability tokens of the gate cannot be written as literals or built from an
// adopted endpoint; an adopted-only token is not an admitted one; only `admit` grants admission.
import { describe, expectTypeOf, it } from 'vitest'
import type { AdoptedEndpoint } from '@omne-harness/mcp-contract/provider'
import type { AdmittedEndpoint, AdoptedOnly } from '../src/internal/gate.ts'

declare const adopted: AdoptedEndpoint
declare const adoptedOnly: AdoptedOnly

describe('AdmittedEndpoint', () => {
  it('is not assignable from an adopted endpoint', () => {
    expectTypeOf(adopted).not.toMatchTypeOf<AdmittedEndpoint>()
    // @ts-expect-error an adopted endpoint is not admitted
    const forged: AdmittedEndpoint = adopted
    void forged
  })

  it('is not assignable from an adopted-only token', () => {
    expectTypeOf(adoptedOnly).not.toMatchTypeOf<AdmittedEndpoint>()
    // @ts-expect-error adoption alone is not admission
    const forged: AdmittedEndpoint = adoptedOnly
    void forged
  })

  it('is not assignable from a literal that spreads a token', () => {
    // @ts-expect-error the brands are module-private symbols; no literal carries them
    const forged: AdmittedEndpoint = { ...adoptedOnly }
    void forged
  })

  it('is assignable to an adopted-only token and to an adopted endpoint', () => {
    expectTypeOf<AdmittedEndpoint>().toMatchTypeOf<AdoptedOnly>()
    expectTypeOf<AdmittedEndpoint>().toMatchTypeOf<AdoptedEndpoint>()
  })
})

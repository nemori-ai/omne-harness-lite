// Type tests: the capability tokens of the gate cannot be written as literals or built from an
// adopted endpoint; an adopted-only token is not an admitted one; only `admit` grants admission.
// The scope of the table is handed out as a view that can only take work: nobody outside the
// table can exit it, and the bounded wait takes only that view.
import { describe, expectTypeOf, it } from 'vitest'
import type { AdoptedEndpoint } from '@omne-harness/mcp-contract/provider'
import type { AdmittedEndpoint, AdoptedOnly } from '../src/internal/gate.ts'
import type { within } from '../src/internal/port.ts'
import type { Spawn, TaskScope } from '../src/internal/scope.ts'
import type { ConnectionTable, TableRuntime } from '../src/internal/table.ts'

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

describe('the scope of the connection table', () => {
  it('is handed out as the spawn view only; exit stays with the table', () => {
    type Shared = ConnectionTable<unknown>['runtime']['scope']
    expectTypeOf<Shared>().toEqualTypeOf<Spawn>()
    expectTypeOf<keyof Shared>().toEqualTypeOf<'spawn'>()
    expectTypeOf<Shared>().not.toHaveProperty('exit')
    expectTypeOf<Shared>().not.toMatchTypeOf<TaskScope>()
  })

  it('is created by the table: the runtime it is given has no scope', () => {
    expectTypeOf<keyof TableRuntime>().toEqualTypeOf<'startBound' | 'afterExit'>()
  })

  it('is what within takes: the spawn view, not a whole scope', () => {
    expectTypeOf<Parameters<typeof within>[2]>().toEqualTypeOf<Spawn>()
  })
})

import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  RuntimeContextAuthority,
  RuntimeContextTrust,
  ScopeBindingSource,
} from '@omne-harness/runtime-context-contract'
import * as root from '@omne-harness/runtime-context-contract'
import * as testing from '@omne-harness/runtime-context-contract/testing'
import {
  createTestRuntimeContextTrust,
  runtimeContextTrustConformance,
  runConformanceCase,
  RUNTIME_CONTEXT_TRUST_OBLIGATIONS,
} from '@omne-harness/runtime-context-contract/testing'
import type {
  RuntimeContextTrustControls,
  RuntimeContextTrustFixture,
} from '@omne-harness/runtime-context-contract/testing'

const first = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
const second = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000001',
  }),
)
if (!first.ok || !second.ok) throw new Error('Invalid fixture tenant')
const tenant = first.value,
  otherTenant = second.value

type Input = Readonly<{ authority: RuntimeContextAuthority<string>; bindings: ScopeBindingSource }>
type Made = Readonly<{ trust: RuntimeContextTrust<string>; controls: RuntimeContextTrustControls }>
function fixtureOf(create: (input: Input) => Made): RuntimeContextTrustFixture<string> {
  return { create, tenant, otherTenant, principal: 'suite' }
}
const honest = (input: Input): Made => createTestRuntimeContextTrust<string>(input)

/** Names of the cases that fail for a fixture. Every other case must pass. */
async function failures(fixture: RuntimeContextTrustFixture<string>): Promise<string[]> {
  const failed: string[] = []
  for (const c of runtimeContextTrustConformance<string>()) {
    try {
      await runConformanceCase(c, fixture)
    } catch {
      failed.push(c.name)
    }
  }
  return failed.sort()
}

describe('the fixed double satisfies the whole suite', () => {
  for (const c of runtimeContextTrustConformance<string>())
    it(c.name, async () => {
      const verdict = await runConformanceCase(c, fixtureOf(honest))
      // The double never passes the known-gap case (#677); the other seventeen pass.
      expect(verdict).toEqual(
        c.name === 'async-notification-pending-revoked'
          ? { kind: 'not-applicable', handle: 'synchronous revocation source (known gap #677)' }
          : { kind: 'passed' },
      )
    })
})

it('lists every obligation once, and the suite runs exactly that list', () => {
  const names = runtimeContextTrustConformance<string>().map(c => c.name)
  expect(names).toEqual([...RUNTIME_CONTEXT_TRUST_OBLIGATIONS])
  expect(new Set(names).size).toBe(names.length)
})

describe('a fixture that breaks one rule fails only the cases of that rule', () => {
  function ignoring(name: keyof RuntimeContextTrustControls) {
    return (input: Input): Made => {
      const made = honest(input)
      return { ...made, controls: { ...made.controls, [name]: () => undefined } }
    }
  }
  const controlCases: readonly (readonly [keyof RuntimeContextTrustControls, string[]])[] = [
    [
      'revokeAuthorization',
      [
        'authorization-revocation-synchronous',
        'authorization-revocation-scoped',
        'revocation-during-await-discarded',
        'revocation-during-original-answer',
      ],
    ],
    [
      'revokeWork',
      [
        'work-revocation-synchronous',
        'work-revocation-scoped',
        'work-revocation-during-await-discarded',
        'revocation-during-original-answer',
      ],
    ],
    [
      'advanceRequestGeneration',
      [
        'request-generation-synchronous',
        'request-generation-scoped',
        'request-replacement-old-disclosure-refused',
        'revocation-during-original-answer',
      ],
    ],
    [
      'advanceBridgeGeneration',
      [
        'bridge-invalidates-while-original-current',
        'bridge-generation-scoped',
        'bridge-unload-late-callback-discarded',
        'revocation-during-original-answer',
      ],
    ],
  ]
  for (const [control, expected] of controlCases)
    it(`a ${String(control)} control that invalidates nothing`, async () => {
      expect(await failures(fixtureOf(ignoring(control)))).toEqual([...expected].sort())
    })

  it('a bridge that takes its generations after the original port answered', async () => {
    const late = (input: Input): Made => {
      const { authority } = input
      const gen = { n: 0 }
      const wrap = <D extends { kind: string }>(d: D): D => {
        if (d.kind !== 'authorized') return d
        const seen = gen.n
        const original = (d as unknown as { current(): boolean }).current
        return { ...d, current: () => original() && seen === gen.n }
      }
      const bump = () => void gen.n++
      return {
        trust: {
          bindings: input.bindings,
          authority: {
            holder: async (p, a) => wrap(await authority.holder(p, a)),
            producer: async (p, a) => wrap(await authority.producer(p, a)),
            reader: async (p, e) => wrap(await authority.reader(p, e)),
          },
        },
        controls: {
          revokeAuthorization: bump,
          revokeWork: bump,
          advanceRequestGeneration: bump,
          advanceBridgeGeneration: bump,
        },
      }
    }
    expect(await failures(fixtureOf(late))).toContain('revocation-during-original-answer')
  })

  it('a bridge whose bridge control moves the request generation instead', async () => {
    const crossed = (input: Input): Made => {
      const made = honest(input)
      return {
        ...made,
        controls: {
          ...made.controls,
          advanceBridgeGeneration: made.controls.advanceRequestGeneration,
        },
      }
    }
    expect(await failures(fixtureOf(crossed))).toEqual([
      'bridge-generation-scoped',
      'revocation-during-original-answer',
    ])
  })

  it('a bridge that drops the original current()', async () => {
    const dropped = (input: Input): Made => {
      const { authority } = input
      const strip = <D extends { kind: string }>(d: D): D =>
        d.kind === 'authorized' ? { ...d, current: () => true } : d
      return honest({
        bindings: input.bindings,
        authority: {
          holder: async (p, a) => strip(await authority.holder(p, a)),
          producer: async (p, a) => strip(await authority.producer(p, a)),
          reader: async (p, e) => strip(await authority.reader(p, e)),
        },
      })
    }
    expect(await failures(fixtureOf(dropped))).toEqual(['original-current-false-refused'])
  })

  it('a bridge that caches the first binding of a scope', async () => {
    const caching = (input: Input): Made => {
      const seen = new Map<string, ReturnType<ScopeBindingSource['lookup']>>()
      return honest({
        authority: input.authority,
        bindings: {
          lookup(scope) {
            const hit = seen.get(scope.ref) ?? input.bindings.lookup(scope)
            seen.set(scope.ref, hit)
            return hit
          },
        },
      })
    }
    expect(await failures(fixtureOf(caching))).toEqual(['scope-rebind-refused'])
  })

  it('a bridge that reads unknown as unbound', async () => {
    const lenient = (input: Input): Made =>
      honest({
        authority: input.authority,
        bindings: {
          async lookup(scope) {
            const answer = await input.bindings.lookup(scope)
            return answer.kind === 'unknown' ? { kind: 'unbound' } : answer
          },
        },
      })
    expect(await failures(fixtureOf(lenient))).toEqual(['recovery-source-unknown'])
  })

  it('a bridge that accepts a forged first binding', async () => {
    const forged = (input: Input): Made =>
      honest({
        authority: input.authority,
        bindings: {
          async lookup(scope) {
            return scope.ref.startsWith('foreign')
              ? { kind: 'bound', tenant }
              : input.bindings.lookup(scope)
          },
        },
      })
    expect(await failures(fixtureOf(forged))).toEqual(['cross-tenant-zero-source-calls'])
  })
})

describe('the fixed double is a test double only', () => {
  it('is exported from testing and never from the root entry', () => {
    expect(Object.keys(root)).not.toContain('createTestRuntimeContextTrust')
    expect(Object.keys(testing)).toContain('createTestRuntimeContextTrust')
  })
  it('declares that it keeps nothing durable', () => {
    const { authority, bindings } = testing.createTestAuthorityPorts<string>()
    expect(createTestRuntimeContextTrust<string>({ authority, bindings }).durability).toBe('none')
  })
})

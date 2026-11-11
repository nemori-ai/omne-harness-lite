// The call identity (SPEC "调用身份"): purpose, consumption position and candidate. `callIdentity`
// is the one way to take it, and group one of the preparation key is taken through it.
import { describe, expect, it } from 'vitest'
import {
  callIdentity,
  type AssemblyCall,
  type AssemblyResult,
} from '@omne-harness/request-context-contract'
import { createAssemblyFixture } from '@omne-harness/request-context-contract/testing'

function candidate(result: AssemblyResult) {
  if (result.kind !== 'candidate-before-extension' && result.kind !== 'candidate-fixable')
    throw new Error(result.kind)
  return result.candidate
}

describe('callIdentity', () => {
  it('is the purpose, position and candidate of the call, without its access', () => {
    const call = createAssemblyFixture().call
    const { access: _, ...rest } = call
    expect(callIdentity(call)).toEqual(rest)
    expect(Object.keys(callIdentity(call)).sort()).toEqual(['candidate', 'position', 'purpose'])
  })

  it('separates calls that differ in any one of the three items', () => {
    const call: AssemblyCall<unknown> = createAssemblyFixture().call
    const others: readonly AssemblyCall<unknown>[] = [
      { ...call, purpose: 'extension' },
      { ...call, position: 'position_other' as AssemblyCall<unknown>['position'] },
      { ...call, candidate: 'candidate_other' as AssemblyCall<unknown>['candidate'] },
    ]
    for (const other of others) expect(callIdentity(other)).not.toEqual(callIdentity(call))
    expect(callIdentity({ ...call, access: { ...call.access, principal: 'other' } })).toEqual(
      callIdentity(call),
    )
  })

  it('is group one of the preparation key', async () => {
    const f = createAssemblyFixture()
    const result = candidate(await f.operations().assemble(f.call))
    expect(result.preparation.key.identity).toEqual(callIdentity(f.call))
  })
})

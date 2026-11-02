// The reader eligibility handoff: the five results of `current`, the tenant check, the Cordis key,
// and the handoff suite run against the scripted double.
import { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeScopeRef,
  type EligibilityId,
  type ReaderEligibilityRequest,
  type ReaderEligibilityResult,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextReaderEligibilityService,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  createScriptedReaderEligibility,
  readerEligibilityConformance,
} from '@omne-harness/runtime-context-cordis-contract/testing'
import { describe, expect, it } from 'vitest'

function tenant(account: string): TenantId {
  const decoded = tenantCodec.parse(
    JSON.stringify({ organization: 'org_00000000000000000000000000', account }),
  )
  if (!decoded.ok) throw new Error('Invalid fixture tenant')
  return decoded.value
}
function scope(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if ('failure' in decoded) throw new Error('Invalid fixture scope')
  return decoded.ok
}

const tenantA = tenant('acc_00000000000000000000000000')
const tenantB = tenant('acc_11111111111111111111111111')
const session = scope('session-1')
const held: EligibilityId = { eligibility: 'eligibility-1' }
const request: ReaderEligibilityRequest<string> = {
  principal: 'principal-a',
  tenant: tenantA,
  scope: session,
  consumer: 'model',
}

function answering(result: ReaderEligibilityResult) {
  return createScriptedReaderEligibility<string>({
    scopes: [{ scope: session, tenant: tenantA }],
    answers: [{ request, result }],
  })
}

describe('the five results of current', () => {
  it('returns the current eligibility the holder answers', async () => {
    expect(await answering({ kind: 'current', eligibility: held }).current(request)).toEqual({
      kind: 'current',
      eligibility: held,
    })
  })
  it('returns absent when the holder holds no eligibility and issues none', async () => {
    expect(await answering({ kind: 'absent' }).current(request)).toEqual({ kind: 'absent' })
  })
  it('returns refused when the holder refuses the principal', async () => {
    expect(await answering({ kind: 'refused' }).current(request)).toEqual({ kind: 'refused' })
  })
  it('returns unknown when the holder cannot tell', async () => {
    expect(await answering({ kind: 'unknown' }).current(request)).toEqual({ kind: 'unknown' })
  })
  it('returns unavailable when the holder cannot answer now', async () => {
    const result = await answering({ kind: 'unavailable', diagnostic: 'holder offline' }).current(
      request,
    )
    expect(result).toEqual({ kind: 'unavailable', diagnostic: 'holder offline' })
  })
})

describe('the scripted handoff', () => {
  it('refuses another tenant even when the script lists an answer for it', async () => {
    const foreign: ReaderEligibilityRequest<string> = { ...request, tenant: tenantB }
    const handoff = createScriptedReaderEligibility<string>({
      scopes: [{ scope: session, tenant: tenantA }],
      answers: [
        { request, result: { kind: 'current', eligibility: held } },
        { request: foreign, result: { kind: 'current', eligibility: held } },
      ],
    })
    expect(await handoff.current(foreign)).toEqual({ kind: 'refused' })
    expect(await handoff.current(request)).toEqual({ kind: 'current', eligibility: held })
  })
  it('answers unavailable for a request the script does not list', async () => {
    const handoff = answering({ kind: 'current', eligibility: held })
    const result = await handoff.current({ ...request, consumer: 'tool' })
    expect(result.kind).toBe('unavailable')
  })
})

describe('readerEligibilityConformance against the scripted handoff', () => {
  const cases = readerEligibilityConformance<string>({
    handoff: answering({ kind: 'current', eligibility: held }),
    held: { request, eligibility: held },
    otherTenant: tenantB,
  })
  it('names one case for each handoff rule', () => {
    expect(cases.map(item => item.name)).toEqual([
      'held-eligibility-is-current',
      'other-tenant-is-refused',
      'other-consumer-gets-no-held-eligibility',
    ])
  })
  for (const item of cases) it(item.name, () => item.run())
})

describe('the runtimeContextReaderEligibility key', () => {
  class Handoff extends RuntimeContextReaderEligibilityService<string> {
    readonly script = answering({ kind: 'current', eligibility: held })
    current(input: ReaderEligibilityRequest<string>) {
      return this.script.current(input)
    }
  }
  it('loads a subclass under the key and reaches it from an injecting plugin', async () => {
    expect(runtimeContextReaderEligibilityKey).toBe(RuntimeContextReaderEligibilityService.provide)
    expect(runtimeContextReaderEligibilityKey).toBe('runtimeContextReaderEligibility')
    const ctx = new Context()
    const provider = await ctx.plugin(Handoff)
    let answer: ReaderEligibilityResult | undefined
    await ctx.plugin({
      name: 'reader-builder',
      inject: [runtimeContextReaderEligibilityKey],
      async apply(inner) {
        answer = await inner.runtimeContextReaderEligibility.current(request)
      },
    })
    expect(answer).toEqual({ kind: 'current', eligibility: held })
    await provider.dispose()
    expect(ctx.get(runtimeContextReaderEligibilityKey)).toBeUndefined()
  })
})

// Self-proof of the ToolResultReceiver suite: it passes on the conforming double, and each case
// fails under a violating variant. The variants wrap `push` of the double at the port boundary;
// they live here and are not exported.
import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeToolInvocationRef,
  readToolInvocationRef,
} from '@omne-harness/tool-contract/provider'
import {
  encodeToolInvocationRef,
  type ToolDelivery,
  type ToolResultReceiver,
  type ToolSavedReceipt,
} from '@omne-harness/tool-contract'
import {
  createMemoryToolResultReceiver,
  memoryToolResultReceiverFixture,
  toolResultReceiverConformance,
} from '@omne-harness/tool-contract/testing'
import {
  expectEveryCaseIsCaught,
  itFailsExactly,
  itPassesLegal,
  judge,
  type Variant,
} from './conformance-harness.ts'
import {
  oneTenantReceiver,
  receiverWithoutCapacity,
  type Fixture,
} from './result-receiver-legal.ts'
import { evidence } from './tool-values.ts'

const NAMES = {
  R1: 'a legal push returns saved with its key and the consumer owner as evidence owner',
  R2: 'a push of the same key and content recalls the original receipt',
  R3: 'a push of the same key with other content is a conflict that keeps the original',
  R4: 'the receiver keeps its own copy of the payload',
  R5: 'a reference of another tenant is denied and saves nothing',
  R6: 'the tenant of the reference is part of the key',
  R7: 'a malformed reference is invalid',
  R8: 'the relation table rejects another revision and another call',
  R9: 'an aborted signal cancels a new key and still recalls a saved one',
  R10: 'one tenant at its capacity is backpressured without blocking another',
} as const

type Receiver = ToolResultReceiver<string, ContentBlock>
type Push = Receiver['push']

/** The double with `push` replaced by `build(real)`. */
function variant(build: (real: Push, fixture: Fixture) => Push): () => Fixture {
  return () => {
    const base = memoryToolResultReceiverFixture()
    return { ...base, receiver: { push: build(input => base.receiver.push(input), base) } }
  }
}

/** The delivery with its reference re-encoded under `tenant`. */
function underTenant(
  delivery: ToolDelivery<ContentBlock>,
  tenant: Fixture['access']['tenant'],
): ToolDelivery<ContentBlock> {
  // A malformed reference stays as it is: only a legal one is re-encoded.
  if ('failure' in decodeToolInvocationRef(delivery.key.reference)) return delivery
  const parts = readToolInvocationRef(delivery.key.reference)
  const encoded = encodeToolInvocationRef({ ...parts, tenant })
  if (!('ok' in encoded)) throw new Error('the reference does not encode')
  return {
    ...delivery,
    key: { ...delivery.key, reference: encoded.ok },
  } as ToolDelivery<ContentBlock>
}

const fakeReceipt = (delivery: ToolDelivery<ContentBlock>): ToolSavedReceipt => ({
  key: delivery.key,
  evidence: { ...evidence('fake'), owner: delivery.consumer.owner },
})

const variants: readonly Variant<Fixture>[] = [
  {
    name: 'the receiver owns the evidence itself',
    fails: [NAMES.R1],
    fixture: variant(real => async input => {
      const answer = await real(input)
      if ('failure' in answer) return answer
      return succeed({ ...answer.ok, evidence: { ...answer.ok.evidence, owner: 'receiver' } })
    }),
  },
  {
    name: 'every push mints a fresh receipt',
    fails: [NAMES.R2, NAMES.R3, NAMES.R4, NAMES.R9, NAMES.R10],
    fixture: variant(real => {
      let pushes = 0
      return async input => {
        pushes += 1
        const answer = await real(input)
        if ('failure' in answer) return answer
        return succeed({
          ...answer.ok,
          evidence: { ...answer.ok.evidence, digest: `sha256:fresh-${pushes}` },
        })
      }
    }),
  },
  {
    name: 'other content under a saved key is taken as saved',
    fails: [NAMES.R3],
    fixture: variant(real => async input => {
      const answer = await real(input)
      if ('failure' in answer && answer.failure.kind === 'conflict')
        return succeed(fakeReceipt(input.delivery))
      return answer
    }),
  },
  {
    name: 'the receiver keeps the object of the caller',
    fails: [NAMES.R4],
    fixture: variant(real => {
      const kept = new Map<string, ToolDelivery<ContentBlock>>()
      return async input => {
        const name = JSON.stringify(input.delivery.key)
        const earlier = kept.get(name)
        if (earlier !== undefined && !isDeepStrictEqual(earlier, input.delivery))
          return fail({ kind: 'conflict' })
        kept.set(name, input.delivery)
        return real(input)
      }
    }),
  },
  {
    name: 'the tenant comes from the access, not from the reference',
    fails: [NAMES.R5],
    fixture: variant(
      real => input =>
        real({ ...input, delivery: underTenant(input.delivery, input.access.tenant) }),
    ),
  },
  {
    name: 'the key leaves out the tenant',
    fails: [NAMES.R5, NAMES.R6, NAMES.R10],
    fixture: variant(
      (real, fixture) => input =>
        real({
          ...input,
          access: fixture.access,
          delivery: underTenant(input.delivery, fixture.access.tenant),
        }),
    ),
  },
  {
    name: 'a malformed reference is denied',
    fails: [NAMES.R7],
    fixture: variant(real => async input => {
      const answer = await real(input)
      if (
        'failure' in answer &&
        answer.failure.kind === 'invalid' &&
        answer.failure.field === 'key.reference'
      )
        return fail({ kind: 'denied' })
      return answer
    }),
  },
  {
    name: 'the relation table is not checked',
    fails: [NAMES.R8],
    fixture: variant(real => async input => {
      const answer = await real(input)
      if (
        'failure' in answer &&
        answer.failure.kind === 'invalid' &&
        answer.failure.field !== 'key.reference'
      )
        return succeed(fakeReceipt(input.delivery))
      return answer
    }),
  },
  {
    name: 'the signal is ignored',
    fails: [NAMES.R9],
    fixture: variant(real => input => real({ ...input, signal: new AbortController().signal })),
  },
  {
    name: 'the capacity is not kept',
    fails: [NAMES.R10],
    fixture: () => ({
      ...memoryToolResultReceiverFixture(),
      receiver: createMemoryToolResultReceiver<string>({
        owner: 'conformance-receiver',
        tenantCapacity: 100,
      }),
    }),
  },
  {
    name: 'one bucket holds the keys of every tenant',
    fails: [NAMES.R10],
    fixture: variant(real => {
      let held = 0
      return async input => {
        if (held >= 2 && !input.signal.aborted) {
          const answer = await real({ ...input, signal: AbortSignal.abort() })
          // A saved key is still recalled; only a new key meets the shared bucket.
          if ('failure' in answer && answer.failure.kind === 'cancelled-before-accept')
            return fail({ kind: 'backpressured', resource: 'records' })
          return answer
        }
        const answer = await real(input)
        if ('ok' in answer) held += 1
        return answer
      }
    }),
  },
]

describe('ToolResultReceiver conformance suite', () => {
  const cases = toolResultReceiverConformance<string>()

  it('lists the cases in the order of the violation map, each naming the push section', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    for (const item of cases) expect(item.clause).toBe('结果推送与保存')
  })

  it('passes on the conforming double with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolResultReceiverFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, variants)
  })

  itFailsExactly(cases, variants)

  itPassesLegal(cases, [
    {
      name: 'one tenant only',
      fixture: oneTenantReceiver,
      notApplicable: {
        [NAMES.R5]: 'otherAccess',
        [NAMES.R6]: 'otherAccess',
        [NAMES.R10]: 'otherAccess',
      },
    },
    {
      name: 'capacity not told',
      fixture: receiverWithoutCapacity,
      notApplicable: { [NAMES.R10]: 'tenantCapacity' },
    },
  ])
})

// The holder sources suite run against the in-memory holder double: four parts and the five lease
// properties of `contextHolderSources`. Each case is red when the double breaks its clause.
import { tenantEquals } from '@omne-harness/legal-identity'
import type {
  Access,
  ContextHolderParts,
  DurableEvidence,
  HistoryEvidence,
  SourceRead,
} from '@omne-harness/request-context-cordis-contract'
import {
  contextHolderSourcesConformance,
  createMemoryContextHolder,
  type ContextHolderSourcesFixture,
} from '@omne-harness/request-context-cordis-contract/testing'
import { createAssemblyFixture } from '@omne-harness/request-context-contract/testing'
import { describe, expect, it } from 'vitest'

const durable: DurableEvidence = {
  owner: 'holder-suite',
  record: 'history-head',
  revision: '1',
  digest: 'digest-1',
}

function memoryHolderFixture(): ContextHolderSourcesFixture<string> {
  return {
    async start(ctx) {
      const f = createAssemblyFixture()
      const evidence: HistoryEvidence = f.history.evidence()
      let admitted: readonly Access<string>[] = [f.call.access]
      const resolveHistory = async (): Promise<SourceRead<HistoryEvidence>> => ({
        kind: 'value',
        value: evidence,
      })
      const holder = createMemoryContextHolder<string>({
        parts: {
          history: f.sources.history,
          adopted: f.sources.adopted,
          eligibility: f.sources.eligibility,
          resolveHistory,
        },
        admits: access =>
          admitted.some(
            entry =>
              entry.principal === access.principal && tenantEquals(entry.tenant, access.tenant),
          ),
      })
      const fiber = await ctx.plugin(holder.plugin)
      return {
        access: f.call.access,
        stop: () => fiber.dispose(),
        readsClosed: () => holder.readsClosed,
        revoke(access) {
          admitted = admitted.filter(
            entry =>
              entry.principal !== access.principal || !tenantEquals(entry.tenant, access.tenant),
          )
        },
        calls: {
          history: {
            call: (parts: ContextHolderParts<string>, access) =>
              parts.history.read({ access, evidence, cursor: null, budgetBytes: 1 << 20 }),
            admitted: 'page',
          },
          adopted: {
            call: (parts: ContextHolderParts<string>, access) =>
              parts.adopted.readCount({ access, target: f.target }),
            admitted: 'value',
          },
          eligibility: {
            call: (parts: ContextHolderParts<string>, access) =>
              parts.eligibility.check({ access, target: f.target, operation: 'history' }),
            admitted: 'allowed',
          },
          resolveHistory: {
            call: (parts: ContextHolderParts<string>, access) =>
              parts.resolveHistory({ access, evidence: durable }),
            admitted: 'value',
          },
        },
      }
    },
  }
}

describe('contextHolderSources conformance against the memory holder', () => {
  const cases = contextHolderSourcesConformance(memoryHolderFixture())
  it('names one case for each part and each lease property', () => {
    expect(cases.map(item => item.name)).toEqual([
      'history-part-answers-through-the-lease',
      'adopted-part-answers-through-the-lease',
      'eligibility-part-answers-through-the-lease',
      'resolve-history-part-answers-through-the-lease',
      'lease-release-can-be-called-again',
      'release-pulls-the-settlement',
      'reads-stay-open-until-the-settlement-ends',
      'borrower-unload-ends-the-lease',
      'holder-stop-waits-for-an-unloading-borrower',
      'every-call-checks-the-current-access',
    ])
  })
  for (const item of cases) it(item.name, () => item.run())
})

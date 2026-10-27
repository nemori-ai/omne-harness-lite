import { expectTypeOf, it } from 'vitest'
import type {
  ModelPreparationLease,
  ModelPreparationResources,
  ModelProfile,
  ModelRequestRules,
  PreparationLineage,
} from '@omne-harness/model-contract'
import type {
  ModelContentAuthority,
  ModelProfileSnapshot,
  ModelProfileSource,
} from '@omne-harness/model-contract/provider'
import {
  adoption,
  budget,
  call,
  counting,
  evidence,
  json,
  message,
  parameterAdoption,
  supplier,
  tenant,
} from './values.ts'

declare const profile: ModelProfile

const snapshot: ModelProfileSnapshot = {
  precedence: [{ kind: 'factory' }, { kind: 'tenant', tenant }],
  candidates: [{ profile, excluded: false, locked: false, credential: 'available' }],
  source: evidence,
}
const rules: ModelRequestRules = {
  plan: () => ({
    ok: {
      parameters: [parameterAdoption],
      representation: {
        adoption,
        tokenInput: json,
        media: [],
        kind: 'materialized',
        requestBytes: '1',
      },
    },
  }),
}

it('a profile snapshot carries the precedence, the candidates and the source', () => {
  // @ts-expect-error a snapshot needs its source evidence
  const noSource: ModelProfileSnapshot = { ...snapshot, source: undefined }
  // @ts-expect-error a candidate needs its credential state
  const noState: ModelProfileSnapshot['candidates'] = [{ profile, excluded: false, locked: false }]
  void [noSource, noState]
})

it('adapters can implement the source, the rules and the resources from the contract alone', () => {
  const source: ModelProfileSource<string> = { read: async () => ({ ok: snapshot }) }
  const lease: ModelPreparationLease = {
    bindings: [{ supplier, rules, meter: { basis: counting, measure: () => ({ ok: budget }) } }],
    release: async () => ({}),
  }
  const resources: ModelPreparationResources<string> = { acquire: async () => ({ ok: lease }) }
  void [source, resources]
})

it('a preparation lease needs at least one binding', () => {
  // @ts-expect-error a lease without bindings
  const empty: ModelPreparationLease = { bindings: [], release: async () => ({}) }
  void empty
})

it('a lease release returns its result, and a failed release hook is a value', () => {
  type Released = Awaited<ReturnType<ModelPreparationLease['release']>>
  expectTypeOf<Released>().not.toBeVoid()
  const clean: Released = {}
  const failed: Released = {
    failure: {
      kind: 'unavailable',
      dependency: 'tokenizer',
      diagnostic: 'the release hook failed',
    },
  }
  const noValue: ModelPreparationLease = {
    bindings: [{ supplier, rules, meter: { basis: counting, measure: () => ({ ok: budget }) } }],
    // @ts-expect-error a release that gives back nothing leaves a failure only a throw can report
    release: async () => {},
  }
  const other: Released = {
    // @ts-expect-error only an unavailable failure belongs to a release
    failure: { kind: 'denied', action: 'release' },
  }
  void [clean, failed, noValue, other]
})

it('the content authority answers with a closed treatment', () => {
  const authority: ModelContentAuthority<string> = {
    check: async () => ({ ok: { treatment: 'tool-ref' } }),
  }
  const wrong: ModelContentAuthority<string> = {
    // @ts-expect-error an unlisted treatment
    check: async () => ({ ok: { treatment: 'skip' } }),
  }
  void [authority, wrong]
})

it('a lineage is declared once at acquire, both parts optional, and the lease stays the same type', () => {
  const continued: PreparationLineage = { continues: call }
  const sourced: PreparationLineage = { sources: [{ message: message.id, call }] }
  const empty: PreparationLineage = {}
  // @ts-expect-error a source is keyed by a message identity, not by a position
  const positional: PreparationLineage = { sources: [{ message: 0, call }] }
  const resources: ModelPreparationResources<string> = {
    acquire: async input => {
      const lineage: PreparationLineage | undefined = input.lineage
      void lineage
      return {
        ok: {
          bindings: [
            { supplier, rules, meter: { basis: counting, measure: () => ({ ok: budget }) } },
          ],
          release: async () => ({}),
        },
      }
    },
  }
  void resources.acquire({ principal: 'p', tenant, profile })
  void resources.acquire({ principal: 'p', tenant, profile, lineage: continued })
  // @ts-expect-error the lineage is not a measure input
  void rules.plan({ profile, supplier, assembled: undefined, lineage: continued })
  void [sourced, empty, positional]
})

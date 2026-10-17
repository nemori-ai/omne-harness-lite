import { it } from 'vitest'
import type {
  ModelContentAuthority,
  ModelPreparationLease,
  ModelPreparationResources,
  ModelProfile,
  ModelProfileSnapshot,
  ModelProfileSource,
  ModelRequestRules,
} from '@omne-harness/model-contract'
import {
  adoption,
  budget,
  counting,
  evidence,
  json,
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
    release: async () => {},
  }
  const resources: ModelPreparationResources<string> = { acquire: async () => ({ ok: lease }) }
  void [source, resources]
})

it('a preparation lease needs at least one binding', () => {
  // @ts-expect-error a lease without bindings
  const empty: ModelPreparationLease = { bindings: [], release: async () => {} }
  void empty
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

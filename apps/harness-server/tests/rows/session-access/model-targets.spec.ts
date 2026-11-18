import { describe, expect, it } from 'vitest'
import type { ModelProfile, ProfileResolution } from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import {
  SELECTION_REQUIREMENT_SOURCE,
  modelTargetsOf,
  targetOf,
} from '../../../src/rows/session-access/model-targets.ts'

const adoption = {
  owner: 'pi-ai-anthropic',
  name: 'anthropic/claude-sonnet-5',
  revision: '3',
  digest: 'd'.repeat(64),
}
const source = {
  owner: 'model-profiles',
  record: 'snapshot',
  revision: '1',
  digest: 'e'.repeat(64),
}
const profile = { adoption } as unknown as ModelProfile

function resolved(
  changes: Partial<Extract<ProfileResolution, { kind: 'resolved' }>> = {},
): ProfileResolution {
  return {
    kind: 'resolved',
    profile,
    source,
    selectable: true,
    reasons: [],
    credential: 'available',
    shadowed: [],
    ...changes,
  }
}

describe('what a resolved route means for a selection', () => {
  it.each(['unknown-name', 'withdrawn', 'excluded'] as const)(
    'an absent profile (%s) is refused with that reason',
    reason => {
      expect(targetOf({ kind: 'absent', reason })).toEqual({ kind: 'refused', reason })
    },
  )

  it.each(['modality', 'locked', 'scope'] as const)(
    'a profile that is not selectable (%s) is refused with its first reason',
    reason => {
      expect(targetOf(resolved({ selectable: false, reasons: [reason, 'scope'] }))).toEqual({
        kind: 'refused',
        reason,
      })
    },
  )

  it.each([
    ['available', 'available'],
    ['missing', 'missing'],
    ['unreadable', 'unknown'],
    ['unavailable', 'unknown'],
  ] as const)(
    'a selectable profile with a %s credential is selectable, its basis the profile adoption',
    (credential, expected) => {
      expect(targetOf(resolved({ credential }))).toEqual({
        kind: 'selectable',
        credential: expected,
        basis: {
          owner: adoption.owner,
          record: adoption.name,
          revision: '3',
          digest: adoption.digest,
        },
      })
    },
  )
})

describe('the port over the profiles service', () => {
  it('answers no port when the profiles service is absent', () => {
    expect(modelTargetsOf(undefined)).toBeUndefined()
  })

  it('asks for the route with a text requirement, and answers unavailable when Model cannot answer', async () => {
    const asked: unknown[] = []
    let answer: Awaited<ReturnType<ModelProfiles<unknown>['resolve']>> = { ok: resolved() }
    const profiles = {
      resolve: async (input: unknown) => {
        asked.push(input)
        return answer
      },
    } as unknown as ModelProfiles<unknown>
    const port = modelTargetsOf(profiles)
    const call = { principal: { id: 'p' } as never, tenant: 't' as never, route: adoption.name }
    expect((await port?.check(call))?.kind).toBe('selectable')
    expect(asked).toEqual([
      { ...call, required: { modalities: ['text'], source: SELECTION_REQUIREMENT_SOURCE } },
    ])
    answer = { failure: { kind: 'unavailable', dependency: 'model-profiles', diagnostic: 'x' } }
    expect(await port?.check(call)).toEqual({ kind: 'unavailable' })
  })
})

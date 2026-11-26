import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import type { FreezeVerdict, ResidentAdoption, SessionAccess } from '@omne-harness/session-contract'
import type { AdoptionPointInput } from '@omne-harness/tool-cordis-contract/testing'
import {
  createAdoptionPlanner,
  type AdoptionPlannerInput,
} from '../../../src/rows/adoption-sources/planner.ts'

it('consumes the frozen input shape and returns Session material, a freeze naming the tool, with explicit session access', () => {
  type Planner = ReturnType<typeof createAdoptionPlanner<string>>
  type Answer = Outcome<
    Readonly<{
      material: Pick<ResidentAdoption, 'residents' | 'keys'>
      verdict: FreezeVerdict | null
    }>,
    Readonly<{ kind: 'unavailable' }>
  >
  expectTypeOf<AdoptionPlannerInput>().toEqualTypeOf<AdoptionPointInput>()
  expectTypeOf<Parameters<Planner['plan']>[0]>().toEqualTypeOf<SessionAccess<string>>()
  expectTypeOf<Awaited<ReturnType<Planner['plan']>>>().toEqualTypeOf<Answer>()
})

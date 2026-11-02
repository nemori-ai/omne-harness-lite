import { expectTypeOf, it } from 'vitest'
import type { ResidentAdoption, SessionAccess } from '@omne-harness/session-contract'
import type {
  AdoptionPointInput,
  ScriptedAdoptionPoint,
} from '@omne-harness/tool-cordis-contract/testing'
import {
  createAdoptionPlanner,
  type AdoptionPlannerInput,
} from '../../../src/rows/adoption-sources/planner.ts'

it('consumes the frozen input shape and returns Session material with explicit session access', () => {
  type Planner = ReturnType<typeof createAdoptionPlanner<string>>
  type Scripted = ScriptedAdoptionPoint<
    string,
    ResidentAdoption['residents'][number],
    ResidentAdoption['keys'][number]
  >
  expectTypeOf<AdoptionPlannerInput>().toEqualTypeOf<AdoptionPointInput>()
  expectTypeOf<Parameters<Planner['plan']>[0]>().toEqualTypeOf<SessionAccess<string>>()
  expectTypeOf<ReturnType<Planner['plan']>>().toEqualTypeOf<ReturnType<Scripted['plan']>>()
})

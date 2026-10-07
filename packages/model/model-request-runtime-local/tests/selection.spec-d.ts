import { expectTypeOf } from 'vitest'
import type { ModelProfile } from '@omne-harness-lite/model-profile'
import type { ProfileRow } from '@omne-harness-lite/model-profile-directory'
import { legalTargets, displayList, effectiveModel } from '../src/selection.ts'
import {
  type SelectionFact,
  type SelectionCompatibility,
  type LegalTargetsResult,
  type DisplayListResult,
  type EffectiveModelResult,
} from '../src/selection-types.ts'
import type { ModelDisplayEntry } from '@omne-harness-lite/model-request-runtime'

const rows: SelectionFact<readonly ProfileRow[]> = { known: [] }
const compatible: SelectionCompatibility = () => ({ ok: true })
expectTypeOf(
  legalTargets(rows, { known: [] }, { known: [] }, compatible),
).toEqualTypeOf<LegalTargetsResult>()
expectTypeOf(
  displayList(rows, { known: [] }, { known: [] }, compatible, { known: null }, { known: [] }),
).toEqualTypeOf<DisplayListResult>()
expectTypeOf(
  effectiveModel({ known: null }, { known: null }, rows, { known: [] }),
).toEqualTypeOf<EffectiveModelResult>()
expectTypeOf<Parameters<SelectionCompatibility>[0]>().toEqualTypeOf<ModelProfile>()
// @ts-expect-error Unknown is explicit true, never false or an implicit empty set.
const falseUnknown: SelectionFact<readonly ProfileRow[]> = { unknown: false }
// @ts-expect-error Callback implementation is required; no default subset decision.
legalTargets(rows, { known: [] }, { known: [] })
// @ts-expect-error Projection has exactly the four shared modalities.
legalTargets(rows, { known: [] }, { known: ['pdf'] }, compatible)
// @ts-expect-error Rows fact cannot be a credential presence or an unwrapped list.
legalTargets([], { known: [] }, { known: [] }, compatible)
// @ts-expect-error Current evaluation lock is not a boolean flag.
effectiveModel({ known: 'route' }, { known: true }, rows, { known: [] })
// @ts-expect-error Modifying the fact surface is not a supported operation.
rows.known = []
declare const entry: ModelDisplayEntry
// @ts-expect-error Each display entry always includes readonly selected.
entry.selected = false
// @ts-expect-error Successful annotations are readonly.
entry.annotations.push('legal')
// @ts-expect-error Nested profile ref is readonly.
entry.ref.routeName = 'other'
declare const legacy: Omit<ModelProfile, 'adaptation'>
// @ts-expect-error Full profile3 adaptation is required at compatibility boundary.
compatible(legacy, [])
// @ts-expect-error A callback cannot represent incompatibility as ok:false.
const falseAnswer: SelectionCompatibility = () => ({ ok: false })
expectTypeOf(falseUnknown).toEqualTypeOf<SelectionFact<readonly ProfileRow[]>>()
expectTypeOf(falseAnswer).toEqualTypeOf<SelectionCompatibility>()

import type { Adoption, ModelProfileDefinition } from '@omne-harness/model-contract'
import type { PiDecisionsBinding, PiFamily } from '@omne-harness/pi-ai-transport'
import {
  defineDecisionsFamily,
  officialDecisionsProfilesOf,
} from '@omne-harness/pi-ai-transport/family-kit'
import { JEV_OWNER, JEV_RECORDS } from './records.ts'

export { JEV_OWNER, JEV_RECORDS } from './records.ts'

export function createJevFamily(): PiFamily<PiDecisionsBinding> {
  return defineDecisionsFamily({ owner: JEV_OWNER, endpoint: 'decisions', records: JEV_RECORDS })
}

export function officialJevProfiles(
  input: Readonly<{ retryPolicy: Adoption }>,
): readonly ModelProfileDefinition<'decisions'>[] {
  return officialDecisionsProfilesOf(JEV_OWNER, JEV_RECORDS, input)
}

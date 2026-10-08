import type { LocalRecord } from '@omne-harness-lite/client-local-state'
import type {
  PublicHealthOptions,
  PublicHealthOutcome,
} from '@omne-harness-lite/governance-center-entry-https-json'
import type { CliCatalog } from './catalog.ts'
import {
  observeCenterProfile,
  type CenterPreparationOutcome,
  type CenterProfile,
} from './center-preparation.ts'

export type AddCenterOutcome =
  | Exclude<CenterPreparationOutcome, { kind: 'observed' }>
  | {
      readonly kind: 'saved' | 'already-saved' | 'conflict' | 'unconfirmed' | 'cancelled'
      readonly profile: CenterProfile
    }
export interface AddCenterInput {
  readonly name: string
  readonly endpoint: string
  readonly trust: LocalRecord['center']['trust']
}
/** The confirmation sees the exact observed template before any catalog write. */
export async function addCenter(
  catalog: CliCatalog,
  input: AddCenterInput,
  options: Pick<PublicHealthOptions, 'timeoutMs' | 'signal'>,
  confirm: (profile: CenterProfile) => Promise<boolean>,
  health?: (input: PublicHealthOptions) => Promise<PublicHealthOutcome>,
): Promise<AddCenterOutcome> {
  const observed = await observeCenterProfile(
    input.name,
    input.endpoint,
    input.trust,
    options,
    health,
  )
  if (observed.kind !== 'observed') return observed
  // The display callback gets a copy, not the template that will be saved.
  if (!(await confirm(structuredClone(observed.profile))) || options.signal?.aborted)
    return { kind: 'cancelled', profile: observed.profile }
  return { kind: await catalog.registerCenter(observed.profile), profile: observed.profile }
}

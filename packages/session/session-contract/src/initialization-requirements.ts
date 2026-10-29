import type { InitializationPlanItem } from './initialization-plan.ts'
import { initializationKey } from './initialization-plan.ts'
import { InitializationInvalid, evidence, list, object, text } from './initialization-parse.ts'

import type { InitializationRequirement } from './values.ts'
export type { InitializationRequirement } from './values.ts'

function resolution(value: unknown): InitializationRequirement['resolution'] {
  if (typeof value !== 'object' || value === null || !('kind' in value))
    throw new InitializationInvalid('missing requirement resolution kind')
  switch (value.kind) {
    case 'satisfied': {
      const fields = object(value, ['kind', 'evidence'])
      return { kind: 'satisfied', evidence: evidence(fields['evidence']) }
    }
    case 'planned': {
      const fields = object(value, ['kind', 'owner', 'item'])
      return { kind: 'planned', owner: text(fields['owner']), item: text(fields['item']) }
    }
    default:
      throw new InitializationInvalid('unknown requirement resolution kind')
  }
}

export function requirements(value: unknown): readonly InitializationRequirement[] {
  const parsed = list(value, (item): InitializationRequirement => {
    const fields = object(item, ['kind', 'key', 'requirement', 'resolution'])
    const kind = fields['kind']
    if (
      kind !== 'entry-contract' &&
      kind !== 'identity' &&
      kind !== 'context-registration' &&
      kind !== 'workspace-load' &&
      kind !== 'execution-preparation'
    )
      throw new InitializationInvalid('unknown initialization requirement kind')
    return {
      kind,
      key: text(fields['key']),
      requirement: evidence(fields['requirement']),
      resolution: resolution(fields['resolution']),
    }
  })
  if (new Set(parsed.map(item => JSON.stringify([item.kind, item.key]))).size !== parsed.length)
    throw new InitializationInvalid('duplicate initialization requirement')
  return parsed
}

export function validateRequirementPlan(
  values: readonly InitializationRequirement[],
  plan: readonly InitializationPlanItem[],
): void {
  for (const requirement of values) {
    const resolved = requirement.resolution
    if (resolved.kind !== 'planned') continue
    const planned = plan.find(item => initializationKey(item) === initializationKey(resolved))
    if (planned === undefined)
      throw new InitializationInvalid('required source is absent from the original plan')
    const kind = planned.kind === 'execution-adoption' ? 'execution-preparation' : planned.kind
    if (requirement.kind !== 'entry-contract' && requirement.kind !== kind)
      throw new InitializationInvalid('requirement points to another source kind')
  }
  for (const item of plan)
    if (
      !values.some(
        requirement =>
          requirement.resolution.kind === 'planned' &&
          initializationKey(requirement.resolution) === initializationKey(item),
      )
    )
      throw new InitializationInvalid('initialization item has no adopted requirement')
}

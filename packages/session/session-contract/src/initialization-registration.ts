import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionId, SessionOperationId } from './identity.ts'
import { InitializationInvalid, material, object, text } from './initialization-parse.ts'
import { fromJsonValue } from './entries.ts'
import {
  initializationRegistrationCommit,
  sameInitializationValue,
  tenantText,
  type InitializationPlanItem,
} from './initialization-plan.ts'

import type { InitializationRegistration } from './values.ts'
export type { InitializationRegistration } from './values.ts'

export function registration(value: unknown): InitializationRegistration {
  const fields = object(value, [
    'scope',
    'tenant',
    'key',
    'commit',
    'basedOn',
    'revision',
    'creating',
    'required',
    'need',
    'binding',
    'parameters',
  ])
  const basedOn = fields['basedOn']
  const revision = fields['revision']
  if (
    typeof basedOn !== 'number' ||
    !Number.isSafeInteger(basedOn) ||
    basedOn < 0 ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision !== basedOn + 1
  )
    throw new InitializationInvalid('registration requires consecutive safe integer revisions')
  if (fields['creating'] !== true || fields['required'] !== true)
    throw new InitializationInvalid('initial registration must be creating and required')
  return {
    scope: text(fields['scope']),
    tenant: text(fields['tenant']),
    key: text(fields['key']),
    commit: text(fields['commit']),
    basedOn,
    revision,
    creating: true,
    required: true,
    need: material(fields['need']),
    binding: material(fields['binding']),
    parameters: material(fields['parameters']),
  }
}

export function registrationInput(
  value: JsonValue,
): Pick<InitializationRegistration, 'need' | 'binding' | 'parameters'> {
  const fields = object(fromJsonValue(value), ['need', 'binding', 'parameters'])
  return {
    need: material(fields['need']),
    binding: material(fields['binding']),
    parameters: material(fields['parameters']),
  }
}

export function validateRegistrationBinding(
  decision: InitializationRegistration,
  plan: InitializationPlanItem,
  binding: Readonly<{ tenant: TenantId; session: SessionId; createOperation: SessionOperationId }>,
): void {
  if (plan.kind !== 'context-registration')
    throw new InitializationInvalid('registration consequence belongs to another source kind')
  if (decision.tenant !== tenantText(binding.tenant))
    throw new InitializationInvalid('registration belongs to another tenant')
  if (
    decision.commit !==
    initializationRegistrationCommit({ ...binding, owner: plan.owner, item: plan.item })
  )
    throw new InitializationInvalid('registration commit does not identify the original item')
  const { need, binding: needs, parameters } = decision
  if (
    !sameInitializationValue(
      { need, binding: needs, parameters },
      registrationInput(plan.originalInput),
    )
  )
    throw new InitializationInvalid('registration changed the original materials')
}
